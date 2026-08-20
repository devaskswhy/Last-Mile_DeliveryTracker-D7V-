# Last-Mile Delivery Tracker

Logistics platform for creating delivery orders with auto-calculated charges,
assigning agents, and notifying customers at every status change.

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma 6 · PostgreSQL ·
Zod · bcryptjs · jose.

## Getting started

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL, DIRECT_URL, JWT_SECRET
npm run db:migrate        # apply migrations
npm run db:seed           # seed zones, rate cards, one admin, two agents
npm run dev
```

Generate a `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Configuration model

Pricing is entirely data-driven. No zone, rate or surcharge value appears
anywhere in application code — the tables below are the only source of truth,
and they are edited through the admin UI at `/admin`.

```mermaid
graph LR
  ADDR["Order address<br/>(pincode)"] --> AREA[Area]
  AREA -->|belongs to exactly one| ZONE[Zone]
  ZONE -->|pickup zone| PAIR{{"Zone pair"}}
  ZONE -->|drop zone| PAIR
  PAIR -->|same zone = INTRA<br/>different = INTER| SCOPE[Scope]
  SCOPE --> RC[RateCard]
  OT[Order type<br/>B2B / B2C] --> RC
  OT --> COD[CodSurchargeConfig]
  RC -->|freight| TOTAL[Total charge]
  COD -->|surcharge, if COD| TOTAL
```

### How the pieces relate

**Zone** — the unit that rates are priced between. A zone has a unique `code`
(`NORTH`) used throughout the rate tables and reports.

**Area** — maps a pincode to **exactly one** zone. This is how a pickup or drop
address finds its zone: the address's pincode is looked up here, and the area's
zone becomes the order's zone. A zone has many areas; an area belongs to one
zone.

> A pincode may **not** appear under two different zones. If it did, zone
> detection would depend on which row happened to be read first, and the same
> address would price differently between requests. The API rejects such a write
> with a 409, and the admin overview reports any that already exist. Two areas
> sharing a pincode *within one zone* is fine — the answer is unambiguous.

**RateCard** — one row per `(orderType, scope, fromZone, toZone)`, which is also
its unique key. It carries a `baseRate` covering the first `baseWeightKg`, and a
`perKgRate` for weight beyond that.

> **Scope is derived, never chosen.** A card within one zone is `INTRA`; a card
> between two different zones is `INTER`. The rate lookup computes scope the same
> way from the order's pickup and drop zones, so a row whose stored scope
> disagreed with its zone pair could never be matched — present in the table,
> invisible in practice. The API derives it, and a CHECK constraint
> (`rate_cards_scope_matches_zone_pair`) enforces it against anything that
> bypasses the API.

**CodSurchargeConfig** — one row per order type, applied on top of freight when
an order is paid cash on delivery. Either a `FIXED` amount or a `PERCENTAGE` of
the freight charge with an optional floor. A row carries only the value its mode
uses; the other column is null, enforced by
`cod_surcharge_mode_matches_value`.

### Coverage: how many rate cards you need

With **N** active zones, every ordered pair of zones needs a card for each order
type:

```
required = orderTypes × N²  =  2 × N²

N = 2 →  8 cards   (2 intra + 2 inter, per order type)
N = 3 → 18 cards
N = 4 → 32 cards
```

Adding one zone to an N-zone grid needs `2 × ((N+1)² − N²)` new cards — eight of
them for a third zone. This is the failure that no single row reveals: the table
looks fine, and the only symptom is an order between the new zone and an old one
that cannot be priced.

`GET /api/admin/config-health` and the `/admin` overview compute this across the
whole table and list every gap. The rate-cards screen can create all missing
combinations in one transaction, with rates the admin supplies.

A gap is either **missing** (no row) or **inactive** (a row exists but is
switched off). Both mean the same thing to a lookup, so both are reported.

---

## Rate engine

`src/lib/rate-engine/` prices a shipment. The calculation itself is a **pure,
synchronous function** — same inputs, same output, no I/O — so it is tested
against object literals with no database and no mocking library:

