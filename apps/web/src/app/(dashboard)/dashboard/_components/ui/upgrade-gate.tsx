'use client'

import { getPlanLimits, type PlanId } from '../../../../../lib/plans'
import { useState, type ReactNode } from 'react'
import { UpgradeCTA, type UpgradeTrigger } from './upgrade-cta'

interface UpgradeGateProps {
  feature: 'rescue_all' | 'replay_limit' | 'endpoint_limit' | 'date_filter_custom' | 'alerts'
  plan: PlanId
  currentUsage?: number
  children: ReactNode
  variant?: 'tooltip' | 'bottom-sheet' | 'inline'
}

function checkFeatureAccess(feature: string, plan: PlanId, currentUsage?: number): boolean {
  const limits = getPlanLimits(plan)

  switch (feature) {
    case 'rescue_all':
      return limits.maxReplays === -1
    case 'replay_limit':
      return limits.maxReplays === -1 || (currentUsage ?? 0) < limits.maxReplays
    case 'endpoint_limit':
      return limits.maxEndpoints === -1 || (currentUsage ?? 0) < limits.maxEndpoints
    case 'date_filter_custom':
      return limits.retentionDays >= 30
    case 'alerts':
      return limits.alertsEnabled
    default:
      return false
  }
}

function toTrigger(feature: UpgradeGateProps['feature']): UpgradeTrigger {
  if (feature === 'date_filter_custom') return 'date_filter'
  if (feature === 'endpoint_limit') return 'endpoint_limit'
  if (feature === 'replay_limit') return 'replay_limit'
  if (feature === 'alerts') return 'settings'
  return 'rescue_all'
}

export function UpgradeGate({
  feature,
  plan,
  currentUsage,
  children,
  variant = 'tooltip',
}: UpgradeGateProps) {
  const hasAccess = checkFeatureAccess(feature, plan, currentUsage)
  const [open, setOpen] = useState(false)

  if (hasAccess) {
    return <>{children}</>
  }

  if (variant === 'inline') {
    return <UpgradeCTA trigger={toTrigger(feature)} variant="card" />
  }

  if (variant === 'bottom-sheet') {
    return (
      <>
        <button
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-700 px-3 text-sm text-zinc-200"
          onClick={() => setOpen(true)}
          type="button"
        >
          {feature === 'endpoint_limit' ? '+ New endpoint' : feature === 'date_filter_custom' ? 'Custom' : 'Rescue'}
        </button>
        <UpgradeCTA
          currentUsage={currentUsage}
          onClose={() => setOpen(false)}
          open={open}
          trigger={toTrigger(feature)}
          variant="bottom-sheet"
        />
      </>
    )
  }

  return <UpgradeCTA currentUsage={currentUsage} trigger={toTrigger(feature)} variant="tooltip" />
}
