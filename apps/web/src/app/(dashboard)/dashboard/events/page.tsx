'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Copy } from 'lucide-react'
import type { EventResponse, EventsCursor, PaginatedEventsResponse } from '../../../../lib/api-types'
import { getAccessToken } from '../../../../lib/access-token'
import { apiFetch } from '../../../../lib/http'
import { useDashboardData } from '../../../../lib/use-dashboard-data'
import { useMobile } from '../../../../lib/hooks/use-mobile'
import { BottomSheet } from '../_components/ui/bottom-sheet'
import { EmptyState } from '../_components/ui/empty-state'
import { EventRow } from '../_components/ui/event-row'
import { SlideOver } from '../_components/ui/slide-over'
import { UpgradeGate } from '../_components/ui/upgrade-gate'

const PAGE_SIZE = 30

type DateFilter = '24h' | '7d' | 'custom'
type StatusFilter = 'DELIVERED' | 'FAILED' | 'PENDING' | 'DELIVERING'

function formatExactTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function relative(value: string) {
  const delta = Date.now() - new Date(value).getTime()
  const mins = Math.max(1, Math.floor(delta / 60000))
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  return `${Math.floor(hrs / 24)} d ago`
}

function EventMobileCard({
  event,
  expanded,
  onToggle,
  onRescue,
  onViewPayload,
  plan,
}: {
  event: EventResponse
  expanded: boolean
  onToggle: () => void
  onRescue: () => void
  onViewPayload: () => void
  plan: 'free' | 'starter'
}) {
  const endpointLabel = event.endpointName ?? event.destinationUrl ?? 'Unknown endpoint'

  return (
    <article className="rounded-xl border border-white/10 bg-[#111111]">
      <button className="w-full px-4 py-4 text-left" onClick={onToggle} type="button">
        <div className="flex items-center justify-between">
          <p className="truncate text-sm text-white">● {event.type}</p>
          <ChevronDown className={`h-4 w-4 text-[#a1a1aa] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
        <p className="mt-1 text-xs text-[#a1a1aa]">{event.status}</p>
        <p className="mt-1 truncate text-xs text-[#a1a1aa]">→ {endpointLabel}</p>
        <p className="mt-1 text-xs text-[#71717a]">{formatExactTime(event.receivedAt)} · {event.attempts} attempts</p>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-white/10 px-4 py-4">
          <p className="text-xs text-[#a1a1aa]">Stripe ID: {event.stripeId}</p>
          <div className="space-y-1 text-xs text-[#a1a1aa]">
            {event.eventAttempts.map((attempt) => (
              <p key={attempt.id}>
                {attempt.attempt}. {formatExactTime(attempt.createdAt)} - {attempt.status ?? 'PENDING'}
              </p>
            ))}
          </div>

          <UpgradeGate
            currentUsage={event.replayCount}
            feature="replay_limit"
            plan={plan}
            variant="bottom-sheet"
          >
            <button className="h-11 w-full rounded-lg bg-[#22c55e] text-sm font-medium text-[#031108]" onClick={onRescue} type="button">
              Rescue
            </button>
          </UpgradeGate>

          <button
            className="h-11 w-full rounded-lg border border-white/10 bg-white/5 text-sm text-white"
            onClick={onViewPayload}
            type="button"
          >
            View payload
          </button>
        </div>
      ) : null}
    </article>
  )
}

export default function EventsPage() {
  const isMobile = useMobile()
  const { me, endpoints, loading: dashboardLoading, error: dashboardError } = useDashboardData()

  const [items, setItems] = useState<EventResponse[]>([])
  const [nextCursor, setNextCursor] = useState<EventsCursor | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rescueLoading, setRescueLoading] = useState<string | null>(null)
  const [payloadOpen, setPayloadOpen] = useState(false)
  const [payloadEvent, setPayloadEvent] = useState<EventResponse | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [statusFilters, setStatusFilters] = useState<StatusFilter[]>([])
  const [endpointFilter, setEndpointFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('7d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const fetchPage = useCallback(
    async (cursor?: EventsCursor | null) => {
      const token = await getAccessToken()
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      if (endpointFilter !== 'all') {
        params.set('endpointId', endpointFilter)
      }
      if (cursor) {
        params.set('cursorReceivedAt', cursor.cursorReceivedAt)
        params.set('cursorId', cursor.cursorId)
      }

      return apiFetch<PaginatedEventsResponse>(`/events?${params.toString()}`, token)
    },
    [endpointFilter]
  )

  useEffect(() => {
    async function loadInitial() {
      setIsLoading(true)
      setError(null)
      try {
        const page = await fetchPage(null)
        setItems(page.items)
        setHasMore(page.hasMore)
        setNextCursor(page.nextCursor)
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load events.')
      } finally {
        setIsLoading(false)
      }
    }

    void loadInitial()
  }, [fetchPage])

  async function loadMore() {
    if (!hasMore || !nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const page = await fetchPage(nextCursor)
      setItems((current) => [...current, ...page.items])
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
    } finally {
      setIsLoadingMore(false)
    }
  }

  async function rescueEvent(eventId: string) {
    setRescueLoading(eventId)
    try {
      const token = await getAccessToken()
      await apiFetch(`/events/${eventId}/replay`, token, { method: 'POST' })
      setItems((current) =>
        current.map((event) =>
          event.id === eventId
            ? { ...event, status: 'PENDING', replayCount: event.replayCount + 1 }
            : event
        )
      )
    } finally {
      setRescueLoading(null)
    }
  }

  const filtered = useMemo(() => {
    return items.filter((event) => {
      if (statusFilters.length > 0 && !statusFilters.includes(event.status as StatusFilter)) {
        return false
      }

      const timestamp = new Date(event.receivedAt).getTime()
      const now = Date.now()
      if (dateFilter === '24h' && now - timestamp > 24 * 60 * 60 * 1000) return false
      if (dateFilter === '7d' && now - timestamp > 7 * 24 * 60 * 60 * 1000) return false
      if (dateFilter === 'custom' && customStart && customEnd) {
        const from = new Date(customStart).getTime()
        const to = new Date(customEnd).getTime()
        if (timestamp < from || timestamp > to + 24 * 60 * 60 * 1000) return false
      }
      return true
    })
  }, [items, statusFilters, dateFilter, customStart, customEnd])

  const activeFilterCount =
    statusFilters.length +
    (endpointFilter === 'all' ? 0 : 1) +
    (dateFilter === '7d' ? 0 : 1)

  if (dashboardLoading || isLoading) {
    return <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-[#111111]" />
  }

  if (dashboardError || error || !me) {
    return <p className="text-sm text-[#ef4444]">{dashboardError ?? error ?? 'Could not load events.'}</p>
  }

  if (items.length === 0) {
    return <EmptyState description="No events captured yet." title="No events yet" />
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="font-display text-2xl text-white">Events</h1>
        <p className="text-sm text-[#a1a1aa]">Full history and investigation timeline.</p>
      </header>

      {isMobile ? (
        <div className="flex items-center gap-2">
          <button
            className="h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
            onClick={() => setFiltersOpen(true)}
            type="button"
          >
            Filters ({activeFilterCount})
          </button>
          <button
            className="h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-[#a1a1aa]"
            onClick={() => {
              setStatusFilters([])
              setEndpointFilter('all')
              setDateFilter('7d')
              setCustomStart('')
              setCustomEnd('')
            }}
            type="button"
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-[#111111] p-3">
          <div className="flex flex-wrap items-center gap-2">
            {(['DELIVERED', 'FAILED', 'PENDING', 'DELIVERING'] as const).map((status) => {
              const active = statusFilters.includes(status)
              return (
                <button
                  className={`h-11 rounded-full border px-3 text-xs ${
                    active ? 'border-green-500 bg-green-500/15 text-green-200' : 'border-white/10 bg-white/5 text-[#a1a1aa]'
                  }`}
                  key={status}
                  onClick={() => {
                    setStatusFilters((current) =>
                      current.includes(status) ? current.filter((entry) => entry !== status) : [...current, status]
                    )
                  }}
                  type="button"
                >
                  {status}
                </button>
              )
            })}

            <select
              className="h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
              onChange={(event) => setEndpointFilter(event.target.value)}
              value={endpointFilter}
            >
              <option value="all">All endpoints</option>
              {endpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.name}
                </option>
              ))}
            </select>

            {(['24h', '7d'] as const).map((range) => (
              <button
                className={`h-11 rounded-full border px-3 text-xs ${
                  dateFilter === range ? 'border-green-500 bg-green-500/15 text-green-200' : 'border-white/10 bg-white/5 text-[#a1a1aa]'
                }`}
                key={range}
                onClick={() => setDateFilter(range)}
                type="button"
              >
                {range}
              </button>
            ))}

            <UpgradeGate
              feature="date_filter_custom"
              plan={me.plan}
              variant={isMobile ? 'bottom-sheet' : 'tooltip'}
            >
              <button
                className={`h-11 rounded-full border px-3 text-xs ${
                  dateFilter === 'custom' ? 'border-green-500 bg-green-500/15 text-green-200' : 'border-white/10 bg-white/5 text-[#a1a1aa]'
                }`}
                onClick={() => setDateFilter('custom')}
                type="button"
              >
                Custom
              </button>
            </UpgradeGate>
          </div>

          {dateFilter === 'custom' && me.plan === 'starter' ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                className="h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
                onChange={(event) => setCustomStart(event.target.value)}
                type="date"
                value={customStart}
              />
              <input
                className="h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
                onChange={(event) => setCustomEnd(event.target.value)}
                type="date"
                value={customEnd}
              />
            </div>
          ) : null}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState description="No events match selected filters." title="No matches" />
      ) : isMobile ? (
        <div className="space-y-3">
          {filtered.map((event) => (
            <EventMobileCard
              event={event}
              expanded={expanded === event.id}
              key={event.id}
              onRescue={() => {
                void rescueEvent(event.id)
              }}
              onToggle={() => setExpanded((current) => (current === event.id ? null : event.id))}
              onViewPayload={() => {
                setPayloadEvent(event)
                setPayloadOpen(true)
              }}
              plan={me.plan}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((event) => (
            <EventRow
              event={{
                id: event.id,
                type: event.type,
                status: event.status,
                attempts: event.attempts,
                destinationUrl: event.destinationUrl,
                endpointName: event.endpointName,
                receivedAt: event.receivedAt,
                lastAttemptStatus: event.lastAttemptStatus,
              }}
              expanded={expanded === event.id}
              key={event.id}
              onRescue={event.status === 'FAILED' ? () => void rescueEvent(event.id) : undefined}
              onToggle={() => setExpanded((current) => (current === event.id ? null : event.id))}
              rescuePending={rescueLoading === event.id}
            >
              <div className="space-y-2 text-sm text-[#a1a1aa]">
                <p>Stripe ID: {event.stripeId}</p>
                <p>Received: {formatExactTime(event.receivedAt)}</p>
                <button
                  className="inline-flex h-11 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white"
                  onClick={() => {
                    setPayloadEvent(event)
                    setPayloadOpen(true)
                  }}
                  type="button"
                >
                  View payload
                </button>
              </div>
            </EventRow>
          ))}
        </div>
      )}

      {hasMore ? (
        <button
          className="inline-flex h-11 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white"
          disabled={isLoadingMore}
          onClick={() => {
            void loadMore()
          }}
          type="button"
        >
          {isLoadingMore ? 'Loading...' : 'Load more'}
        </button>
      ) : null}

      <BottomSheet onClose={() => setFiltersOpen(false)} open={filtersOpen} title="Filters">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-white">Status</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['DELIVERED', 'FAILED', 'PENDING', 'DELIVERING'] as const).map((status) => {
                const active = statusFilters.includes(status)
                return (
                  <button
                    className={`h-11 rounded-full border px-3 text-xs ${
                      active ? 'border-green-500 bg-green-500/15 text-green-200' : 'border-white/10 bg-white/5 text-[#a1a1aa]'
                    }`}
                    key={status}
                    onClick={() => {
                      setStatusFilters((current) =>
                        current.includes(status) ? current.filter((entry) => entry !== status) : [...current, status]
                      )
                    }}
                    type="button"
                  >
                    {status}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-sm text-white">Endpoint</p>
            <select
              className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
              onChange={(event) => setEndpointFilter(event.target.value)}
              value={endpointFilter}
            >
              <option value="all">All endpoints</option>
              {endpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-sm text-white">Date range</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="h-11 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-[#a1a1aa]" onClick={() => setDateFilter('24h')} type="button">24h</button>
              <button className="h-11 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-[#a1a1aa]" onClick={() => setDateFilter('7d')} type="button">7d</button>
              <UpgradeGate feature="date_filter_custom" plan={me.plan} variant="bottom-sheet">
                <button className="h-11 rounded-full border border-zinc-700 bg-zinc-700 px-3 text-xs text-zinc-200" type="button">
                  Custom
                </button>
              </UpgradeGate>
            </div>
          </div>

          <button className="h-11 w-full rounded-lg bg-[#22c55e] text-sm font-medium text-[#031108]" onClick={() => setFiltersOpen(false)} type="button">
            Apply filters
          </button>
        </div>
      </BottomSheet>

      {isMobile ? (
        <BottomSheet onClose={() => setPayloadOpen(false)} open={payloadOpen} title="Raw payload">
          {payloadEvent ? (
            <>
              <button
                className="mb-3 inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
                onClick={() => {
                  void navigator.clipboard.writeText(JSON.stringify(payloadEvent.payload, null, 2))
                }}
                type="button"
              >
                <Copy className="h-4 w-4" />
                Copy
              </button>
              <pre className="max-h-[70vh] overflow-auto rounded-lg border border-white/10 bg-[#111111] p-3 text-xs text-white">
                {JSON.stringify(payloadEvent.payload, null, 2)}
              </pre>
            </>
          ) : null}
        </BottomSheet>
      ) : (
        <SlideOver onClose={() => setPayloadOpen(false)} open={payloadOpen} title="Raw payload">
          {payloadEvent ? (
            <pre className="overflow-auto rounded-lg border border-white/10 bg-[#111111] p-3 text-xs text-white">
              {JSON.stringify(payloadEvent.payload, null, 2)}
            </pre>
          ) : null}
        </SlideOver>
      )}
    </section>
  )
}
