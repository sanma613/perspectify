'use client'

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { apiFetch } from './http'
import { getAccessToken } from './access-token'
import { createClient } from './supabase/client'
import type { DashboardEventStatsResponse, EndpointResponse, EventResponse, MeResponse } from './api-types'

interface DashboardDataState {
  me: MeResponse | null
  endpoints: EndpointResponse[]
  eventsThisMonth: number
  eventStats: DashboardEventStatsResponse | null
  loading: boolean
  error: string | null
}

interface DashboardDataContextValue extends DashboardDataState {
  refresh: () => Promise<void>
  realtimeStatus: 'connecting' | 'live' | 'error'
  pendingBuffer: EventResponse[]
  showPendingBanner: boolean
  flushPendingBuffer: () => void
}

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null)

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DashboardDataState>({
    me: null,
    endpoints: [],
    eventsThisMonth: 0,
    eventStats: null,
    loading: true,
    error: null,
  })
  const supabase = useMemo(() => createClient(), [])
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([])
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'error'>('connecting')
  const [pendingBuffer, setPendingBuffer] = useState<EventResponse[]>([])
  const [showPendingBanner, setShowPendingBanner] = useState(false)
  const BURST_THRESHOLD = 5

  const setupRealtime = useCallback(
    (endpointIds: string[]) => {
      channelsRef.current.forEach((ch) => {
        void supabase.removeChannel(ch)
      })
      channelsRef.current = []
      setRealtimeStatus('connecting')

      if (endpointIds.length === 0) return

      const eventsChannel = supabase
        .channel('dashboard-events')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'events',
            filter: `endpoint_id=in.(${endpointIds.join(',')})`,
          },
          (payload) => {
            const newEvent = payload.new as EventResponse

            setState((previous) => {
              const nextEventStats = previous.eventStats
                ? {
                    ...previous.eventStats,
                    eventsThisMonth: previous.eventStats.eventsThisMonth + 1,
                  }
                : previous.eventStats

              return {
                ...previous,
                eventsThisMonth: previous.eventsThisMonth + 1,
                eventStats: nextEventStats,
              }
            })

            setPendingBuffer((previous) => {
              const next = [...previous, newEvent]
              if (next.length > BURST_THRESHOLD) {
                setShowPendingBanner(true)
                return next
              }
              return next
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'events',
            filter: `endpoint_id=in.(${endpointIds.join(',')})`,
          },
          (payload) => {
            const updated = payload.new as EventResponse
            const previousRow = payload.old as Partial<EventResponse>

            setState((previous) => {
              if (!previous.eventStats) return previous

              const patchList = <T extends { id: string }>(list: T[]) =>
                list.map((entry) => (entry.id === updated.id ? ({ ...entry, ...updated } as T) : entry))

              let deliveredDelta = 0
              let failedDelta = 0

              if (previousRow.status !== 'DELIVERED' && updated.status === 'DELIVERED') {
                deliveredDelta = 1
              }
              if (previousRow.status !== 'FAILED' && updated.status === 'FAILED') {
                failedDelta = 1
              }
              if (previousRow.status === 'FAILED' && updated.status !== 'FAILED') {
                failedDelta = -1
              }

              return {
                ...previous,
                eventStats: {
                  ...previous.eventStats,
                  delivered: previous.eventStats.delivered + deliveredDelta,
                  failed: Math.max(0, previous.eventStats.failed + failedDelta),
                  recentDelivered: patchList(previous.eventStats.recentDelivered ?? []),
                  failedRecent: patchList(previous.eventStats.failedRecent ?? []).filter(
                    (entry) => entry.status === 'FAILED'
                  ),
                },
              }
            })
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setRealtimeStatus('live')
            console.log('[realtime] events channel subscribed')
          }
          if (status === 'CHANNEL_ERROR') {
            setRealtimeStatus('error')
            console.error('[realtime] events channel error')
          }
          if (status === 'CLOSED') {
            setRealtimeStatus('connecting')
          }
        })

      channelsRef.current.push(eventsChannel)

      const endpointsChannel = supabase
        .channel('dashboard-endpoints')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'endpoints' },
          (payload) => {
            setState((previous) => ({
              ...previous,
              endpoints: [...previous.endpoints, payload.new as EndpointResponse],
            }))
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'endpoints' },
          (payload) => {
            const removedEndpoint = payload.old as EndpointResponse
            setState((previous) => ({
              ...previous,
              endpoints: previous.endpoints.filter((endpoint) => endpoint.id !== removedEndpoint.id),
            }))
          }
        )
        .subscribe()

      channelsRef.current.push(endpointsChannel)
    },
    [supabase]
  )

  const loadInitialData = useCallback(async () => {
    try {
      setState((previous) => ({ ...previous, loading: true, error: null }))
      const token = await getAccessToken()

      const [me, eventStats, endpoints] = await Promise.all([
        apiFetch<MeResponse>('/me', token),
        apiFetch<DashboardEventStatsResponse>('/events/stats', token),
        apiFetch<EndpointResponse[]>('/endpoints', token),
      ])

      setState(() => ({
        me,
        endpoints,
        eventsThisMonth: eventStats.eventsThisMonth,
        eventStats,
        loading: false,
        error: null,
      }))
    } catch (err) {
      console.error('[dashboard] initial load error:', err)
      setState((previous) => ({ ...previous, error: 'Failed to load dashboard data', loading: false }))
    }
  }, [])

  const refresh = loadInitialData

  useEffect(() => {
    void loadInitialData()
  }, [])

  useEffect(() => {
    if (state.loading) return
    const endpointIds = state.endpoints.map((endpoint) => endpoint.id)
    setupRealtime(endpointIds)

    return () => {
      channelsRef.current.forEach((ch) => {
        void supabase.removeChannel(ch)
      })
      channelsRef.current = []
    }
  }, [state.endpoints.map((endpoint) => endpoint.id).join(','), state.loading, setupRealtime])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        channelsRef.current.forEach((ch) => {
          void supabase.removeChannel(ch)
        })
        channelsRef.current = []
        setRealtimeStatus('connecting')
      } else {
        const endpointIds = state.endpoints.map((endpoint) => endpoint.id)
        setupRealtime(endpointIds)
        setPendingBuffer([])
        setShowPendingBanner(false)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      channelsRef.current.forEach((ch) => {
        void supabase.removeChannel(ch)
      })
      channelsRef.current = []
    }
  }, [state.endpoints, setupRealtime, supabase])

  useEffect(() => {
    if (pendingBuffer.length === 0 || pendingBuffer.length > BURST_THRESHOLD) return

    setState((previous) => {
      if (!previous.eventStats) return previous
      const deliveredBuffer = pendingBuffer
        .filter((entry) => entry.status === 'DELIVERED')
        .map((entry) => ({ ...entry, latestAttempt: null }))
      const failedBuffer = pendingBuffer
        .filter((entry) => entry.status === 'FAILED')
        .map((entry) => ({ ...entry, latestAttempt: null }))
      return {
        ...previous,
        eventStats: {
          ...previous.eventStats,
          recentDelivered: [...deliveredBuffer, ...(previous.eventStats.recentDelivered ?? [])].slice(0, 10),
          failedRecent: [...failedBuffer, ...(previous.eventStats.failedRecent ?? [])].slice(0, 5),
        },
      }
    })
    setPendingBuffer([])
  }, [pendingBuffer])

  const flushPendingBuffer = useCallback(() => {
    setState((previous) => {
      if (!previous.eventStats) return previous
      const deliveredBuffer = pendingBuffer
        .filter((entry) => entry.status === 'DELIVERED')
        .map((entry) => ({ ...entry, latestAttempt: null }))
      const failedBuffer = pendingBuffer
        .filter((entry) => entry.status === 'FAILED')
        .map((entry) => ({ ...entry, latestAttempt: null }))
      return {
        ...previous,
        eventStats: {
          ...previous.eventStats,
          recentDelivered: [...deliveredBuffer, ...(previous.eventStats.recentDelivered ?? [])].slice(0, 10),
          failedRecent: [...failedBuffer, ...(previous.eventStats.failedRecent ?? [])].slice(0, 5),
        },
      }
    })
    setPendingBuffer([])
    setShowPendingBanner(false)
  }, [pendingBuffer])

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      realtimeStatus,
      pendingBuffer,
      showPendingBanner,
      flushPendingBuffer,
    }),
    [state, refresh, realtimeStatus, pendingBuffer, showPendingBanner, flushPendingBuffer]
  )

  return createElement(DashboardDataContext.Provider, { value }, children)
}

export function useDashboardData() {
  const context = useContext(DashboardDataContext)
  if (!context) {
    throw new Error('useDashboardData must be used within DashboardDataProvider')
  }

  return context
}
