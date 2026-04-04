import type { PlanId, PlanLimits } from './capabilities'

export interface MeResponse {
  id: string
  email: string
  plan: PlanId
  onboardingCompleted: boolean
  limits: PlanLimits
  usage: {
    replaysUsed: number
  }
}

export interface EndpointResponse {
  id: string
  userId: string
  name: string
  destination: string
  tokenPrefix: string
  tokenRotatedAt: string | null
  createdAt: string
}

export interface DeliveryResponse {
  id: string
  eventId: string
  attempt: number
  status: 'SUCCESS' | 'FAILED'
  statusCode: number | null
  error: string | null
  attemptedAt: string
}

export interface EventAttemptResponse {
  id: string
  eventId: string
  attempt: number
  status: number | null
  durationMs: number | null
  attemptStartedAt: string | null
  responseReceivedAt: string | null
  requestHeaders: Record<string, string> | null
  responseHeaders: Record<string, string> | null
  responseBody: string | null
  failureCategory: string | null
  error: string | null
  createdAt: string
}

export interface EventResponse {
  id: string
  endpointId: string
  endpointName?: string | null
  stripeId: string
  type: string
  payload?: Record<string, unknown>
  payloadSize: number | null
  sourceHeaders?: Record<string, string> | null
  destinationUrl: string | null
  providerName: string | null
  ingestionLatencyMs: number | null
  stripeGeneratedAt: string | null
  signatureValid: boolean
  failureCategory?: string | null
  status: 'PENDING' | 'DELIVERING' | 'DELIVERED' | 'FAILED'
  attempts: number
  replayCount: number
  lastAttemptStatus: number | null
  lastError?: string | null
  receivedAt: string
  deliveredAt: string | null
  deliveries?: DeliveryResponse[]
  eventAttempts: EventAttemptResponse[]
}

export interface EventDetailResponse extends EventResponse {
  endpoint: {
    id: string
    name: string
    destination: string
  } | null
  deliveries: DeliveryResponse[]
}

export interface EventsCursor {
  cursorReceivedAt: string
  cursorId: string
}

export interface PaginatedEventsResponse {
  items: EventResponse[]
  hasMore: boolean
  nextCursor: EventsCursor | null
  totalCount: number
}

export interface DashboardEventStatsResponse {
  eventsThisMonth: number
  delivered: number
  failed: number
  pending: number
  avgResponseMs: number | null
  failedRecent: Array<EventResponse & { latestAttempt: EventAttemptResponse | null }>
  recentDelivered: Array<EventResponse & { latestAttempt: EventAttemptResponse | null }>
}