```ts
import { calculateRate, loadRateConfig } from "@/lib/rate-engine";

const config = await loadRateConfig(pickupPincode, dropPincode, orderType); // I/O
const quote = calculateRate(input, config);                                 // pure
```

`loadRateConfig` is the only part that touches Prisma, and it is imported
separately so a consumer that already holds the configuration never pulls the
database in behind it.

### The formula

```
volumetricWeight = (L × B × H) / volumetricDivisor        # divisor default 5000
chargeableWeight = max(actualWeight, volumetricWeight)
billedExcessKg   = ceil(max(0, chargeableWeight − baseWeightKg))
baseCharge       = baseRate + perKgRate × billedExcessKg
codSurcharge     = FIXED ? amount : max(minAmount, baseCharge × percentage / 100)
totalCharge      = baseCharge + codSurcharge
```

### Why the arithmetic is integer

Every quantity is a `bigint` count of its smallest unit — money in minor units
(2 dp), weight in grams (3 dp), dimensions in hundredths of a centimetre.
Nothing uses `number`.

The reason is `ceil`. A shipment entered as a round 2 kg against a 1 kg base
slab should bill exactly one excess kilogram, but in binary floating point
`2.0 − 1.0` can land on `1.0000000000000002`, and `Math.ceil` then bills two —
overcharging a whole per-kg rate on an input that looked perfectly round.
Integers make that boundary exact by construction rather than by luck. Values
cross the module boundary as **decimal strings**, so they stay exact from the
database to the JSON response.

### Failure is typed, never a default

The engine throws `RateEngineError` with a stable `code`. Nothing falls back to
a default — in particular a missing COD rule does **not** become a zero
surcharge, because a quote that silently under-charges is worse than one that
refuses.

| Code | Meaning |
| ---- | ------- |
| `PICKUP_AREA_NOT_FOUND` / `DROP_AREA_NOT_FOUND` | Pincode maps to no active area |
| `PICKUP_ZONE_INACTIVE` / `DROP_ZONE_INACTIVE` | Known address, zone not currently served |
| `AMBIGUOUS_PICKUP_PINCODE` / `AMBIGUOUS_DROP_PINCODE` | Pincode spans two zones — refuses to guess |
| `RATE_CARD_NOT_FOUND` | No card for that order type and zone pair |
| `RATE_CARD_INACTIVE` | A card exists but is switched off |
| `COD_SURCHARGE_NOT_CONFIGURED` / `COD_SURCHARGE_INACTIVE` | COD asked for with no usable rule |
| `COD_SURCHARGE_MISCONFIGURED` | Stored row lacks the value its mode needs |
| `INVALID_MEASUREMENT` | Dimension or weight absent, unparseable, or not positive |

Rate-card lookup is **directional**: `NORTH→SOUTH` is not assumed to price
`SOUTH→NORTH`. Falling back to the reverse card would be a pricing decision the
engine is not entitled to make.

### Quote endpoint

`POST /api/orders/quote` — any signed-in role. Read-only: it creates no order
and no status history, so the order form can call it on every keystroke.

```bash
curl -b jar.txt -X POST http://localhost:3000/api/orders/quote \
  -H 'Content-Type: application/json' \
  -d '{"pickupPincode":"110085","dropPincode":"110017","lengthCm":"50","breadthCm":"50","heightCm":"50","actualWeightKg":"2","orderType":"B2C","paymentType":"COD"}'
```

Returns the full breakdown — both zones with the area each pincode resolved
through, all three weights and which one set the chargeable figure, the rate
card used, an itemised freight derivation, and how the COD surcharge was
computed — enough to render a real quote rather than just a total.

Errors carry their `code` in `error.details`. An unresolvable address answers
**422** (the customer can fix it); a configuration gap answers **409** (only an
admin can), so the frontend can say "we cannot price this route yet" instead of
blaming the address.

### Tests

```bash
npm test          # vitest run
npm run test:watch
```

---

## Admin API

