'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { handleEnterAdvance } from '../../../lib/forms/enter-navigation'
import { getApiBaseUrl } from '../../../lib/http'
import { passwordStrength } from '../../../lib/password-strength'
import { signUpSchema } from '../../../lib/validation/auth'
import { usePasswordVisibility } from '../../../hooks/use-password-visibility'
import { Field, PrimaryButton } from '../_components/form-primitives'

type EmailAvailability = 'idle' | 'checking' | 'available' | 'taken' | 'error'

export function SignupForm() {
  const router = useRouter()
  const supabase = createClient()
  const passwordVisibility = usePasswordVisibility()
  const confirmPassword = usePasswordVisibility()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmValue, setConfirmValue] = useState('')
  const [name, setName] = useState('')
  const [touched, setTouched] = useState<Record<'email' | 'password' | 'confirm' | 'name', boolean>>({
    email: false,
    password: false,
    confirm: false,
    name: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [emailAvailability, setEmailAvailability] = useState<EmailAvailability>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const emailLookupCache = useRef<Record<string, boolean>>({})
  const strength = passwordStrength(password)
  const schemaIsValid = signUpSchema.safeParse({
    email,
    password,
    confirm: confirmValue,
    name,
  }).success
  const canSubmit = schemaIsValid && emailAvailability === 'available'
  const duplicateAccountMessage =
    'An account with this email already exists.'

  function getSchemaErrors(values: {
    email: string
    password: string
    confirm: string
    name: string
  }) {
    const parsed = signUpSchema.safeParse(values)
    if (parsed.success) return {}

    const nextErrors: Record<string, string> = {}
    parsed.error.issues.forEach((issue) => {
      const key = issue.path[0]
      if (typeof key === 'string' && !nextErrors[key]) {
        nextErrors[key] = issue.message
      }
    })

    return nextErrors
  }

  function validateInRealTime(
    values: {
      email: string
      password: string
      confirm: string
      name: string
    },
    nextTouched = touched,
  ) {
    const nextErrors = getSchemaErrors(values)
    const visibleErrors: Record<string, string> = {}

    ;(['email', 'password', 'confirm', 'name'] as const).forEach((key) => {
      if (nextTouched[key] && nextErrors[key]) {
        visibleErrors[key] = nextErrors[key]
      }
    })

    setFieldErrors(visibleErrors)
  }

  useEffect(() => {
    validateInRealTime({ email, password, confirm: confirmValue, name })
  }, [email, password, confirmValue, name, touched])

  useEffect(() => {
    const normalizedEmail = email.trim().toLowerCase()

    if (!touched.email) {
      setEmailAvailability('idle')
      return
    }

    if (!normalizedEmail || Boolean(fieldErrors.email)) {
      setEmailAvailability('idle')
      return
    }

    if (normalizedEmail in emailLookupCache.current) {
      setEmailAvailability(emailLookupCache.current[normalizedEmail] ? 'taken' : 'available')
      return
    }

    const controller = new AbortController()
    const debounceTimer = window.setTimeout(async () => {
      setEmailAvailability('checking')

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/auth/check-email?email=${encodeURIComponent(normalizedEmail)}`,
          {
            method: 'GET',
            signal: controller.signal,
            cache: 'no-store',
          }
        )

        if (!response.ok) {
          throw new Error('email availability check failed')
        }

        const payload = (await response.json()) as { exists?: unknown }
        const exists = payload.exists === true
        emailLookupCache.current[normalizedEmail] = exists
        setEmailAvailability(exists ? 'taken' : 'available')
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') {
          return
        }

        setEmailAvailability('error')
      }
    }, 450)

    return () => {
      window.clearTimeout(debounceTimer)
      controller.abort()
    }
  }, [email, touched.email, fieldErrors.email])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const allTouched = { email: true, password: true, confirm: true, name: true }
    setTouched(allTouched)

    const parsed = signUpSchema.safeParse({
      email,
      password,
      confirm: confirmValue,
      name,
    })
    if (!parsed.success) {
      validateInRealTime({ email, password, confirm: confirmValue, name }, allTouched)
      return
    }

    if (emailAvailability !== 'available') {
      if (emailAvailability === 'taken') {
        setFieldErrors((prev) => ({ ...prev, email: duplicateAccountMessage }))
      }
      return
    }

    setFieldErrors({})
    setIsLoading(true)

    const emailRedirectTo = `${window.location.origin}/auth/callback`

    // Security note: password stored in sessionStorage for cross-device
    // email confirmation UX. sessionStorage is:
    //   - Cleared when the tab/browser closes (not persisted)
    //   - Not accessible to other tabs or domains
    //   - Only used to call signInWithPassword after email confirmation
    //   - Cleared immediately after successful sign-in
    // This is a standard pattern for this UX flow.
    // Alternative: magic link resend, but that adds extra step for user.
    sessionStorage.setItem('pending_confirmation_email', parsed.data.email)
    sessionStorage.setItem('pending_confirmation_password', parsed.data.password)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo,
        data: {
          display_name: parsed.data.name,
        },
      },
    })

    setIsLoading(false)

    if (signUpError) {
      const normalizedMessage = signUpError.message.toLowerCase()
      const isDuplicateError =
        normalizedMessage.includes('already registered') ||
        normalizedMessage.includes('already exists') ||
        normalizedMessage.includes('duplicate')

      if (isDuplicateError) {
        sessionStorage.removeItem('pending_confirmation_email')
        sessionStorage.removeItem('pending_confirmation_password')
        setError(duplicateAccountMessage)
        return
      }

      setError(signUpError.message)
      return
    }

    // Supabase can obfuscate duplicate-user signups by returning a user with no identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      sessionStorage.removeItem('pending_confirmation_email')
      sessionStorage.removeItem('pending_confirmation_password')
      setError(duplicateAccountMessage)
      return
    }

    const emailParam = encodeURIComponent(parsed.data.email)
    router.replace(`/confirm-email?email=${emailParam}&new=true`)
  }

  return (
    <form className="space-y-4" onKeyDown={handleEnterAdvance} onSubmit={onSubmit}>
      <Field
        autoComplete="name"
        label="Display name"
        name="name"
        onBlur={() => {
          setTouched((prev) => ({ ...prev, name: true }))
        }}
        onChange={(event) => {
          const nextValue = event.target.value
          setName(nextValue)
          setTouched((prev) => ({ ...prev, name: true }))
        }}
        required
        value={name}
        error={fieldErrors.name}
      />
      <Field
        autoComplete="email"
        label="Email"
        name="email"
        onBlur={() => {
          setTouched((prev) => ({ ...prev, email: true }))
        }}
        onChange={(event) => {
          const nextValue = event.target.value
          setEmail(nextValue)
          setTouched((prev) => ({ ...prev, email: true }))
        }}
        required
        type="email"
        value={email}
        error={
          fieldErrors.email ||
          (emailAvailability === 'taken'
            ? duplicateAccountMessage
            : emailAvailability === 'error'
              ? 'Could not verify email availability right now.'
              : undefined)
        }
      />
      {emailAvailability === 'checking' ? (
        <p className="-mt-2 text-xs text-[#a1a1aa]">Checking email availability...</p>
      ) : null}
      <label className="block space-y-2 text-base">
        <span className="font-display text-xs uppercase tracking-wider text-[#a1a1aa]">Password</span>
        <div className="relative">
          <input
            autoComplete="new-password"
            className="h-11 w-full rounded-lg border border-white/10 bg-[#1a1a1a] px-3 pr-10 text-base text-white outline-none transition-colors duration-200 ease-in-out placeholder:text-[#52525b] hover:bg-[#202020] focus-visible:ring-2 focus-visible:ring-green-500"
            name="password"
            onBlur={() => {
              setTouched((prev) => ({ ...prev, password: true }))
            }}
            onChange={(event) => {
              const nextValue = event.target.value
              setPassword(nextValue)
              setTouched((prev) => ({
                ...prev,
                password: true,
                confirm: prev.confirm || confirmValue.length > 0,
              }))
            }}
            required
            type={passwordVisibility.inputType}
            value={password}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={passwordVisibility.toggle}
            aria-label={passwordVisibility.visible ? 'Hide' : 'Show'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {passwordVisibility.visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {fieldErrors.password ? (
          <span className="text-xs font-normal text-[#ef4444]">{fieldErrors.password}</span>
        ) : null}
      </label>
      <div>
        <label className="mb-1 block text-sm text-zinc-400">Confirm password</label>
        <div className="relative">
          <input
            type={confirmPassword.inputType}
            value={confirmValue}
            onChange={(event) => {
              const nextValue = event.target.value
              setConfirmValue(nextValue)
              setTouched((prev) => ({ ...prev, confirm: true }))
            }}
            onBlur={() => {
              setTouched((prev) => ({ ...prev, confirm: true }))
            }}
            className={`w-full bg-zinc-900 rounded-xl px-4 py-3 pr-10 text-sm border transition-colors outline-none focus:border-green-500/40 ${
              fieldErrors.confirm ? 'border-red-400' : 'border-white/10'
            }`}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={confirmPassword.toggle}
            aria-label={confirmPassword.visible ? 'Hide' : 'Show'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {confirmPassword.visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {fieldErrors.confirm ? (
          <p className="mt-1 text-xs font-normal text-[#ef4444]">{fieldErrors.confirm}</p>
        ) : null}
      </div>

      <p className="text-xs text-[#a1a1aa]">
        Password strength:{' '}
        <span
          className={
            strength === 'strong'
              ? 'text-green-300'
              : strength === 'medium'
                ? 'text-amber-300'
                : 'text-red-300'
          }
        >
          {strength}
        </span>
      </p>

      {error ? <p className="text-xs font-normal text-[#ef4444]">{error}</p> : null}

      <PrimaryButton disabled={isLoading || !canSubmit} type="submit">
        {isLoading ? 'Creating account...' : 'Create account'}
      </PrimaryButton>
    </form>
  )
}
