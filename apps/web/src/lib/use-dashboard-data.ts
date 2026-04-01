'use client'

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch } from './http'
import { getAccessToken } from './access-token'
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