Every route below is ADMIN-only, enforced twice: middleware gates `/api/admin/*`
on the JWT's role, and each handler re-reads the account so a deactivated or
demoted admin is rejected even while holding a valid token.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET / POST | `/api/admin/zones` | List / create zones |
| GET / PATCH / DELETE | `/api/admin/zones/[id]` | Read / update / delete a zone |
| GET / POST | `/api/admin/areas` | List (`?zoneId=`) / create areas |
| GET / PATCH / DELETE | `/api/admin/areas/[id]` | Read / update / delete an area |
| GET / POST | `/api/admin/rate-cards` | List (`?orderType=&scope=`) / create |
| GET / PATCH / DELETE | `/api/admin/rate-cards/[id]` | Read / update rates / delete |
| POST | `/api/admin/rate-cards/bulk` | Create many in one transaction |
| GET / PUT | `/api/admin/cod-surcharges` | List / upsert by order type |
| GET / DELETE | `/api/admin/cod-surcharges/[orderType]` | Read / remove one |
| GET | `/api/admin/config-health` | Coverage gaps and pincode conflicts |

Deletes are refused rather than cascaded when something depends on the row:

- A **zone** referenced by areas, rate cards, agents or orders returns 409 naming
  what is in the way. Deactivate it instead — an inactive zone drops out of
  coverage without disturbing existing orders.
- A **rate card** that priced any order returns 409. Orders snapshot
  `rateCardId` for auditability, and deleting the card would destroy the record
  of how those orders were charged.

---

## Auth API

| Method | Path | Access |
| ------ | ---- | ------ |
| POST | `/api/auth/register` | public (creates a CUSTOMER) |
| POST | `/api/auth/login` | public |
| POST | `/api/auth/logout` | public |
| GET | `/api/me` | any signed-in role |
| GET | `/api/agent/ping` | AGENT, ADMIN |
| GET | `/api/admin/ping` | ADMIN |

```bash
curl -i -c jar.txt -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Customer","email":"you@example.com","password":"Sup3rSecret!"}'

curl -b jar.txt http://localhost:3000/api/me
```

Sessions are HS256 JWTs in an httpOnly, SameSite=Lax cookie. `src/middleware.ts`
gates routes by role on the Edge runtime; route handlers re-verify through
`src/lib/auth/guard.ts`.

---

## Orders and assignment

### Creating an order

Two entry points, one code path: `/orders/new` for a customer, `/admin/orders/new`
for an admin acting on a customer's behalf. Both call `POST /api/orders/quote`
live, render the itemised charge, and require an explicit confirmation step.

The quote is bound to the exact inputs that produced it. Editing any field that
affects the price clears it, so the confirm button can never submit a total the
customer is no longer looking at.

> **Charges are never accepted from the client.** `POST /api/orders` recomputes
> the price server-side with the *same* `calculateRate` the quote endpoint uses.
> The one figure the client sends is `acknowledgedTotal` — required, and used
> only as a claim to verify. If it disagrees with the recomputed price the
> request is refused with `409 QUOTE_STALE` and the fresh quote attached, so a
> rate card edited between quote and confirm cannot silently change what the
> customer agreed to pay, and a tampered payload cannot set its own total.

A `CUSTOMER` may only create their own orders; any `customerId` in their payload
is ignored rather than trusted. An `ADMIN` must name the customer. Agents cannot
create orders at all.

Creation is one transaction: the `Order` row, its `CREATED` history entry, and —
when an agent is found — the assignment and its `ASSIGNED` entry.

### Auto-assignment: fewest active orders

Given an order's pickup zone, the policy considers agents whose `currentZoneId`
is that zone, whose `availability` is `AVAILABLE`, and whose user account is
active. Among those it picks the one with the fewest orders in a status that
still needs work (`ASSIGNED`, `PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`).
Ties break on `employeeCode` so the same inputs always give the same agent.

**Why load balancing rather than nearest by lat/lng**, given the schema carries
`currentLat` / `currentLng`:

