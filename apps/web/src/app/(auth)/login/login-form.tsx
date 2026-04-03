'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { handleEnterAdvance } from '../../../lib/forms/enter-navigation'
import { loginSchema } from '../../../lib/validation/auth'
import { Field, PrimaryButton } from '../_components/form-primitives'

export function LoginForm() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const parsed = loginSchema.safeParse({ email, password })
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

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    })

    setIsLoading(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    if (!data.user?.email_confirmed_at) {
      router.replace('/confirm-email')
      router.refresh()
      return
    }

    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <form className="space-y-4" onKeyDown={handleEnterAdvance} onSubmit={onSubmit}>
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
        autoComplete="current-password"
        label="Password"
        name="password"
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
        value={password}
        error={fieldErrors.password}
      />

      <Link className="block text-right text-sm text-[#a1a1aa] hover:text-white" href="/forgot-password">
        Forgot password?
      </Link>

      {error ? <p className="text-sm text-[#ef4444]">{error}</p> : null}

      <PrimaryButton disabled={isLoading} type="submit">
        {isLoading ? 'Signing in...' : 'Sign in'}
      </PrimaryButton>
    </form>
  )
}
