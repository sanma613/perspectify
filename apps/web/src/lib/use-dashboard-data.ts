'use client'

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch } from './http'
import { getAccessToken } from './access-token'
import { createClient } from './supabase/client'
import type { EndpointResponse, MeResponse, PaginatedEventsResponse } from './api-types'

interface DashboardDataState {
  me: MeResponse | null
  endpoints: EndpointResponse[]
  eventsThisMonth: number
  loading: boolean
  error: string | null
}

interface DashboardDataContextValue extends DashboardDataState {
  refresh: () => Promise<void>
}

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null)

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DashboardDataState>({
    me: null,
    endpoints: [],
    eventsThisMonth: 0,
    loading: true,
    error: null,
  })

  const fetchDashboardData = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setState((previous) => ({ ...previous, loading: true, error: null }))
      }
      const token = await getAccessToken()

      // Resolve the plan/profile first so UI can render stable static shell immediately.
      const me = await apiFetch<MeResponse>('/me', token)

      setState((previous) => ({
        ...previous,
        me,
        loading: true,
        error: silent ? previous.error : null,
      }))

      const [endpoints, eventsUsage] = await Promise.all([
        apiFetch<EndpointResponse[]>('/endpoints', token),
        apiFetch<PaginatedEventsResponse>('/events?limit=1', token),
      ])

      setState((previous) => ({
        me,
        endpoints,
        eventsThisMonth: eventsUsage.totalCount,
        loading: false,
        error: silent ? previous.error : null,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load dashboard data.'
      setState((previous) => ({
        ...previous,
        loading: false,
        error: silent ? previous.error : message,
      }))
    }
  }, [])

  const refresh = useCallback(async () => fetchDashboardData(false), [fetchDashboardData])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const userId = state.me?.id
    const endpointIds = state.endpoints.map((endpoint) => endpoint.id)
    if (!userId || endpointIds.length === 0) return

    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let refreshTimeout: number | null = null

    const scheduleRefresh = () => {
      if (refreshTimeout !== null) return
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null
        void fetchDashboardData(true)
      }, 250)
    }

    const subscribe = () => {
      if (channel || document.hidden) return

      channel = supabase
        .channel(`dashboard-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'events',
            filter: `endpoint_id=in.(${endpointIds.join(',')})`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setState((previous) => ({
                ...previous,
                eventsThisMonth: previous.eventsThisMonth + 1,
              }))
              return
            }

            if (payload.eventType === 'UPDATE') {
              scheduleRefresh()
            }
          }
        )
        .subscribe()
    }

    const unsubscribe = () => {
      if (!channel) return
      void supabase.removeChannel(channel)
      channel = null
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        unsubscribe()
        return
      }

      void fetchDashboardData(true)
      subscribe()
    }

    subscribe()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (refreshTimeout !== null) {
        window.clearTimeout(refreshTimeout)
      }
      unsubscribe()
    }
  }, [fetchDashboardData, state.endpoints, state.me?.id])

  const value = useMemo(
    () => ({
      ...state,
      refresh,
    }),
    [state, refresh]
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