1. **The data is always true.** An active-order count is derived from the orders
   table and cannot be stale. Coordinates are nullable and only as fresh as the
   last device check-in — `lastLocationAt` exists precisely because they go
   stale. Assigning on a stale position fails silently: the dispatch looks
   reasonable and the parcel is simply late.
2. **Straight-line distance is not travel distance.** Great-circle metres ignore
   rivers, one-way systems, and an agent already heading the other way.
3. **Proximity alone overloads people.** The closest agent to a busy catchment is
   closest to *every* order in it. Balancing on load is self-correcting: whoever
   takes an order becomes less eligible for the next.

Zone membership already supplies the geographic constraint, so distance would be
refining a choice that is geographically sound to begin with. The coordinates
stay in the schema for a future dispatcher with a real routing service.

`selectAgent()` is a pure function, tested exhaustively without a database.

### When nobody is available

The order is created **unassigned**: status `CREATED`, no agent, and a history
note recording why. It appears in the admin orders screen under a banner
counting how many are waiting. An admin can then assign manually or re-run
auto-assignment on demand once someone frees up.

### Assignment API

`POST /api/admin/orders/[id]/assign` — ADMIN only.

```jsonc
{ "mode": "MANUAL", "agentId": "..." }   // explicit choice
{ "mode": "AUTO" }                        // re-run the policy
```

Manual assignment deliberately ignores availability and zone — that is what an
override is for, and a dispatcher looking at a real situation knows things the
policy does not. The one thing it refuses is a deactivated account.

| Code | Status | Meaning |
| ---- | ------ | ------- |
| `ORDER_NOT_FOUND` / `AGENT_NOT_FOUND` | 404 | No such record |
| `ORDER_TERMINAL` | 409 | Delivered, cancelled or failed — the work is over |
| `ALREADY_ASSIGNED` | 409 | Already that agent; refused so the trail gains no empty row |
| `NO_AGENT_AVAILABLE` | 409 | Auto-assignment found nobody eligible |
| `AGENT_INACTIVE` | 422 | The agent's account is deactivated |

Reassignment does not rewind the workflow: an order already picked up stays
picked up, and only an unassigned one advances to `ASSIGNED`. That keeps each
history row's `status` equal to the order's status at that moment, so the trail
reads as a status log rather than a mix of two things.

### Audit trail

Every creation and every assignment appends to `order_status_history` with
timestamp, actor and actor role. `src/lib/orders/history.ts` is the only module
that writes to that table and it only ever calls `create` — the Postgres trigger
from Phase 1 is the safety net, not the mechanism. A real trail looks like:

```
1. —        → CREATED   Created by the customer
2. CREATED  → ASSIGNED  Auto-assigned to Asha Rane (AGT-001) — strategy FEWEST_ACTIVE_ORDERS
3. ASSIGNED → ASSIGNED  Reassigned from Asha Rane (AGT-001) to Vikram Iyer (AGT-002) — manual assignment by admin
4. ASSIGNED → ASSIGNED  Reassigned from Vikram Iyer (AGT-002) to Asha Rane (AGT-001) — auto-assignment
```

### Order API

| Method | Path | Access |
| ------ | ---- | ------ |
| POST | `/api/orders` | CUSTOMER (own), ADMIN (on behalf) |
| GET | `/api/orders` | Scoped: own / assigned / all |
| GET | `/api/orders/[id]` | Owner, assigned agent, or admin |
| POST | `/api/admin/orders/[id]/assign` | ADMIN |
| GET | `/api/admin/agents` | ADMIN — agents with live workload |
| GET | `/api/admin/customers?q=` | ADMIN — customer search |

Listing is scoped from the re-read session, never from a query parameter: a
customer sees their own orders, an agent sees what is assigned to them, an admin
sees everything.

---

## Notes

`order_status_history` is append-only and enforced by a Postgres trigger —
UPDATE, DELETE and TRUNCATE all raise. Corrections are recorded as new rows.

See [CLAUDE.md](CLAUDE.md) for conventions and the charge-calculation formula.
