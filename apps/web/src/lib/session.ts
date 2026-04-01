import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'

export async function requireDashboardAccess() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (!user.email_confirmed_at) {
    redirect('/confirm-email')
  }

  return { user }
}

export async function redirectAuthenticatedUsers() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return
  if (!user.email_confirmed_at) redirect('/confirm-email')
  redirect('/dashboard')
}
