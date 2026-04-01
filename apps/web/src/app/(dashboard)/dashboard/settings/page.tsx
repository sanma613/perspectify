'use client'

import { PLANS } from '../../../../lib/plans'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../../lib/supabase/client'
import { useDashboardData } from '../../../../lib/use-dashboard-data'
import { useMobile } from '../../../../lib/hooks/use-mobile'
import { BottomSheet } from '../_components/ui/bottom-sheet'
import { PlanBadge } from '../_components/ui/plan-badge'
import { UpgradeCTA } from '../_components/ui/upgrade-cta'

export default function SettingsPage() {
  const { me, endpoints, loading, error, eventsThisMonth } = useDashboardData()
  const isMobile = useMobile()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [displayName, setDisplayName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordSheetOpen, setPasswordSheetOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-[#111111]" />
  }

  if (error || !me) {
    return <p className="text-sm text-[#ef4444]">{error ?? 'Could not load settings.'}</p>
  }

  async function saveProfile() {
    setErrorMessage(null)
    setMessage(null)
    setIsSavingProfile(true)

    const { error: updateError } = await supabase.auth.updateUser({
      data: { display_name: displayName },
    })

    setIsSavingProfile(false)

    if (updateError) {
      setErrorMessage(updateError.message)
      return
    }

    setMessage('Profile updated.')
    router.refresh()
  }

  async function savePassword() {
    setErrorMessage(null)
    setMessage(null)

    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters.')
      return
    }

    const { data: userData } = await supabase.auth.getUser()
    const userEmail = userData.user?.email

    if (!userEmail) {
      setErrorMessage('Could not resolve current user email.')
      return
    }

    setIsSavingPassword(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    })

    if (signInError) {
      setIsSavingPassword(false)
      setErrorMessage('Current password is invalid.')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setIsSavingPassword(false)

    if (updateError) {
      setErrorMessage(updateError.message)
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setMessage('Password updated.')
    setPasswordSheetOpen(false)
  }

  const freePlan = PLANS.free
  const starterPlan = PLANS.starter

  return (
    <section className="space-y-4" id="upgrade">
      <header>
        <h1 className="font-display text-2xl text-white">Settings</h1>
      </header>

      {message ? <p className="text-sm text-green-300">{message}</p> : null}
      {errorMessage ? <p className="text-sm text-[#ef4444]">{errorMessage}</p> : null}

      <section className="rounded-xl border border-white/10 bg-[#111111] p-4">
        <h2 className="font-display text-sm uppercase tracking-[0.16em] text-[#a1a1aa]">Profile</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm text-[#a1a1aa]">
            Display name
            <input
              className="h-11 w-full rounded-lg border border-white/10 bg-[#1a1a1a] px-3 text-white"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Your name"
              value={displayName}
            />
          </label>
          <label className="space-y-1 text-sm text-[#a1a1aa]">
            Email
            <input className="h-11 w-full rounded-lg border border-white/10 bg-[#1a1a1a] px-3 text-[#a1a1aa]" readOnly value={me.email} />
          </label>
        </div>
        <button
          className="mt-3 h-11 rounded-lg bg-[#22c55e] px-4 text-sm font-medium text-[#031108]"
          disabled={isSavingProfile}
          onClick={() => {
            void saveProfile()
          }}
          type="button"
        >
          {isSavingProfile ? 'Saving...' : 'Save profile'}
        </button>

        {!isMobile ? (
          <div className="mt-5 border-t border-white/10 pt-4">
            <h3 className="font-display text-sm uppercase tracking-[0.16em] text-[#a1a1aa]">Change password</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input
                className="h-11 rounded-lg border border-white/10 bg-[#1a1a1a] px-3 text-white"
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current password"
                type="password"
                value={currentPassword}
              />
              <input
                className="h-11 rounded-lg border border-white/10 bg-[#1a1a1a] px-3 text-white"
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
                type="password"
                value={newPassword}
              />
            </div>
            <button
              className="mt-3 h-11 rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white"
              disabled={isSavingPassword}
              onClick={() => {
                void savePassword()
              }}
              type="button"
            >
              {isSavingPassword ? 'Updating...' : 'Update password'}
            </button>
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

      <BottomSheet onClose={() => setPasswordSheetOpen(false)} open={passwordSheetOpen} title="Change password">
        <div className="space-y-3">
          <input
            className="h-11 w-full rounded-lg border border-white/10 bg-[#111111] px-3 text-white"
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Current password"
            type="password"
            value={currentPassword}
          />
          <input
            className="h-11 w-full rounded-lg border border-white/10 bg-[#111111] px-3 text-white"
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="New password"
            type="password"
            value={newPassword}
          />
          <button
            className="h-11 w-full rounded-lg bg-[#22c55e] text-sm font-medium text-[#031108]"
            disabled={isSavingPassword}
            onClick={() => {
              void savePassword()
            }}
            type="button"
          >
            {isSavingPassword ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </BottomSheet>
    </section>
  )
}
