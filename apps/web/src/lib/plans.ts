export type PlanId = 'free' | 'starter'

export interface PlanLimits {
  priceMonthly: number
  maxEventsPerMonth: number
  maxEndpoints: number
  retentionDays: number
  maxRetries: number
  maxReplays: number
  alertsEnabled: boolean
  replayEnabled: boolean
  retentionAlerts: boolean
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    priceMonthly: 0,
    maxEventsPerMonth: 1000,
    maxEndpoints: 1,
    retentionDays: 2,
    maxRetries: 3,
    maxReplays: 3,
    alertsEnabled: false,
    replayEnabled: true,
    retentionAlerts: false,
  },
  starter: {
    priceMonthly: 19,
    maxEventsPerMonth: 50000,
    maxEndpoints: 5,
    retentionDays: 30,
    maxRetries: 7,
    maxReplays: -1,
    alertsEnabled: true,
    replayEnabled: true,
    retentionAlerts: true,
  },
}

export function getPlanLimits(planId: PlanId): PlanLimits {
  return PLANS[planId] ?? PLANS.free
}
