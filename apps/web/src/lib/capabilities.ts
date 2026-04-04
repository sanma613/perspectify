export type PlanId = 'free' | 'starter'

export interface PlanLimits {
  maxEventsPerMonth: number
  maxEndpoints: number
  retentionDays: number
  maxRetries: number
  maxReplays: number
  alertsEnabled: boolean
  replayEnabled: boolean
}

export interface PlanCapabilities {
  canCreateEndpoint: boolean
  canReplay: boolean
  canViewReplayUI: boolean
  canRotateToken: boolean
  maxEndpoints: number
  remainingEndpoints: number | null
  endpointBudgetLabel: string
  retryBudgetLabel: string
  maxReplays: number
  remainingReplays: number | null
  replayBudgetLabel: string
  endpointLimitReason: string | null
}

interface Input {
  plan: PlanId
  limits: PlanLimits
  endpointCount: number
  replayCountUsed?: number
}

interface ReplayActionInput {
  limits: PlanLimits
  plan: PlanId
  replayCount: number
  status: 'PENDING' | 'DELIVERING' | 'DELIVERED' | 'FAILED'
  lastAttemptStatus?: number | null
}

interface ReplayActionState {
  allowed: boolean
  reason: string | null
  code: 'status_in_progress' | 'credits_exhausted' | 'replay_disabled' | 'ok'
}

export interface ReplayUiState {
  actionLabel: 'Rescue Event' | 'Replay Event' | 'In progress'
  allowed: boolean
  reason: string | null
  code: ReplayActionState['code']
}

const UNLIMITED = -1

export function derivePlanCapabilities(input: Input): PlanCapabilities {
  const remainingEndpoints = isUnlimited(input.limits.maxEndpoints)
    ? null
    : Math.max(input.limits.maxEndpoints - input.endpointCount, 0)

  const remainingReplays = isUnlimited(input.limits.maxReplays)
    ? null
    : Math.max(input.limits.maxReplays - (input.replayCountUsed ?? 0), 0)

  return {
    canCreateEndpoint:
      isUnlimited(input.limits.maxEndpoints) || (remainingEndpoints ?? 0) > 0,
    canReplay: input.limits.replayEnabled,
    canViewReplayUI: true,
    canRotateToken: true,
    maxEndpoints: input.limits.maxEndpoints,
    remainingEndpoints,
    endpointBudgetLabel: formatLimitLabel(input.limits.maxEndpoints, 'endpoint'),
    retryBudgetLabel: formatLimitLabel(input.limits.maxRetries, 'retry'),
    maxReplays: input.limits.maxReplays,
    remainingReplays,
    replayBudgetLabel: formatLimitLabel(input.limits.maxReplays, 'replay'),
    endpointLimitReason:
      !isUnlimited(input.limits.maxEndpoints) && (remainingEndpoints ?? 0) <= 0
        ? `Your ${input.plan} plan allows ${input.limits.maxEndpoints} endpoint${input.limits.maxEndpoints === 1 ? '' : 's'}.`
        : null,
  }
}

export function canReplayEvent(
  plan: PlanId,
  limits: PlanLimits,
  replayCount: number,
  status: 'PENDING' | 'DELIVERING' | 'DELIVERED' | 'FAILED' = 'FAILED'
): { allowed: boolean; reason: string | null } {
  return getReplayActionState({
    plan,
    limits,
    replayCount,
    status,
  })
}

export function getReplayActionState(input: ReplayActionInput): ReplayActionState {
  const guards: Array<ReplayActionState | null> = [
    input.status === 'DELIVERING' || input.status === 'PENDING'
      ? {
          allowed: false,
          reason: 'This event is currently delivering.',
          code: 'status_in_progress',
        }
      : null,
    !input.limits.replayEnabled
      ? {
          allowed: false,
          reason: 'Replay is unavailable on your current plan.',
          code: 'replay_disabled',
        }
      : null,
    !isUnlimited(input.limits.maxReplays) && input.replayCount >= input.limits.maxReplays
      ? {
          allowed: false,
          reason: `You've used all ${input.limits.maxReplays} replays for this event.`,
          code: 'credits_exhausted',
        }
      : null,
  ]

  return guards.find(Boolean) ?? { allowed: true, reason: null, code: 'ok' }
}

export function getReplayUiState(input: ReplayActionInput): ReplayUiState {
  const decision = getReplayActionState(input)
  const shouldRescue = input.status === 'FAILED' || (input.lastAttemptStatus ?? 0) >= 400
  const actionLabel =
    decision.code === 'status_in_progress'
      ? 'In progress'
      : shouldRescue
        ? 'Rescue Event'
        : 'Replay Event'

  return {
    actionLabel,
    allowed: decision.allowed,
    reason: decision.reason,
    code: decision.code,
  }
}

function isUnlimited(value: number): boolean {
  return value === UNLIMITED
}

function formatLimitLabel(value: number, noun: string): string {
  if (isUnlimited(value)) return `Unlimited ${noun}s`
  return `${value} ${noun}${value === 1 ? '' : 's'}`
}
