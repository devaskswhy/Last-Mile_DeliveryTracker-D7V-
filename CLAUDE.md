# Last-Mile Delivery Tracker

A logistics platform where customers and admins create delivery orders with
auto-calculated charges, agents get assigned, and customers are notified at
every status change.

---

## Non-negotiable rules

> Never add a Co-Authored-By or any Claude/Anthropic/AI attribution line to any
> git commit, comment, or file. Commit author must remain the repo owner only.

Two further rules that the database itself enforces:

1. **`order_status_history` is append-only.** Never write an `update`,
   `updateMany`, `delete`, `deleteMany` or `upsert` against it, anywhere, ever.
   A correction is a *new* row recording the corrected status. A Postgres
   trigger (migration `order_status_history_append_only`) raises on UPDATE,
   DELETE and TRUNCATE, so a mistake fails loudly rather than quietly losing an
   audit trail.
2. **Never commit real secrets.** `.env` is gitignored; `.env.example` carries
   placeholders only. Every new variable must be added to `.env.example` in the
   same commit that starts reading it.
3. **Pricing configuration is data, never code.** No zone name or id, rate,
   weight slab, surcharge amount or percentage may be written into application
   code — not as a constant, a default, a fallback, or a hardcoded branch. All
   of it is read from `zones`, `areas`, `rate_cards` and `cod_surcharge_configs`
   at request time. Seed files are the one exception: they bootstrap a database,
   they are not consulted at runtime.

   The enum *mirrors* in `src/lib/domain/enums.ts` are not a violation. They
   describe the shape of the domain (`B2B` / `B2C`, `INTRA` / `INTER`), which is
   structural, and each is guarded by a `satisfies` check against the Prisma
   enum so it cannot drift.
4. **`FAILED` is not a closed status.** Only `DELIVERED` and `CANCELLED` are.
   A failed delivery is rescheduled into a new attempt, so treating it as
   terminal would block the reassignment that reschedule depends on. Use
   `isClosedStatus()`, never a hand-rolled list.
5. **A price is never accepted from a client.** `POST /api/orders` recomputes
   the charge with the same `calculateRate()` the quote endpoint uses. The
   client sends `acknowledgedTotal` only so the server can *check* it; a
   mismatch is refused with `QUOTE_STALE`. Never persist a charge that arrived
   in a request body.

---

## Tech stack

| Concern     | Choice                                             |
| ----------- | -------------------------------------------------- |
| Framework   | Next.js 14 (App Router) + React 18                 |
| Language    | TypeScript (strict)                                |
| Styling     | Tailwind CSS v3                                    |
| ORM         | Prisma 6                                           |
| Database    | PostgreSQL (Neon)                                  |
| Validation  | Zod 4                                              |
| Passwords   | bcryptjs                                           |
| Sessions    | jose — HS256 JWT in an httpOnly cookie             |
| Seed runner | tsx                                                |

The dependency list is deliberately small. Before adding a package, check
whether the platform already covers it (`fetch`, `crypto.randomUUID`,
`Intl.NumberFormat`, React Server Components). Notes on two choices that look
like they could have gone the other way:

- **`bcryptjs`, not `bcrypt`** — the native module needs a C++ toolchain, which
  makes installs fragile on Windows and in slim CI images. Same hash format.
- **Prisma 6, not 7** — Prisma 7 removes `url` from the schema's `datasource`
  block and requires a driver adapter (`@prisma/adapter-pg` + `pg`). Prisma 6
  needs neither and has no ESM/bundler friction with Next 14.
- **No ESLint** — omitted to keep the package list minimal. Add
  `eslint` + `eslint-config-next` if the team wants it.

---

## Folder conventions

```
prisma/
  schema.prisma          Single source of truth for the data model
  migrations/            Committed, ordered, never edited after they are applied
  seed.ts                Idempotent — safe to re-run (`npm run db:seed`)
src/
  app/                   App Router routes
    api/                 Route handlers (REST)
      auth/              register | login | logout
      me/                Current-user probe
      admin/             Admin config CRUD (zones, areas, rate cards, COD)
      agent/             Role-scoped routes
    admin/               Admin UI — server components read Prisma directly,
                         client components mutate through the admin API
    orders/              Customer order UI (create, list, detail + history)
    agent/               Agent workload UI with status actions
  components/            UI primitives + OrderForm, shared by both surfaces
    login/ forbidden/    Pages that middleware redirects to
  lib/
    api.ts               Shared JSON response envelopes
    env.ts               Zod-validated server env, parsed once at boot
    prisma.ts            PrismaClient singleton (survives dev hot reload)
    auth/
      jwt.ts             Sign/verify session tokens — EDGE-SAFE
      roles.ts           Role union kept in parity with the Prisma enum
      password.ts        bcrypt hash/verify
      session.ts         Cookie helpers (`next/headers`) — server only
      guard.ts           requireSession / requireRole / requireActiveUser
    validation/          Zod schemas, one module per domain
      money.ts           Decimal input — validated as strings, never floats
    domain/
      enums.ts           Structural enum mirrors + deriveScope()
      order-status.ts    The state machine — ALLOWED/AGENT transitions
    rate-engine/
      engine.ts          calculateRate() — PURE, synchronous, no I/O
      decimal.ts         bigint fixed-point; no float ever touches a price
      errors.ts          RateEngineError + stable error codes
      config-source.ts   loadRateConfig() — the only part that reads Prisma
      engine.test.ts     Vitest; fixtures only, no database
    notifications/     Notifier interface + ConsoleNotifier (Phase 6 swaps it)
    admin/
      handler.ts         adminRoute() — ADMIN guard + DB error mapping
      config-health.ts   Rate-card coverage gaps, pincode conflicts
    orders/
      create.ts          createOrder() — recomputes the price, never trusts it
      status.ts          updateOrderStatus() — state machine + role rules
      reschedule.ts      New attempt after a failure, re-runs assignment
      tracking.ts        Customer-facing timeline + access rules
      assignment.ts      selectAgent() — PURE policy + candidate loading
      assign.ts          Manual/auto (re)assignment for admins
      history.ts         The ONLY writer to order_status_history
      order-number.ts    LM-YYYYMMDD-XXXXXX references
  middleware.ts          Role-based route protection
```

