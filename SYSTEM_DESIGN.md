# System Design

## Rate calculation engine

`calculateRate(input, config)` is pure and synchronous: a request plus a
plain-data configuration snapshot in, a full breakdown out. `loadRateConfig()`
does the Prisma I/O separately, so the pricing rules are tested against object
literals with no database and no mocking library.

**Every quantity is an integer.** Money is a `bigint` count of minor units,
weight a count of grams, dimensions hundredths of a centimetre. Nothing uses
`number`. The reason is `ceil`. Freight is
`baseRate + perKgRate × ceil(chargeable − baseWeight)`, so a shipment entered as
a round 2 kg against a 1 kg slab should bill exactly one excess kilogram — but
in floating point `2.0 − 1.0` can land on `1.0000000000000002`, and
`Math.ceil` bills two — a whole per-kg rate overcharged on an input that looked
round. Integers make that boundary exact by construction. Values cross
every boundary as decimal **strings**, staying exact from Postgres to JSON.

The formula:

```
volumetric = (L × B × H) / divisor          # divisor default 5000
chargeable = max(actual, volumetric)
freight    = baseRate + perKgRate × ceil(max(0, chargeable − baseWeightKg))
cod        = FIXED ? amount : max(minAmount, freight × percentage / 100)
total      = freight + cod
```

Rounding happens once, where a percentage becomes currency. Failure is typed
and never defaults: a missing COD rule raises rather than becoming a zero
surcharge — a quote that silently undercharges is worse than one that refuses.

## Zone detection

An address resolves through `pincode → Area → Zone`, and rate cards are priced
between zones, so this lookup decides the price.

A pincode may not map to two zones — if it did, the same address could price
differently between requests depending on which row was read first. The admin
API rejects such a write with a 409, and the engine raises
`AMBIGUOUS_PICKUP_PINCODE` rather than taking the first match. Two areas sharing
a pincode *inside* one zone is fine — the answer is unambiguous.

Scope is **derived, never stored as a choice**: same zone is `INTRA`, different
zones `INTER`. A card whose stored scope disagreed with its zone pair could
never match a lookup, so a CHECK constraint enforces the invariant in the
database. Lookup is directional — `NORTH→SOUTH` does not price `SOUTH→NORTH`;
reusing the reverse card would be a pricing decision the engine isn't entitled
to make.

An N-zone grid needs `2 × N²` cards. Adding a zone silently requires
`2 × ((N+1)² − N²)` more, which no individual row reveals — the table looks fine
and the only symptom is an unpriceable order. `config-health` computes coverage
across the whole table and lists every gap.

## Auto-assignment

Given an order's pickup zone, the policy considers agents in that zone who are
`AVAILABLE` and active, and picks whoever has the fewest active orders — ties
break on employee code so the same inputs always give the same agent.

**Load balancing, not proximity** — though the schema carries lat/lng. An
active-order count is derived live from the orders table, whereas coordinates
are nullable and only as fresh as the last check-in; assigning on a stale
position fails *silently* — the dispatch looks reasonable and the parcel is
merely late. Straight-line distance also ignores
the road network, and proximity alone piles work on whoever is closest to a busy
catchment. Zone membership already supplies the geographic constraint.

`selectAgent()` is pure and tested exhaustively. If nobody is eligible the order
is created **unassigned** — status `CREATED`, reason recorded — and surfaced in
the admin queue for manual assignment or a retry.

Known limit: under read-committed isolation, two simultaneous creates can both
see the same agent at the lowest count and pick them — undesirable, not
corrupting, and self-correcting on the next assignment.

## Failed delivery

`FAILED` is reachable only from `IN_TRANSIT` or `OUT_FOR_DELIVERY` — a parcel
must be moving before delivery can fail — and it is **not a closed status**.
Only `DELIVERED` and `CANCELLED` are. Treating `FAILED` as terminal would block
the reassignment that rescheduling depends on.

A failure closes the current `DeliveryAttempt` with its reason and notifies the
customer. The customer — not the agent — picks the new date. Rescheduling opens
the next attempt and **re-runs auto-assignment** rather than handing the order
back: the original agent may now be off shift or busier than a colleague, and a
failed attempt is no evidence they deserve the next one. If nobody is free the
order returns to `CREATED`.

`delivery_attempts` is mutable because it records the *plan*, and plans change.
The immutable record lives in `order_status_history`, which is append-only,
enforced by a Postgres trigger that rejects UPDATE, DELETE and TRUNCATE. A
correction is a new row. One module writes to that table and only ever calls
`create`; the trigger is the safety net, not the mechanism.
