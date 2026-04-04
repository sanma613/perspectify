'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { handleEnterAdvance } from '../../../lib/forms/enter-navigation'
import { passwordStrength } from '../../../lib/password-strength'
import { signUpSchema } from '../../../lib/validation/auth'
import { usePasswordVisibility } from '../../../hooks/use-password-visibility'
import { Field, PrimaryButton } from '../_components/form-primitives'

export function SignupForm() {
  const router = useRouter()
  const supabase = createClient()
  const passwordVisibility = usePasswordVisibility()
  const confirmPassword = usePasswordVisibility()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmValue, setConfirmValue] = useState('')
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const strength = passwordStrength(password)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const parsed = signUpSchema.safeParse({
      email,
      password,
      confirm: confirmValue,
      name,
    })
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {}
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0]
        if (typeof key === 'string') nextErrors[key] = issue.message
      })
      setFieldErrors(nextErrors)
      if (nextErrors.confirm) setConfirmError(nextErrors.confirm)
      return
    }

    setFieldErrors({})
    setConfirmError('')
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
        label="Display name"
        name="name"
        onChange={(event) => setName(event.target.value)}
        required
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
      <label className="block space-y-2 text-base">
        <span className="font-display text-[11px] uppercase tracking-[0.14em] text-[#a1a1aa]">Password</span>
        <div className="relative">
          <input
            autoComplete="new-password"
            className="h-11 w-full rounded-lg border border-white/10 bg-[#1a1a1a] px-3 pr-10 text-base text-white outline-none transition-colors duration-200 ease-in-out placeholder:text-[#52525b] hover:bg-[#202020] focus-visible:ring-2 focus-visible:ring-green-500"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
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
        {fieldErrors.password ? <span className="text-sm text-[#ef4444]">{fieldErrors.password}</span> : null}
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
              if (confirmTouched) {
                if (nextValue !== password) {
                  setConfirmError("Passwords don't match")
                } else {
                  setConfirmError('')
                }
              }
            }}
            onBlur={() => {
              setConfirmTouched(true)
              if (confirmValue !== password) {
                setConfirmError("Passwords don't match")
              }
            }}
            className={`w-full bg-zinc-900 rounded-xl px-4 py-3 pr-10 text-sm border transition-colors outline-none focus:border-green-500/40 ${
              confirmError ? 'border-red-400' : 'border-white/10'
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
        {confirmError ? <p className="mt-1 text-xs text-red-400">{confirmError}</p> : null}
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

      {error ? <p className="text-sm text-[#ef4444]">{error}</p> : null}

      <PrimaryButton disabled={isLoading || confirmValue !== password} type="submit">
        {isLoading ? 'Creating account...' : 'Create account'}
      </PrimaryButton>
    </form>
  )
}
