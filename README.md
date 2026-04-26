# Perspectify

> **A webhook reliability layer for Stripe** — capture events before they reach Zapier/Make, persist them durably, retry failed deliveries with exponential backoff, and recover from a clean web dashboard.

Built to solve a real pain point: Stripe's webhook retries are limited, and when a downstream integration goes down, events are silently lost. Perspectify acts as a durable buffer between Stripe and your automation tools.

---

## What it does

```
Stripe ──POST──▶ Perspectify API ──▶ Postgres / pg-boss ──▶ Zapier / Make
                      │                       │
                   200 OK                  retry on
                                           failure
                                              │
                                         Dashboard ◀── manual replay
```

1. **Stripe posts** an event to `POST /webhook/:token_hash`
2. **API validates** the HMAC signature, deduplicates by Stripe event ID, persists with status `PENDING`, enqueues a delivery job, and immediately returns `200` to Stripe
3. **Worker** attempts delivery to the configured destination; on failure it retries with exponential backoff:
   ```
   5s → 10s → 20s → 40s → 80s → 160s → 320s
   ```
4. **Dashboard** lists all events and delivery timelines; any failed event can be manually replayed with one click

---

## Tech stack

| Layer | Technology | Hosting | Cost |
|---|---|---|---|
| API / Worker | Hono + Bun | Render | Free |
| Cron | Bun script | Render | Free |
| Frontend | Next.js | Vercel | Free |
| Database | PostgreSQL | Supabase | Free |
| Queue | pg-boss | Supabase DB | Free |
| ORM | Drizzle | — | Free |
| Auth | Supabase Auth | Supabase | Free |

**Total infrastructure cost: $0** — the entire stack runs on free tiers, with a clear upgrade path when needed.

---

## Repository structure

```
perspectify/
├── apps/
│   ├── api/                    # Hono app — webhook handler + worker
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── webhook.ts  # POST /webhook/:token_hash
│   │       │   └── events.ts   # GET /events, POST /events/:id/replay
│   │       ├── cron/
│   │       │   └── keepalive.ts
│   │       └── worker.ts       # pg-boss delivery processor
│   └── web/                    # Next.js dashboard
│       └── src/
│           └── lib/supabase/
│               ├── client.ts   # Browser Supabase client
│               ├── server.ts   # Server-side helpers
│               └── proxy.ts    # Auth-protected /dashboard
├── packages/
│   ├── db/                     # Drizzle schema + migrations
│   └── queue/                  # pg-boss setup and helpers
├── render.yaml
└── turbo.json
```

---

## Local setup

**Prerequisites:** [Bun](https://bun.sh), a Supabase project, and Stripe credentials.

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env

# 3. Generate Drizzle types
bun run --cwd packages/db db:generate

# 4. Run migrations
bun run --cwd packages/db db:migrate

# 5. Start all services
bun dev
```

### Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `STRIPE_SIGNING_SECRET` | Stripe webhook signing secret |
| `DELIVERY_TARGET_URL` | Destination URL for webhook forwarding |

---

## Deployment

### Supabase

1. Create a project on [supabase.com](https://supabase.com)
2. Copy the four Supabase env vars to your `.env`
3. Run migrations: `bun run --cwd packages/db db:migrate`

### Render

1. Connect this repository on [render.com](https://render.com)
2. Render auto-detects `render.yaml` and configures both services
3. Add environment variables in the service settings
4. Deploys automatically on push to the default branch

### Vercel

1. Import the repo on [vercel.com](https://vercel.com), set root directory to `apps/web`
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploys automatically on push

---

## Scaling beyond free tier

| Need | Upgrade path |
|---|---|
| More compute / concurrency | Render paid or Fly.io |
| More DB throughput | Supabase Pro or self-hosted Postgres |
| Higher job volume | Replace pg-boss with BullMQ + Redis |
| Schema / types | Drizzle stays — ORM is provider-agnostic |

---

## Design decisions

- **pg-boss over Redis/BullMQ** — keeps the stack to a single data store with zero extra infrastructure on the free tier. Swap in BullMQ when throughput demands it.
- **Idempotency by Stripe event ID** — prevents duplicate processing even if Stripe retries before the worker finishes.
- **Hono + Bun** — fast cold starts and minimal overhead, important for keeping free-tier response times within Stripe's timeout window.
- **Keepalive cron** — free hosting sleeps idle services; a lightweight ping keeps the worker available without paying for always-on compute.

---

## Troubleshooting

**Stripe retries are failing** — inspect delivery logs in the dashboard and verify your target endpoint is reachable and returning 2xx.

**Worker not processing jobs** — check that `SUPABASE_SERVICE_ROLE_KEY` is set correctly; pg-boss needs write access to the jobs table.

**Duplicate events appearing** — ensure idempotency logic is using the Stripe event ID as the dedup key, not the request ID.
