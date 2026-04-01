import { createClient } from './supabase/client'

export async function getAccessToken(): Promise<string> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const token = session?.access_token
  if (!token) throw new Error('Missing session token. Please log in again.')
  return token
}