Conventions:

- Path alias `@/*` maps to `src/*`. Prefer it over deep relative imports.
- One Zod schema per request shape, in `src/lib/validation/`. Route handlers
  validate before touching the database — never trust a request body.
- Route handlers return the envelopes from `src/lib/api.ts`
  (`ok` / `fail` / `validationFailed`), so clients parse one shape.
- Money and weights are Prisma `Decimal`, never `Float`. They cross every
  boundary as decimal **strings** and are computed as `bigint` counts of minor
  units / grams in `src/lib/rate-engine/decimal.ts`. No quantity that reaches a
  price is ever a JavaScript `number` — `ceil(chargeable - baseWeight)` turns a
  float epsilon into a whole extra kilogram billed.
- Database tables are `snake_case` via `@@map`; Prisma models stay `PascalCase`
  and fields `camelCase`.

---

## Auth model

- Session is an HS256 JWT in an **httpOnly, SameSite=Lax** cookie
  (`AUTH_COOKIE_NAME`, default `lm_session`); `Secure` is on in production.
- `src/middleware.ts` runs on the **Edge runtime**. It may only verify the JWT.
  Never import `@prisma/client` or `bcryptjs` into it, directly or transitively
  — that is why `roles.ts` restates the role union as plain data.
- Middleware forwards `x-user-id` / `x-user-role` as a convenience, but route
  handlers **re-verify the cookie** through `guard.ts` rather than trusting a
  header a client could set on an unmatched path.
- A JWT keeps asserting its role until it expires. Anything sensitive should use
  `requireActiveUser()`, which re-reads the user and checks `isActive`.
- `/api/auth/register` only ever creates a `CUSTOMER`. Agents and admins are
  provisioned by seed or by an admin route — never by self-service.

---

## Charge calculation

Persisted on each order so historical rows keep their original arithmetic even
after a rate card changes:

```
volumetricWeight = (L × B × H) / volumetricDivisor      # divisor default 5000
chargeableWeight = max(actualWeight, volumetricWeight)
freight          = baseRate + perKgRate × ceil(max(0, chargeable − baseWeight))
codSurcharge     = FIXED ? amount : max(minAmount, freight × percentage / 100)
total            = freight + codSurcharge
```

`scope` is `INTRA` when pickup and drop resolve to the same zone, else `INTER`.
The `RateCard` is looked up on `(orderType, scope, fromZoneId, toZoneId)` and
its id is snapshotted onto the order.

---

## Commands

```bash
npm run dev          # Next dev server
npm run build        # Production build
npm run db:migrate   # prisma migrate dev
npm run db:deploy    # prisma migrate deploy (CI/production)
npm run db:seed      # Idempotent seed
npm run db:studio    # Prisma Studio
npm test             # Vitest (rate engine unit tests)
npm run test:watch   # Vitest in watch mode
```

Seeded accounts. Passwords are **never** written down here — the seed reads
`SEED_ADMIN_PASSWORD` and `SEED_AGENT_PASSWORD` from `.env` and fails loudly if
they are unset. Re-running the seed rewrites the stored hashes, so rotating a
seeded account means changing the variable and running `npm run db:seed` again.

| Role  | Email                        | Password source       |
| ----- | ---------------------------- | --------------------- |
| ADMIN | `admin@lastmile.local`       | `SEED_ADMIN_PASSWORD` |
| AGENT | `agent.north@lastmile.local` | `SEED_AGENT_PASSWORD` |
| AGENT | `agent.south@lastmile.local` | `SEED_AGENT_PASSWORD` |

---

## Database connections

`DATABASE_URL` is the **pooled** Neon endpoint used at runtime. `DIRECT_URL` is
the same host **without** `-pooler` and is what Prisma Migrate uses — migrations
need a session-mode connection that PgBouncer does not provide.
