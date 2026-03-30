// packages/db/src/plans.ts
// Fuente única de verdad para los límites de cada plan.
// Para agregar un plan nuevo: solo agrega una entrada aquí.
// Nada más cambia.

export type PlanId = 'free' | 'starter' | 'growth' | 'pro'

export interface PlanLimits {
  maxEventsPerMonth: number
  maxEndpoints: number
  retentionDays: number
  maxRetries: number
  maxReplays: number
  alertsEnabled: boolean
  replayEnabled: boolean
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    maxEventsPerMonth: 2_500,
    maxEndpoints:      1,
    retentionDays:     1,      // 24h — el dolor que los mueve a pagar
    maxRetries:        3,
    maxReplays:        3,
    alertsEnabled:     false,
    replayEnabled:     false,  // ven el botón pero no pueden usarlo
  },
  starter: {
    maxEventsPerMonth: 100_000,
    maxEndpoints:      3,
    retentionDays:     30,
    maxRetries:        7,
    maxReplays:        -1,
    alertsEnabled:     true,
    replayEnabled:     true,
  },
  growth: {
    maxEventsPerMonth: 500_000,
    maxEndpoints:      10,
    retentionDays:     90,
    maxRetries:        7,
    maxReplays:        -1,
    alertsEnabled:     true,
    replayEnabled:     true,
  },
  pro: {
    maxEventsPerMonth: 2_000_000,
    maxEndpoints:      -1,     // -1 = ilimitado
    retentionDays:     365,
    maxRetries:        7,
    maxReplays:        -1,
    alertsEnabled:     true,
    replayEnabled:     true,
  },
}

export function getPlanLimits(planId: PlanId): PlanLimits {
  return PLANS[planId] ?? PLANS.free
}

export function isUnlimited(value: number): boolean {
  return value === -1
}
