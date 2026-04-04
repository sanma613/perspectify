'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { handleEnterAdvance } from '../../../lib/forms/enter-navigation'
import { loginSchema } from '../../../lib/validation/auth'
import { usePasswordVisibility } from '../../../hooks/use-password-visibility'
import { Field, PrimaryButton } from '../_components/form-primitives'

export function LoginForm() {
  const router = useRouter()
  const supabase = createClient()
  const passwordVisibility = usePasswordVisibility()

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
      return
    }

    router.replace('/dashboard')
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
      <label className="block space-y-2 text-base">
        <span className="font-display text-[11px] uppercase tracking-[0.14em] text-[#a1a1aa]">Password</span>
        <div className="relative">
          <input
            autoComplete="current-password"
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
