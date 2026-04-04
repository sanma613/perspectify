import { Hono } from 'hono'
import { db, users, endpoints, getPlanLimits } from '@perspectify/db'
import { and, eq } from 'drizzle-orm'
import { decrypt } from '../lib/encryption'

export const meRoutes = new Hono()

interface UpdateMeBody {
  onboardingCompleted?: boolean
}

async function markOnboardingCompleted(userId: string): Promise<boolean> {
  const [existing] = await db
    .select({ onboardingCompleted: users.onboardingCompleted })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!existing || existing.onboardingCompleted) {
    return false
  }

  await db
    .update(users)
    .set({ onboardingCompleted: true })
    .where(and(eq(users.id, userId), eq(users.onboardingCompleted, false)))

  return true
}

// GET /me
meRoutes.get('/', async (c) => {
  const authUser = c.get('user')

  let [row] = await db
    .select({
      id: users.id,
      email: users.email,
      plan: users.plan,
      onboardingCompleted: users.onboardingCompleted,
      freeReplaysUsed: users.freeReplaysUsed,
    })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1)

  // Keep onboarding smooth in dev by auto-provisioning missing business user rows.
  if (!row) {
    const [inserted] = await db
      .insert(users)
      .values({
        id: authUser.id,
        email: authUser.email ?? '',
      })
      .returning({
        id: users.id,
        email: users.email,
        plan: users.plan,
        onboardingCompleted: users.onboardingCompleted,
        freeReplaysUsed: users.freeReplaysUsed,
      })

    row = inserted
  }

  const endpointSecrets = await db
    .select({ secret: endpoints.secret })
    .from(endpoints)
    .where(eq(endpoints.userId, authUser.id))

  const hasConfiguredEndpoint = endpointSecrets.some(({ secret }) => {
    try {
      return decrypt(secret).trim().length > 0
    } catch {
      // Treat malformed stored payloads as configured to avoid blocking users.
      return true
    }
  })

  return c.json({
    id: row.id,
    email: row.email,
    plan: row.plan,
    onboardingCompleted: row.onboardingCompleted,
    hasConfiguredEndpoint,
    limits: getPlanLimits(row.plan),
    usage: {
      replaysUsed: Number(row.freeReplaysUsed ?? 0),
    },
  })
})

// PATCH /me
meRoutes.patch('/', async (c) => {
  const authUser = c.get('user')

  let body: UpdateMeBody
  try {
    body = await c.req.json<UpdateMeBody>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body.onboardingCompleted !== 'boolean') {
    return c.json({ changed: false })
  }

  if (body.onboardingCompleted === false) {
    return c.json({ changed: false, ignored: true })
  }

  try {
    await db
      .insert(users)
      .values({
        id: authUser.id,
        email: authUser.email ?? '',
      })
      .onConflictDoNothing()

    const changed = await markOnboardingCompleted(authUser.id)

    return c.json({ changed })
  } catch (error) {
    console.error('PATCH /me onboarding update failed', {
      userId: authUser.id,
      error,
    })
    return c.json({ error: 'Could not persist onboarding state' }, 500)
  }
})
