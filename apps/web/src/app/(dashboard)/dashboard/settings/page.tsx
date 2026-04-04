'use client'

import { z } from 'zod'
import { useMemo, useState, useEffect } from 'react'
import { PLANS } from '../../../../lib/plans'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Pencil } from 'lucide-react'
import { createClient } from '../../../../lib/supabase/client'
import { passwordStrength } from '../../../../lib/password-strength'
import { useDashboardData } from '../../../../lib/use-dashboard-data'
import { useMobile } from '../../../../lib/hooks/use-mobile'
import { usePasswordVisibility } from '../../../../hooks/use-password-visibility'
import { Skeleton } from '../../../../components/skeleton'
import { BottomSheet } from '../_components/ui/bottom-sheet'
import { PlanBadge } from '../_components/ui/plan-badge'
import { UpgradeCTA } from '../_components/ui/upgrade-cta'

export default function SettingsPage() {
  const { me, endpoints, loading, error, eventsThisMonth } = useDashboardData()
  const isMobile = useMobile()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const currentPasswordVisibility = usePasswordVisibility()
  const newPasswordVisibility = usePasswordVisibility()
  const confirmPasswordVisibility = usePasswordVisibility()

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [nameError, setNameError] = useState('')
  const [nameSaving, setNameSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [currentPasswordError, setCurrentPasswordError] = useState('')
  const [passwordSubmitError, setPasswordSubmitError] = useState('')
  const [isPasswordEditorOpen, setIsPasswordEditorOpen] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordSheetOpen, setPasswordSheetOpen] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  const currentPasswordSchema = useMemo(
    () => z.string().min(1, 'Current password is required'),
    []
  )
  const newPasswordSchema = useMemo(
    () => z.string().min(8, 'Password must be at least 8 characters.'),
    []
  )

  const newPasswordStrength = passwordStrength(newPassword)
  const newPasswordError =
    newPassword.length > 0 && !newPasswordSchema.safeParse(newPassword).success
      ? 'Password must be at least 8 characters.'
      : ''
  const isPasswordFormValid =
    currentPasswordSchema.safeParse(currentPassword).success &&
    newPasswordSchema.safeParse(newPassword).success &&
    confirmNewPassword.length > 0 &&
    confirmNewPassword === newPassword

  useEffect(() => {
    let isMounted = true

    async function loadDisplayName() {
      const { data } = await supabase.auth.getUser()
      const fetchedName = (data.user?.user_metadata?.display_name as string | undefined) ?? ''
      if (!isMounted) return
      setNameValue(fetchedName)
      setOriginalName(fetchedName)
    }

    void loadDisplayName()

    return () => {
      isMounted = false
    }
  }, [supabase])

  useEffect(() => {
    if (!passwordSuccess) return
    const timeout = window.setTimeout(() => setPasswordSuccess(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [passwordSuccess])

  if (loading) {
    return <SettingsPageSkeleton />
  }

  if (error || !me) {
    return <p className="text-sm text-[#ef4444]">{error ?? 'Could not load settings.'}</p>
  }

  async function saveName() {
    const trimmed = nameValue.trim()

    if (trimmed.length === 0) {
      setNameError('Name cannot be empty')
      return
    }
    if (trimmed.length > 60) {
      setNameError('Name too long')
      return
    }

    if (trimmed === originalName.trim()) {
      setIsEditingName(false)
      setNameError('')
      return
    }

    setNameSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({
      data: { display_name: trimmed },
    })
    setNameSaving(false)

    if (updateError) {
      setNameError(updateError.message)
      return
    }

    setOriginalName(trimmed)
    setNameValue(trimmed)
    setNameError('')
    setIsEditingName(false)
    router.refresh()
  }

  function resetPasswordForm(closeDesktop = false, closeMobile = false) {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmNewPassword('')
    setConfirmTouched(false)
    setConfirmError('')
    setCurrentPasswordError('')
    setPasswordSubmitError('')
    if (closeDesktop) setIsPasswordEditorOpen(false)
    if (closeMobile) setPasswordSheetOpen(false)
  }

  async function savePassword() {
    setCurrentPasswordError('')
    setPasswordSubmitError('')
    setPasswordSuccess(null)

    if (!currentPasswordSchema.safeParse(currentPassword).success) {
      setCurrentPasswordError('Current password is required')
      return
    }

    if (!newPasswordSchema.safeParse(newPassword).success) {
      setPasswordSubmitError('Password must be at least 8 characters.')
      return
    }

    if (confirmNewPassword !== newPassword) {
      setConfirmError("Passwords don't match")
      return
    }

    const { data: userData } = await supabase.auth.getUser()
    const userEmail = userData.user?.email

    if (!userEmail) {
      setPasswordSubmitError('Could not resolve current user email.')
      return
    }

    setIsSavingPassword(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    })

    if (signInError) {
      setIsSavingPassword(false)
      setCurrentPasswordError('Current password is incorrect')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setIsSavingPassword(false)

    if (updateError) {
      setPasswordSubmitError(updateError.message)
      return
    }

    setPasswordSuccess('Password updated successfully')
    resetPasswordForm(true, true)
  }

  const freePlan = PLANS.free
  const starterPlan = PLANS.starter

  const passwordForm = (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm text-zinc-400">Current password</label>
        <div className="relative">
          <input
            className="h-11 w-full rounded-lg border border-white/10 bg-[#1a1a1a] px-3 pr-10 text-white outline-none transition-colors focus:border-green-500/40"
            onChange={(event) => {
              setCurrentPassword(event.target.value)
              if (currentPasswordError) setCurrentPasswordError('')
            }}
            type={currentPasswordVisibility.inputType}
            value={currentPassword}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={currentPasswordVisibility.toggle}
            aria-label={currentPasswordVisibility.visible ? 'Hide' : 'Show'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {currentPasswordVisibility.visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {currentPasswordError ? <p className="mt-1 text-xs text-red-400">{currentPasswordError}</p> : null}
      </div>

      <div className="my-5 h-px bg-white/[0.06]" />

      <div>
        <p className="mb-3 text-xs uppercase tracking-wide text-zinc-500">New password</p>
        <div className="space-y-3">
          <div>
            <div className="relative">
              <input
                className="h-11 w-full rounded-lg border border-white/10 bg-[#1a1a1a] px-3 pr-10 text-white outline-none transition-colors focus:border-green-500/40"
                onChange={(event) => {
                  const nextValue = event.target.value
                  setNewPassword(nextValue)
                  if (confirmTouched) {
                    if (confirmNewPassword !== nextValue) {
                      setConfirmError("Passwords don't match")
                    } else {
                      setConfirmError('')
                    }
                  }
                }}
                type={newPasswordVisibility.inputType}
                value={newPassword}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={newPasswordVisibility.toggle}
                aria-label={newPasswordVisibility.visible ? 'Hide' : 'Show'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {newPasswordVisibility.visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {newPassword.length > 0 ? (
              <p className="mt-1 text-xs text-zinc-500">
                Strength:{' '}
                <span
                  className={
                    newPasswordStrength === 'strong'
                      ? 'text-green-300'
                      : newPasswordStrength === 'medium'
                        ? 'text-amber-300'
                        : 'text-red-300'
                  }
                >
                  {newPasswordStrength}
                </span>
              </p>
            ) : null}
            {newPasswordError ? <p className="mt-1 text-xs text-red-400">{newPasswordError}</p> : null}
          </div>

          <div>
            <div className="relative">
              <input
                className={`h-11 w-full rounded-lg border bg-[#1a1a1a] px-3 pr-10 text-white outline-none transition-colors focus:border-green-500/40 ${
                  confirmError ? 'border-red-400' : 'border-white/10'
                }`}
                onChange={(event) => {
                  const nextValue = event.target.value
                  setConfirmNewPassword(nextValue)
                  if (confirmTouched) {
                    if (nextValue !== newPassword) {
                      setConfirmError("Passwords don't match")
                    } else {
                      setConfirmError('')
                    }
                  }
                }}
                onBlur={() => {
                  setConfirmTouched(true)
                  if (confirmNewPassword !== newPassword) {
                    setConfirmError("Passwords don't match")
                  }
                }}
                type={confirmPasswordVisibility.inputType}
                value={confirmNewPassword}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={confirmPasswordVisibility.toggle}
                aria-label={confirmPasswordVisibility.visible ? 'Hide' : 'Show'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {confirmPasswordVisibility.visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmError ? <p className="mt-1 text-xs text-red-400">{confirmError}</p> : null}
          </div>
        </div>
      </div>

      {passwordSubmitError ? <p className="text-xs text-red-400">{passwordSubmitError}</p> : null}

      <div className="mt-6 flex gap-3">
        <button
          className="h-11 rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-zinc-300"
          onClick={() => {
            resetPasswordForm(true, true)
          }}
          type="button"
        >
          Cancel
        </button>
        <button
          className="h-11 rounded-lg bg-[#22c55e] px-4 text-sm font-medium text-[#031108] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isSavingPassword || !isPasswordFormValid}
          onClick={() => {
            void savePassword()
          }}
          type="button"
        >
          {isSavingPassword ? 'Updating...' : 'Update password'}
        </button>
      </div>
    </div>
  )

  return (
    <section className="space-y-4" id="upgrade">
      <header>
        <h1 className="font-display text-2xl text-white">Settings</h1>
      </header>

      {passwordSuccess ? <p className="text-sm text-green-400">{passwordSuccess}</p> : null}

      <section className="rounded-xl border border-white/10 bg-[#111111] p-4">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-[#a1a1aa]">Profile</h2>
        <div className="mt-4 space-y-4">
          <div className="space-y-1 text-sm text-[#a1a1aa]">
            <p>Email</p>
            <input className="h-11 w-full rounded-lg border border-white/10 bg-[#1a1a1a] px-3 text-[#a1a1aa]" readOnly value={me.email} />
          </div>

          <div className="space-y-1 text-sm text-[#a1a1aa]">
            <p>Display name</p>
            {!isEditingName ? (
              <div className="flex items-center gap-3">
                <span className="text-base font-medium text-white">{nameValue || 'No name set'}</span>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  aria-label="Edit name"
                  type="button"
                >
                  <Pencil size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={nameValue}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      setNameValue(nextValue)
                      if (nextValue.trim().length === 0) setNameError('Name cannot be empty')
                      else if (nextValue.trim().length > 60) setNameError('Name too long')
                      else setNameError('')
                    }}
                    className="h-10 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-green-500/40"
                    autoFocus
                    maxLength={60}
                  />
                  <button
                    onClick={() => {
                      void saveName()
                    }}
                    disabled={Boolean(nameError) || nameSaving}
                    className="inline-flex items-center gap-2 text-sm font-medium text-green-400 disabled:text-zinc-600"
                    type="button"
                  >
                    {nameSaving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setNameValue(originalName)
                      setNameError('')
                      setIsEditingName(false)
                    }}
                    className="text-sm text-zinc-500"
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
                {nameError ? <p className="mt-1 text-xs text-red-400">{nameError}</p> : null}
              </>
            )}
          </div>

          {!isMobile ? (
            <div className="border-t border-white/10 pt-4">
              <button
                className="text-sm text-zinc-300 hover:text-white"
                onClick={() => setIsPasswordEditorOpen((value) => !value)}
                type="button"
              >
                Change password
              </button>

              {isPasswordEditorOpen ? <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">{passwordForm}</div> : null}
            </div>
          ) : (
            <button
              className="mt-4 h-11 rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white"
              onClick={() => setPasswordSheetOpen(true)}
              type="button"
            >
              Change password
            </button>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#111111] p-4">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-[#a1a1aa]">Current plan</h2>
        <div className="mt-3">
          <PlanBadge plan={me.plan} />
        </div>

        <ul className="mt-4 space-y-2 text-sm text-[#a1a1aa]">
          <li>● {freePlan.maxEventsPerMonth.toLocaleString()} events / month · {eventsThisMonth} used</li>
          <li>● {freePlan.maxEndpoints} endpoint · {endpoints.length} used</li>
          <li>● {freePlan.retentionDays * 24}h history retention</li>
          <li>● {freePlan.maxReplays} replays per event</li>
          <li>● {freePlan.alertsEnabled ? 'Failure alerts enabled' : 'No failure alerts'}</li>
        </ul>

        <div className="my-4 h-px bg-white/10" />

        <p className="text-sm text-white">Starter - ${starterPlan.priceMonthly}/mo</p>
        <ul className="mt-2 space-y-2 text-sm text-[#a1a1aa]">
          <li>● {starterPlan.maxEventsPerMonth.toLocaleString()} events / month</li>
          <li>● {starterPlan.maxEndpoints} endpoints</li>
          <li>● {starterPlan.retentionDays} days history</li>
          <li>● Unlimited replays</li>
          <li>● Email alerts on failure</li>
          <li>● Retention warnings before deletion</li>
        </ul>

        {me.plan === 'free' ? <UpgradeCTA trigger="settings" variant="card" /> : null}
      </section>

      <BottomSheet onClose={() => resetPasswordForm(false, true)} open={passwordSheetOpen} title="Change password">
        {passwordForm}
      </BottomSheet>
    </section>
  )
}

function SettingsPageSkeleton() {
  return (
    <section className="space-y-4">
      <header>
        <Skeleton className="h-8 w-28" />
      </header>

      <section className="rounded-xl border border-white/10 bg-[#111111] p-4">
        <Skeleton className="h-4 w-20" />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        </div>
        <Skeleton className="mt-3 h-11 w-32 rounded-lg" />

        <div className="mt-5 border-t border-white/10 pt-4">
          <Skeleton className="h-4 w-36" />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
          <Skeleton className="mt-3 h-11 w-36 rounded-lg" />
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#111111] p-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-7 w-28 rounded-full" />

        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-4 w-52 max-w-full" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>

        <div className="my-4 h-px bg-white/10" />

        <Skeleton className="h-4 w-32" />
        <div className="mt-2 space-y-2">
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-4 w-56 max-w-full" />
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-4 w-44 max-w-full" />
        </div>

        <Skeleton className="mt-4 h-11 w-44 rounded-lg" />
      </section>
    </section>
  )
}
