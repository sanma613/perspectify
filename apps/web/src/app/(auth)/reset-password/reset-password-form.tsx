'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { handleEnterAdvance } from '../../../lib/forms/enter-navigation'
import { resetPasswordSchema } from '../../../lib/validation/auth'
import { usePasswordVisibility } from '../../../hooks/use-password-visibility'
import { PrimaryButton } from '../_components/form-primitives'

export function ResetPasswordForm() {
  const router = useRouter()
  const supabase = createClient()
  const passwordVisibility = usePasswordVisibility()
  const confirmVisibility = usePasswordVisibility()

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
    }, 1200)
  }

  return (
    <form className="space-y-4" onKeyDown={handleEnterAdvance} onSubmit={onSubmit}>
      <label className="block space-y-2 text-base">
        <span className="font-display text-[11px] uppercase tracking-[0.14em] text-[#a1a1aa]">New password</span>
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

      <label className="block space-y-2 text-base">
        <span className="font-display text-[11px] uppercase tracking-[0.14em] text-[#a1a1aa]">Confirm password</span>
        <div className="relative">
          <input
            autoComplete="new-password"
            className="h-11 w-full rounded-lg border border-white/10 bg-[#1a1a1a] px-3 pr-10 text-base text-white outline-none transition-colors duration-200 ease-in-out placeholder:text-[#52525b] hover:bg-[#202020] focus-visible:ring-2 focus-visible:ring-green-500"
            name="confirmPassword"
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type={confirmVisibility.inputType}
            value={confirmPassword}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={confirmVisibility.toggle}
            aria-label={confirmVisibility.visible ? 'Hide' : 'Show'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {confirmVisibility.visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {fieldErrors.confirmPassword ? <span className="text-sm text-[#ef4444]">{fieldErrors.confirmPassword}</span> : null}
      </label>

      {error ? <p className="text-sm text-[#ef4444]">{error}</p> : null}
      {message ? <p className="text-sm text-green-300">{message}</p> : null}

      <PrimaryButton disabled={isLoading} type="submit">
        {isLoading ? 'Saving...' : 'Update password'}
      </PrimaryButton>
    </form>
  )
}
