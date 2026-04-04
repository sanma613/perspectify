import { Hono } from 'hono'
import { db, users, getPlanLimits } from '@perspectify/db'
import { eq } from 'drizzle-orm'

export const meRoutes = new Hono()

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

  return c.json({
    id: row.id,
    email: row.email,
    plan: row.plan,
    onboardingCompleted: row.onboardingCompleted,
    limits: getPlanLimits(row.plan),
    usage: {
      replaysUsed: Number(row.freeReplaysUsed ?? 0),
    },
  })
})
