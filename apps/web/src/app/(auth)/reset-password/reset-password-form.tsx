'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { resetPasswordSchema } from '../../../lib/validation/auth'
import { Field, PrimaryButton } from '../_components/form-primitives'

export function ResetPasswordForm() {
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword })
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

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    })

    setIsLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setMessage('Password updated successfully. Redirecting to login...')
    setTimeout(() => {
      router.replace('/login')
      router.refresh()
    }, 1200)
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <Field
        autoComplete="new-password"
        label="New password"
        name="password"
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        value={password}
        error={fieldErrors.password}
      />
      <Field
        autoComplete="new-password"
        label="Confirm password"
        name="confirmPassword"
        onChange={(event) => setConfirmPassword(event.target.value)}
        type="password"
        value={confirmPassword}
        error={fieldErrors.confirmPassword}
      />

      {error ? <p className="text-sm text-[#ef4444]">{error}</p> : null}
      {message ? <p className="text-sm text-green-300">{message}</p> : null}

      <PrimaryButton disabled={isLoading} type="submit">
        {isLoading ? 'Saving...' : 'Update password'}
      </PrimaryButton>
    </form>
  )
}
