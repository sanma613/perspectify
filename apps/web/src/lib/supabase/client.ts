import { createBrowserClient } from '@supabase/ssr'

// REQUIRED SUPABASE CONFIG:
// Dashboard -> Auth -> URL Config -> Redirect URLs must include:
// - http://localhost:3000/auth/callback (development)
// - https://perspectify.com/auth/callback (production)

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
