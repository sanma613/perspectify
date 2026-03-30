import { createClient, type User } from '@supabase/supabase-js'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

declare module 'hono' {
  interface ContextVariableMap {
    user: User
  }
}

function getBearerToken(c: Context): string | null {
  const authHeader = c.req.header('authorization')
  if (!authHeader) return null

  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return c.json({ error: 'Auth service not configured' }, 500)
  }

  const token = getBearerToken(c)
  if (!token) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  c.set('user', user)
  await next()
})