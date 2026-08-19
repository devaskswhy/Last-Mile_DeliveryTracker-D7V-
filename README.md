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

## API

| Method | Path                  | Access             |
| ------ | --------------------- | ------------------ |
| POST   | `/api/auth/register`  | public (creates a CUSTOMER) |
| POST   | `/api/auth/login`     | public             |
| POST   | `/api/auth/logout`    | public             |
| GET    | `/api/me`             | any signed-in role |
| GET    | `/api/agent/ping`     | AGENT, ADMIN       |
| GET    | `/api/admin/ping`     | ADMIN              |

```bash
curl -i -c jar.txt -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Customer","email":"you@example.com","password":"Sup3rSecret!"}'

curl -b jar.txt http://localhost:3000/api/me
```

Sessions are HS256 JWTs in an httpOnly, SameSite=Lax cookie. `src/middleware.ts`
gates routes by role on the Edge runtime; route handlers re-verify through
`src/lib/auth/guard.ts`.

## Notes

`order_status_history` is append-only and enforced by a Postgres trigger —
UPDATE, DELETE and TRUNCATE all raise. Corrections are recorded as new rows.

See [CLAUDE.md](CLAUDE.md) for conventions and the charge-calculation formula.
