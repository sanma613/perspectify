import { NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '../../../lib/supabase/server'

const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
])

function getConfirmRedirect(request: NextRequest, hint?: string) {
  const url = new URL('/confirm-email', request.url)
  if (hint) {
    url.searchParams.set('hint', hint)
  }
  return url
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const requestUrl = new URL(request.url)

  const code = requestUrl.searchParams.get('code')
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(getConfirmRedirect(request, 'callback_failed'))
    }
  } else if (tokenHash && type && ALLOWED_OTP_TYPES.has(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    })

    if (error) {
      return NextResponse.redirect(getConfirmRedirect(request, 'callback_failed'))
    }
  } else {
    return NextResponse.redirect(getConfirmRedirect(request, 'missing_callback_params'))
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user?.email_confirmed_at) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.redirect(getConfirmRedirect(request, 'awaiting_confirmation'))
}
