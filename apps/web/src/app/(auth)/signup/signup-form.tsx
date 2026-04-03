'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { handleEnterAdvance } from '../../../lib/forms/enter-navigation'
import { signUpSchema } from '../../../lib/validation/auth'
import { Field, PrimaryButton } from '../_components/form-primitives'

function passwordStrength(value: string): 'weak' | 'medium' | 'strong' {
  if (value.length < 8) return 'weak'
  const hasSpecial = /[^A-Za-z0-9]/.test(value)
  if (value.length >= 12 && hasSpecial) return 'strong'
  return 'medium'
}

export function SignupForm() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const strength = passwordStrength(password)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const parsed = signUpSchema.safeParse({ email, password, name: name || undefined })
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {}
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0]
        if (typeof key === 'string') nextErrors[key] = issue.message
      })
      setFieldErrors(nextErrors)
      return
    }

    setFieldErrors({})
    setIsLoading(true)

    const emailRedirectTo = `${window.location.origin}/auth/callback`

    const { error: signUpError } = await supabase.auth.signUp({
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
      setError(signUpError.message)
      return
    }

    const emailParam = encodeURIComponent(parsed.data.email)
    router.replace(`/confirm-email?email=${emailParam}&new=true`)
    router.refresh()
  }

  return (
    <form className="space-y-4" onKeyDown={handleEnterAdvance} onSubmit={onSubmit}>
      <Field
        autoComplete="name"
        label="Display name (optional)"
        name="name"
        onChange={(event) => setName(event.target.value)}
        placeholder="Alex"
        value={name}
        error={fieldErrors.name}
      />
      <Field
        autoComplete="email"
        label="Email"
        name="email"
        onChange={(event) => setEmail(event.target.value)}
        required
        type="email"
        value={email}
        error={fieldErrors.email}
      />
      <Field
        autoComplete="new-password"
        label="Password"
        name="password"
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
        value={password}
        error={fieldErrors.password}
      />

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

      {error ? <p className="text-sm text-[#ef4444]">{error}</p> : null}

      <PrimaryButton disabled={isLoading} type="submit">
        {isLoading ? 'Creating account...' : 'Create account'}
      </PrimaryButton>
    </form>
  )
}
