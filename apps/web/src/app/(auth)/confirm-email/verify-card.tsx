'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Info, Loader2, Mail } from 'lucide-react'
import { createClient } from '../../../lib/supabase/client'
import { AuthPanel } from '../_components/auth-panel'

const COOLDOWN_SECONDS = 60

export function ConfirmEmailCard() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [email, setEmail] = useState<string>('')
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS)
  const [isResending, setIsResending] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isAlreadyConfirmed, setIsAlreadyConfirmed] = useState(false)

  useEffect(() => {
    const fromQuery = new URL(window.location.href).searchParams.get('email')
    if (fromQuery) {
      setEmail(fromQuery)
    }
  }, [])

  useEffect(() => {
    const cooldownInterval = window.setInterval(() => {
      setCooldown((value) => (value > 0 ? value - 1 : 0))
    }, 1000)

    return () => window.clearInterval(cooldownInterval)
  }, [])

  async function routeAfterConfirm() {
    router.replace('/dashboard')
  }

  async function autoContinueAfterConfirmed() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session) {
      await routeAfterConfirm()
      return true
    }

    const didSignIn = await tryPendingPasswordSignIn(true)
    if (didSignIn) return true

    setIsAlreadyConfirmed(true)
    return false
  }

  async function tryPendingPasswordSignIn(silent = false) {
    const pendingEmail = sessionStorage.getItem('pending_confirmation_email')
    const password = sessionStorage.getItem('pending_confirmation_password')

    if (!pendingEmail || !password) return false

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: pendingEmail,
      password,
    })

    if (signInError) {
      const normalizedMessage = signInError.message.toLowerCase()

      if (
        normalizedMessage.includes('invalid login') ||
        normalizedMessage.includes('invalid credentials')
      ) {
        sessionStorage.removeItem('pending_confirmation_email')
        sessionStorage.removeItem('pending_confirmation_password')
      }

      if (!silent) {
        if (
          normalizedMessage.includes('email not confirmed') ||
          normalizedMessage.includes('not confirmed')
        ) {
          setError("Your email isn't confirmed yet. Check your inbox and click the link, then try again.")
        } else {
          setError(signInError.message)
        }
      }

      return false
    }

    if (data.session) {
      sessionStorage.removeItem('pending_confirmation_email')
      sessionStorage.removeItem('pending_confirmation_password')
      await routeAfterConfirm()
      return true
    }

    return false
  }

  async function handleConfirmedClick() {
    setIsChecking(true)
    setError('')

    if (!(await tryPendingPasswordSignIn())) {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session) {
        sessionStorage.removeItem('pending_confirmation_email')
        sessionStorage.removeItem('pending_confirmation_password')
        await routeAfterConfirm()
        return
      }

      if (email) {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            shouldCreateUser: false,
          },
        })

        if (!otpError) {
          setMessage('We sent a sign-in link to your email. Open it on this device to continue.')
          setIsChecking(false)
          return
        }
      }

      setError('Please go back to login and sign in with your email and password.')
      setIsChecking(false)
      return
    }

    setIsChecking(false)
  }

  useEffect(() => {
    let active = true
    let cleanupChannel: (() => void) | null = null
    let retryInterval: number | null = null

    async function subscribeToConfirmationChanges() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return

      if (!user?.id) {
        // No local session yet: keep trying password sign-in after external confirmation.
        retryInterval = window.setInterval(() => {
          void tryPendingPasswordSignIn(true)
        }, 4000)
        return
      }

      if (user.email) {
        setEmail(user.email)
      }

      if (user.email_confirmed_at) {
        await autoContinueAfterConfirmed()
        return
      }

      const channel = supabase
        .channel(`confirm-email:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'users',
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            const confirmedAt = (payload.new as { email_confirmed_at?: string | null } | null)?.email_confirmed_at
            if (!confirmedAt) return

            void (async () => {
              await autoContinueAfterConfirmed()
            })()
          }
        )
        .subscribe()

      cleanupChannel = () => {
        void supabase.removeChannel(channel)
      }
    }

    void subscribeToConfirmationChanges()

    return () => {
      active = false
      if (retryInterval !== null) {
        window.clearInterval(retryInterval)
      }
      if (cleanupChannel) cleanupChannel()
    }
  }, [supabase])

  async function resendEmail() {
    if (cooldown > 0 || !email) return
    setIsResending(true)
    setError('')
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

  if (isAlreadyConfirmed) {
    return (
      <AuthPanel title="Email confirmed" subtitle="Your email is already confirmed.">
        <div className="space-y-4">
          <div className="grid place-items-center">
            <div className="relative inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-[#1a1a1a]">
              <Mail className="h-6 w-6 text-[#22c55e]" />
              <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-400/15">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
              </span>
            </div>
          </div>

          <p className="text-center text-sm text-[#a1a1aa]">
            Your account is ready. Return to the device where you registered and sign in there, or continue here.
          </p>

          <button
            className="h-11 w-full rounded-lg bg-[#22c55e] text-sm font-medium text-[#031108]"
            onClick={() => {
              router.replace('/dashboard')
            }}
            type="button"
          >
            Go to dashboard →
          </button>

          <Link className="block text-center text-sm text-[#a1a1aa] hover:text-white" href="/login">
            Back to login
          </Link>
        </div>
      </AuthPanel>
    )
  }

  return (
    <AuthPanel title="Check your inbox" subtitle={`We sent a confirmation link to ${email || 'your email'}.`}>
      <div className="space-y-4">
        <div className="grid place-items-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-[#1a1a1a]">
            <Mail className="h-6 w-6 text-[#22c55e]" />
          </div>
        </div>

        <p className="text-center text-sm text-[#a1a1aa]">Click the confirmation link to finish setting up your account.</p>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/6 bg-white/3 p-4 text-left">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <p className="text-xs leading-relaxed text-zinc-500">
            If this page does not update automatically, click the button below after confirming your email.
          </p>
        </div>

        <button
          className="h-11 w-full rounded-lg bg-[#22c55e] text-sm font-medium text-[#031108]"
          disabled={isChecking}
          onClick={() => {
            void handleConfirmedClick()
          }}
          type="button"
        >
          {isChecking ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking...
            </span>
          ) : (
            "I've confirmed my email →"
          )}
        </button>

        <button
          className="h-11 w-full rounded-lg border border-white/10 bg-white/5 text-sm text-white"
          disabled={cooldown > 0 || isResending || !email}
          onClick={() => {
            void resendEmail()
          }}
          type="button"
        >
          {isResending
            ? 'Resending...'
            : cooldown > 0
              ? `Resend confirmation email in ${cooldown}s`
              : 'Resend confirmation email'}
        </button>

        <Link className="block text-center text-sm text-[#a1a1aa] hover:text-white" href="/login">
          Back to login
        </Link>

        {message ? <p className="text-sm text-green-300">{message}</p> : null}
        {error ? <p className="mt-3 text-center text-sm text-red-400">{error}</p> : null}
        {error.toLowerCase().includes('log in manually') ? (
          <a className="mt-1 block text-center text-sm text-zinc-400 underline" href="/login">
            Go to login →
          </a>
        ) : null}
      </div>
    </AuthPanel>
  )
}
