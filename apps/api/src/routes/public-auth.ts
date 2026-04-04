import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { db, users } from '@perspectify/db'
import { eq } from 'drizzle-orm'

export const publicAuthRoutes = new Hono()

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function checkEmailExistsInAuth(email: string): Promise<boolean | null> {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const perPage = 200
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })

    if (error || !data) {
      return null
    }

    const match = data.users.some((user) => normalizeEmail(user.email ?? '') === email)
    if (match) {
      return true
    }

    const totalPages = data.total ? Math.ceil(data.total / perPage) : 0
    if (totalPages > 0) {
      if (page >= totalPages) break
    } else if (data.users.length < perPage) {
      break
    }

    page += 1
  }

  return false
}

// GET /auth/check-email?email=
publicAuthRoutes.get('/check-email', async (c) => {
  const rawEmail = c.req.query('email')
  if (!rawEmail) {
    return c.json({ error: 'email is required' }, 400)
  }

  const email = normalizeEmail(rawEmail)
  if (!isValidEmail(email)) {
    return c.json({ error: 'invalid email' }, 400)
  }

  const authExists = await checkEmailExistsInAuth(email)
  if (authExists !== null) {
    return c.json({ exists: authExists })
  }

  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  return c.json({ exists: Boolean(row) })
})