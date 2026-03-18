# Perspectify

Webhook reliability layer — captura eventos de Stripe antes de que lleguen a Zapier/Make,
reintenta con backoff exponencial, y te deja rescatar cualquier fallo con un clic.

## Stack

| Pieza       | Tecnología           | Hosting       | Costo |
|-------------|----------------------|---------------|-------|
| Backend     | Hono + Bun           | Render free   | $0    |
| Cron        | Bun script           | Render free   | $0    |
| Frontend    | Next.js              | Vercel free   | $0    |
| Base de datos | PostgreSQL          | Supabase free | $0    |
| Queue       | pg-boss              | Supabase DB   | $0    |
| ORM         | Drizzle              | —             | $0    |
| Auth        | Supabase Auth        | Supabase free | $0    |

## Estructura

```
perspectify/
  apps/
    api/                        → Hono — webhook handler + worker
      src/
        routes/
          webhook.ts            → POST /webhook/:token
          events.ts             → GET /events, POST /events/:id/replay
        cron/
          keepalive.ts          → ping API + Supabase cada 5min
        worker.ts               → pg-boss delivery processor
        index.ts
    web/                        → Next.js — dashboard
      src/
        lib/supabase/
          client.ts             → cliente browser
          server.ts             → cliente server components
        middleware.ts           → protege /dashboard con Supabase Auth
  packages/
    db/                         → Drizzle schema + cliente
    queue/                      → pg-boss setup
  render.yaml                   → deploy automático en Render
```

## Setup local

```bash
# 1. Instalar dependencias
bun install

# 2. Variables de entorno
cp .env.example .env
# → completar con credenciales de Supabase y Stripe

# 3. Generar tipos Drizzle
bun run --cwd packages/db db:generate

# 4. Correr migraciones contra Supabase
bun run --cwd packages/db db:migrate

# 5. Arrancar todo
bun dev
```

## Flujo del webhook

```
Stripe
  → POST /webhook/:token
    → verifica firma HMAC
    → idempotencia por stripeId
    → persiste evento (status: PENDING)
    → encola job en pg-boss
    → responde 200 a Stripe ✓

pg-boss worker (mismo proceso)
  → intenta POST al destino (Zapier/Make)
  → éxito → status: DELIVERED
  → fallo  → reintenta hasta 7x con backoff exponencial
            → 5s → 10s → 20s → 40s → 80s → 160s → 320s
  → agota reintentos → status: FAILED

Dashboard
  → lista eventos con timeline de intentos
  → POST /events/:id/replay → re-encola manualmente
```

## Deploy

### Supabase
1. Crear proyecto en supabase.com
2. Copiar `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
3. Correr migraciones: `bun run --cwd packages/db db:migrate`

### Render (API + Cron)
1. Conectar repo en render.com
2. Render detecta `render.yaml` automáticamente
3. Agregar variables de entorno en el dashboard de Render
4. Deploy automático en cada push a main

### Vercel (Web)
1. Importar repo en vercel.com
2. Root directory: `apps/web`
3. Agregar variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy automático en cada push a main

## Escalar cuando sea el momento

| Ahora          | Después             |
|----------------|---------------------|
| Render free    | Render paid / Fly.io |
| Supabase free  | Supabase Pro        |
| pg-boss        | BullMQ + Redis      |
| Drizzle        | Drizzle (no cambia) |
