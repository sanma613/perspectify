'use client'

import { useState } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { forgotPasswordSchema } from '../../../lib/validation/auth'
import { Field, PrimaryButton } from '../_components/form-primitives'

export function ForgotPasswordForm() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  if (message) {
    return <p className="rounded-lg border border-white/10 bg-[#1a1a1a] p-4 text-sm text-[#a1a1aa]">Check your email for a reset link.</p>
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const parsed = forgotPasswordSchema.safeParse({ email })
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

    const redirectTo = `${window.location.origin}/reset-password`
    const { error: requestError } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      { redirectTo }
    )

    setIsLoading(false)

    if (requestError) {
      setError(requestError.message)
      return
    }

    setMessage('Recovery email sent. Check your inbox.')
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <Field
        autoComplete="email"
        label="Email"
        name="email"
        onChange={(event) => setEmail(event.target.value)}
        type="email"
        value={email}
        error={fieldErrors.email}
      />

      {error ? <p className="text-sm text-[#ef4444]">{error}</p> : null}

      <PrimaryButton disabled={isLoading} type="submit">
        {isLoading ? 'Sending link...' : 'Send reset link'}
      </PrimaryButton>
    </form>
  )
}
