'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DeliveryResponse, EventAttemptResponse } from './api-types'
import { createClient } from './supabase/client'

type RealtimeStatus = 'connecting' | 'live' | 'error'

type UseEventAttemptsRealtimeOptions = {
  eventId: string | null
  enabled: boolean
}

type RealtimeRow = Record<string, unknown>

function toIsoString(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null
  return value
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function toStringMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, string>
}

function toEventAttempt(row: RealtimeRow): EventAttemptResponse | null {
  const id = typeof row.id === 'string' ? row.id : null
  const eventId = typeof row.eventId === 'string' ? row.eventId : typeof row.event_id === 'string' ? row.event_id : null
  const attempt = typeof row.attempt === 'number' ? row.attempt : null
  if (!id || !eventId || attempt === null) return null

  return {
    id,
    eventId,
    attempt,
    status: toNullableNumber(row.status),
    durationMs: toNullableNumber(row.durationMs ?? row.duration_ms),
    attemptStartedAt: toIsoString(row.attemptStartedAt ?? row.attempt_started_at),
    responseReceivedAt: toIsoString(row.responseReceivedAt ?? row.response_received_at),
    requestHeaders: toStringMap(row.requestHeaders ?? row.request_headers),
    responseHeaders: toStringMap(row.responseHeaders ?? row.response_headers),
    responseBody: typeof (row.responseBody ?? row.response_body) === 'string' ? (row.responseBody ?? row.response_body) as string : null,
    failureCategory: typeof (row.failureCategory ?? row.failure_category) === 'string' ? (row.failureCategory ?? row.failure_category) as string : null,
    error: typeof row.error === 'string' ? row.error : null,
    createdAt: toIsoString(row.createdAt ?? row.created_at) ?? new Date().toISOString(),
  }
}

function toDelivery(row: RealtimeRow): DeliveryResponse | null {
  const id = typeof row.id === 'string' ? row.id : null
  const eventId = typeof row.eventId === 'string' ? row.eventId : typeof row.event_id === 'string' ? row.event_id : null
  const attempt = typeof row.attempt === 'number' ? row.attempt : null
  if (!id || !eventId || attempt === null) return null

  return {
    id,
    eventId,
    attempt,
    status: (row.status === 'SUCCESS' || row.status === 'FAILED') ? row.status : 'FAILED',
    statusCode: toNullableNumber(row.statusCode ?? row.status_code),
    error: typeof row.error === 'string' ? row.error : null,
    attemptedAt: toIsoString(row.attemptedAt ?? row.attempted_at) ?? new Date().toISOString(),
  }
}

function mergeAttempts(current: EventAttemptResponse[], incoming: EventAttemptResponse) {
  const key = `${incoming.eventId}:${incoming.attempt}`
  const map = new Map<string, EventAttemptResponse>()
  for (const item of current) {
    map.set(`${item.eventId}:${item.attempt}`, item)
  }
  map.set(key, incoming)
  return Array.from(map.values()).sort((a, b) => a.attempt - b.attempt)
}

function mergeDeliveries(current: DeliveryResponse[], incoming: DeliveryResponse) {
  const key = `${incoming.eventId}:${incoming.attempt}`
  const map = new Map<string, DeliveryResponse>()
  for (const item of current) {
    map.set(`${item.eventId}:${item.attempt}`, item)
  }
  map.set(key, incoming)
  return Array.from(map.values()).sort((a, b) => a.attempt - b.attempt)
}

export function useEventAttemptsRealtime({ eventId, enabled }: UseEventAttemptsRealtimeOptions) {
  const supabase = useMemo(() => createClient(), [])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const [realtimeAttempts, setRealtimeAttempts] = useState<EventAttemptResponse[]>([])
  const [realtimeDeliveries, setRealtimeDeliveries] = useState<DeliveryResponse[]>([])
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting')

  const unsubscribe = useCallback(() => {
    if (!channelRef.current) return
    void supabase.removeChannel(channelRef.current)
    channelRef.current = null
  }, [supabase])

  const subscribe = useCallback(() => {
    if (!eventId) return
    unsubscribe()

    const nextChannel = supabase
      .channel(`event-detail-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_attempts',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const parsed = toEventAttempt(payload.new as RealtimeRow)
          if (!parsed) return
          setRealtimeAttempts((current) => mergeAttempts(current, parsed))
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliveries',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const parsed = toDelivery(payload.new as RealtimeRow)
          if (!parsed) return
          setRealtimeDeliveries((current) => mergeDeliveries(current, parsed))
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('live')
        } else if (status === 'CHANNEL_ERROR') {
          setRealtimeStatus('error')
        } else {
          setRealtimeStatus('connecting')
        }
      })

    channelRef.current = nextChannel
  }, [eventId, supabase, unsubscribe])

  useEffect(() => {
    if (!enabled || !eventId) {
      unsubscribe()
      setRealtimeAttempts([])
      setRealtimeDeliveries([])
      setRealtimeStatus('connecting')
      return
    }

    const handleVisibility = () => {
      if (document.hidden) {
        unsubscribe()
        setRealtimeStatus('connecting')
      } else {
        subscribe()
      }
    }

    if (!document.hidden) {
      subscribe()
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribe()
    }
  }, [enabled, eventId, subscribe, unsubscribe])

  return {
    realtimeAttempts,
    realtimeDeliveries,
    realtimeStatus,
  }
}
