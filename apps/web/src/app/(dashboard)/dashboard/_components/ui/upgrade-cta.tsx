'use client'

import { useRouter } from 'next/navigation'
import { AlertCircle, Lock, X } from 'lucide-react'
import type { PlanId } from '../../../../../lib/capabilities'
import { BottomSheet } from './bottom-sheet'

export type UpgradeTrigger =
  | 'event_limit'
  | 'endpoint_limit'
  | 'replay_limit'
  | 'rescue_all'
  | 'date_filter'
  | 'settings'

interface UpgradeCTAProps {
  trigger: UpgradeTrigger
  currentUsage?: number
  limit?: number
  variant: 'tooltip' | 'banner' | 'card' | 'bottom-sheet'
  className?: string
  open?: boolean
  onClose?: () => void
  plan?: PlanId
  onDismissBanner?: () => void
}

function getUpgradeCopy(trigger: UpgradeTrigger, currentUsage?: number, limit?: number) {
  if (trigger === 'event_limit') {
    return {
      title: 'Your event limit is reached',
      body: 'New webhooks are being dropped until your limit resets or you upgrade.',
      cta: 'Upgrade to Starter - $19/mo',
      note: 'Stripe can keep firing events, but Perspectify cannot capture new ones right now.',
    }
  }

  if (trigger === 'endpoint_limit') {
    return {
      title: 'Free plan includes 1 endpoint',
      body: `You're using ${currentUsage ?? 1} of ${limit ?? 1}. Starter includes 5 endpoints.`,
      cta: 'Upgrade to Starter - $19/mo',
      note: 'Unlock additional endpoint capacity for production and staging flows.',
    }
  }

  if (trigger === 'replay_limit') {
    return {
      title: "You've used all 3 free replays",
      body: 'Starter includes unlimited replays on all events.',
      cta: 'Upgrade to Starter - $19/mo',
      note: 'Replay limits apply per event on Free.',
    }
  }

  if (trigger === 'date_filter') {
    return {
      title: 'Custom date ranges are a Starter feature',
      body: 'Free shows up to 48h history. Starter keeps 30 days.',
      cta: 'Upgrade to Starter - $19/mo',
      note: 'Use Last 24h and 7d filters on Free.',
    }
  }

  if (trigger === 'settings') {
    return {
      title: 'Upgrade to Starter',
      body: 'Get 50,000 events/month, 5 endpoints, 30-day history and unlimited replays.',
      cta: 'Upgrade to Starter - $19/mo',
      note: 'You can request upgrade access instantly from settings.',
    }
  }

  return {
    title: 'Rescue all is a Starter feature',
    body: 'Upgrade to rescue all failed events with one click.',
    cta: 'Upgrade to Starter - $19/mo',
    note: 'Individual rescue remains available on Free with replay limits.',
  }
}

function UpgradeActionButton({ className }: { className?: string }) {
  const router = useRouter()

  return (
    <button
      className={className ?? 'inline-flex h-11 items-center justify-center rounded-lg bg-[#22c55e] px-4 text-sm font-medium text-[#031108]'}
      onClick={() => {
        // TODO: Replace with Polar checkout URL when billing is integrated
        // POLAR_CHECKOUT_URL = process.env.NEXT_PUBLIC_POLAR_CHECKOUT_URL
        router.push('/dashboard/settings#upgrade')
      }}
      type="button"
    >
      Upgrade to Starter - $19/mo
    </button>
  )
}

function TooltipCard({ trigger, currentUsage, limit }: { trigger: UpgradeTrigger; currentUsage?: number; limit?: number }) {
  const copy = getUpgradeCopy(trigger, currentUsage, limit)

  return (
    <div className="w-[300px] rounded-xl border border-white/10 bg-[#1a1a1a] p-3 text-left">
      <p className="text-sm font-medium text-white">{copy.title}</p>
      <p className="mt-1 text-xs text-[#a1a1aa]">{copy.body}</p>
      <p className="mt-1 text-xs text-[#71717a]">{copy.note}</p>
      <UpgradeActionButton className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#22c55e] px-4 text-sm font-medium text-[#031108]" />
    </div>
  )
}

export function UpgradeCTA({
  trigger,
  currentUsage,
  limit,
  variant,
  className,
  open = false,
  onClose,
  onDismissBanner,
}: UpgradeCTAProps) {
  const copy = getUpgradeCopy(trigger, currentUsage, limit)

  if (variant === 'banner') {
    return (
      <section className="rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/[0.08] p-4">
        <p className="text-sm font-medium text-[#fee2e2]">{copy.title} - new webhooks are being dropped</p>
        <p className="mt-2 text-sm text-[#fecaca]">{copy.note}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <UpgradeActionButton className="inline-flex h-11 items-center justify-center rounded-lg bg-[#ef4444] px-4 text-sm font-medium text-white" />
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-[#a1a1aa]"
            onClick={onDismissBanner}
            type="button"
          >
            Remind me later
            <X className="h-4 w-4" />
          </button>
        </div>
      </section>
    )
  }

  if (variant === 'card') {
    return (
      <article className={className ?? 'rounded-xl border border-white/10 bg-[#111111] p-4'}>
        <p className="text-sm text-white">{copy.title}</p>
        <p className="mt-2 text-sm text-[#a1a1aa]">{copy.body}</p>
        <UpgradeActionButton className="mt-3 inline-flex h-11 items-center justify-center rounded-lg bg-[#22c55e] px-4 text-sm font-medium text-[#031108]" />
      </article>
    )
  }

  if (variant === 'bottom-sheet') {
    return (
      <BottomSheet onClose={onClose ?? (() => {})} open={open} title={copy.title}>
        <p className="text-sm text-[#a1a1aa]">{copy.body}</p>
        <p className="mt-2 text-xs text-[#71717a]">{copy.note}</p>
        <UpgradeActionButton className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#22c55e] px-4 text-sm font-medium text-[#031108]" />
      </BottomSheet>
    )
  }

  return (
    <div className={className ?? 'group relative'}>
      <button
        className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-zinc-700 px-3 text-sm text-zinc-200"
        type="button"
      >
        <Lock className="h-4 w-4" />
        {trigger === 'date_filter' ? 'Custom' : trigger === 'endpoint_limit' ? '+ New endpoint' : 'Rescue all'}
      </button>
      <div className="pointer-events-none absolute right-0 top-12 z-30 hidden group-hover:block">
        <TooltipCard currentUsage={currentUsage} limit={limit} trigger={trigger} />
      </div>
    </div>
  )
}

export function PlanUsageBar({ used, limit, plan }: { used: number; limit: number; plan: PlanId }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const isWarn = percent >= 80 && percent < 100
  const isLimit = percent >= 100

  return (
    <div className="rounded-xl border border-white/10 bg-[#111111] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white">Plan: {plan === 'starter' ? 'Starter' : 'Free'}</p>
        {isWarn ? <AlertCircle className="h-4 w-4 text-[#f59e0b]" /> : null}
      </div>
      <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[#a1a1aa]">Events this month</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/10 bg-[#1a1a1a]">
        <div className={`h-full ${isLimit ? 'bg-[#ef4444]' : isWarn ? 'bg-[#f59e0b]' : 'bg-[#22c55e]'}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-sm text-[#a1a1aa]">
        {used} / {limit}
      </p>
      {plan === 'free' && percent >= 80 ? (
        <UpgradeActionButton className={`mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-medium ${
          isLimit ? 'bg-[#ef4444] text-white' : 'bg-[#22c55e] text-[#031108]'
        }`} />
      ) : null}
    </div>
  )
}
