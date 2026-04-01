'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import { createClient } from '../../../lib/supabase/client'
import { AuthPanel } from '../_components/auth-panel'

const COOLDOWN_SECONDS = 60
const POLL_INTERVAL_MS = 4000
const POLL_MAX_CHECKS = 20

export function ConfirmEmailCard() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [email, setEmail] = useState<string>('')
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS)
  const [pollCount, setPollCount] = useState(0)
  const [isResending, setIsResending] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const isNewUser =
    typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('new') === 'true'

  useEffect(() => {
    const fromQuery = new URL(window.location.href).searchParams.get('email')
    if (fromQuery) {
      setEmail(fromQuery)
    }

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user?.email) {
        setEmail(user.email)
      }
    })()
  }, [supabase])

  useEffect(() => {
    const cooldownInterval = window.setInterval(() => {
      setCooldown((value) => (value > 0 ? value - 1 : 0))
    }, 1000)

    return () => window.clearInterval(cooldownInterval)
  }, [])

  async function routeAfterConfirm() {
    router.replace(isNewUser ? '/dashboard?new=true' : '/dashboard')
    router.refresh()
  }

  async function checkEmailConfirmed() {
    setIsChecking(true)
    setError(null)
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()
    setIsChecking(false)

    if (sessionError || !session?.user) {
      setError('No active session found. Log in again after confirming your email.')
      return
    }

    if (!session.user.email_confirmed_at) {
      setMessage('Email not confirmed yet. Please check your inbox.')
      return
    }

    await routeAfterConfirm()
  }

  useEffect(() => {
    if (pollCount >= POLL_MAX_CHECKS) return

    const polling = window.setInterval(() => {
      void (async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session?.user?.email_confirmed_at) {
          window.clearInterval(polling)
          await routeAfterConfirm()
          return
        }

        setPollCount((value) => value + 1)
      })()
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(polling)
  }, [pollCount, supabase])

  async function resendEmail() {
    if (cooldown > 0 || !email) return
    setIsResending(true)
    setError(null)
    setMessage(null)

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setIsResending(false)

    if (resendError) {
      setError(resendError.message)
      return
    }

    setCooldown(COOLDOWN_SECONDS)
    setMessage('Confirmation email sent again.')
  }

  return (
    <AuthPanel title="Check your inbox" subtitle="Confirm your email to continue.">
      <div className="space-y-4">
        <div className="grid place-items-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-[#1a1a1a]">
            <Mail className="h-6 w-6 text-[#22c55e]" />
          </div>
        </div>

        <p className="text-center text-sm text-[#a1a1aa]">
          We sent a confirmation link to <span className="text-white">{email || 'your email'}</span>
        </p>

        <button
          className="h-11 w-full rounded-lg bg-[#22c55e] text-sm font-medium text-[#031108]"
          disabled={isChecking}
          onClick={() => {
            void checkEmailConfirmed()
          }}
          type="button"
        >
          {isChecking ? 'Checking...' : "I've confirmed my email"}
        </button>

        <button
          className="h-11 w-full rounded-lg border border-white/10 bg-white/5 text-sm text-white"
          disabled={cooldown > 0 || isResending || !email}
          onClick={() => {
            void resendEmail()
          }}
          type="button"
        >
          {isResending ? 'Resending...' : cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
        </button>

        <Link className="block text-center text-sm text-[#a1a1aa] hover:text-white" href="/login">
          Back to login
        </Link>

        {message ? <p className="text-sm text-green-300">{message}</p> : null}
        {error ? <p className="text-sm text-[#ef4444]">{error}</p> : null}
      </div>
    </AuthPanel>
  )
}
