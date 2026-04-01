export type PlanId = 'free' | 'starter'

export interface PlanLimits {
  priceMonthly:      number   // USD
  maxEventsPerMonth: number   // -1 = unlimited
  maxEndpoints:      number
  retentionDays:     number
  maxRetries:        number   // retries after first attempt
  maxReplays:        number   // per event lifetime, -1 = unlimited
  alertsEnabled:     boolean  // email on failure
  replayEnabled:     boolean
  retentionAlerts:   boolean  // email 2 days before history deletion
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    priceMonthly:      0,
    maxEventsPerMonth: 1_000,
    maxEndpoints:      1,
    retentionDays:     2,
    maxRetries:        3,
    maxReplays:        3,
    alertsEnabled:     false,
    replayEnabled:     true,
    retentionAlerts:   false,
  },
  starter: {
    priceMonthly:      19,
    maxEventsPerMonth: 50_000,
    maxEndpoints:      5,
    retentionDays:     30,
    maxRetries:        7,
    maxReplays:        -1,
    alertsEnabled:     true,
    replayEnabled:     true,
    retentionAlerts:   true,
  },
}

export function getPlanLimits(planId: PlanId): PlanLimits {
  return PLANS[planId] ?? PLANS.free
}

export function isUnlimited(value: number): boolean {
  return value === -1
}
