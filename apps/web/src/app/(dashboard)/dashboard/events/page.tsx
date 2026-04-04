'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronDown, ChevronRight, Copy, ExternalLink, Loader2 } from 'lucide-react'
import type { EventAttemptResponse, EventDetailResponse, EventResponse } from '../../../../lib/api-types'
import { getAccessToken } from '../../../../lib/access-token'
import { apiFetch } from '../../../../lib/http'
import { useDashboardData } from '../../../../lib/use-dashboard-data'
import { usePaginatedEvents } from '../../../../lib/use-paginated-events'
import { useMobile } from '../../../../lib/hooks/use-mobile'
import { BottomSheet } from '../_components/ui/bottom-sheet'
import { UpgradeGate } from '../_components/ui/upgrade-gate'
import { EventDetailDrawer } from '../_components/event-detail-drawer'
import { CollapsibleSection } from '../../../../components/collapsible-section'
import { HeadersTable } from '../../../../components/headers-table'
import { JsonViewer } from '../../../../components/json-viewer'
import { ResponseBody } from '../../../../components/response-body'

const FAILURE_EXPLANATIONS: Record<string, string> = {
  timeout: 'Perspectify waited 10,000ms for a response and cut the connection. Your destination took too long to reply.',
  dns_error: "The destination URL could not be resolved. The domain may be wrong or your automation tool's server may be down.",
  connection_refused: 'The destination server actively refused the connection. The service may be down or the port blocked.',
  tls_error: 'SSL/TLS handshake failed. The destination may have an invalid or expired certificate.',
  http_4xx: 'The destination rejected the request. This usually means authentication failed or the webhook URL changed.',
  http_5xx: 'The destination had an internal error. Check your Zapier scenario or Make workflow for failures.',
  http_3xx: 'The destination returned a redirect. Perspectify does not follow redirects. Update the destination URL.',
  unknown: 'An unexpected error occurred. Check the error message above for details.',
}

type StatusKey = 'ALL' | 'DELIVERED' | 'FAILED' | 'PENDING'
type DateKey = '24h' | '7d' | '30d' | 'custom'

export default function EventsPage() {
  const isMobile = useMobile()
  const { me, endpoints, loading: dashboardLoading, error: dashboardError } = useDashboardData()

  const [statusFilters, setStatusFilters] = useState<StatusKey[]>(['ALL'])
  const [endpointFilter, setEndpointFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState<DateKey>('7d')
  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [drawerEvent, setDrawerEvent] = useState<EventResponse | null>(null)
  const [detailCache, setDetailCache] = useState<Record<string, EventDetailResponse>>({})
  const [attemptsCache, setAttemptsCache] = useState<Record<string, EventAttemptResponse[]>>({})
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  const [rescuePendingId, setRescuePendingId] = useState<string | null>(null)

  const selectedEndpointIds = endpointFilter === 'all' ? [] : [endpointFilter]

  const {
    events,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    patchEvent,
  } = usePaginatedEvents({
    allEndpointIds: endpoints.map((endpoint) => endpoint.id),
    selectedEndpointIds,
    needsRescue: false,
  })

  const filtered = useMemo(() => {
    return events.filter((event) => {
      const statuses = statusFilters.includes('ALL') ? ['DELIVERED', 'FAILED', 'PENDING', 'DELIVERING'] : statusFilters
      if (!statuses.includes(event.status as StatusKey)) return false

      const receivedAt = new Date(event.receivedAt).getTime()
      const now = Date.now()
      const maxAge = dateFilter === '24h' ? 24 * 60 * 60 * 1000 : dateFilter === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
      if (dateFilter !== 'custom' && now - receivedAt > maxAge) return false

      if (search.trim().length > 0) {
        const query = search.toLowerCase()
        if (!event.type.toLowerCase().includes(query) && !event.stripeId.toLowerCase().includes(query)) {
          return false
        }
      }

      return true
    })
  }, [dateFilter, events, search, statusFilters])

  async function ensureDetail(eventId: string) {
    if (detailCache[eventId]) return detailCache[eventId]
    setLoadingMap((current) => ({ ...current, [eventId]: true }))
    const token = await getAccessToken()
    const detail = await apiFetch<EventDetailResponse>(`/events/${eventId}`, token)
    setDetailCache((current) => ({ ...current, [eventId]: detail }))
    setLoadingMap((current) => ({ ...current, [eventId]: false }))
    return detail
  }

  async function ensureAttempts(eventId: string) {
    if (attemptsCache[eventId]) return attemptsCache[eventId]
    const token = await getAccessToken()
    const data = await apiFetch<{ items: EventAttemptResponse[] }>(`/events/${eventId}/attempts`, token)
    setAttemptsCache((current) => ({ ...current, [eventId]: data.items }))
    return data.items
  }

  async function openRow(event: EventResponse) {
    if (isMobile) {
      setDrawerEvent(event)
      return
    }

    const nextId = expandedId === event.id ? null : event.id
    setExpandedId(nextId)
    if (!nextId) return

    await Promise.all([ensureDetail(event.id), ensureAttempts(event.id)])
  }

  async function replayOrRescue(eventId: string, status: EventResponse['status']) {
    setRescuePendingId(eventId)
    try {
      const token = await getAccessToken()
      const actionPath = status === 'FAILED' ? 'rescue' : 'replay'
      await apiFetch(`/events/${eventId}/${actionPath}`, token, { method: 'POST' })
      patchEvent(eventId, {
        status: 'DELIVERING',
        lastAttemptStatus: null,
      })
    } finally {
      setRescuePendingId(null)
    }
  }

  if (dashboardLoading || loading) {
    return <div className="h-32 animate-pulse rounded-xl border border-white/10 bg-zinc-900" />
  }

  if (!me || dashboardError || error) {
    return <p className="text-sm text-red-400">{dashboardError ?? error ?? 'Could not load events.'}</p>
  }

  const activeFiltersCount =
    (statusFilters.includes('ALL') ? 0 : statusFilters.length) +
    (endpointFilter === 'all' ? 0 : 1) +
    (dateFilter === '7d' ? 0 : 1) +
    (search.trim().length > 0 ? 1 : 0)

  return (
    <section className="space-y-3">
      <div className="sticky top-0 z-20 rounded-xl border border-white/10 bg-zinc-950/90 p-3 backdrop-blur">
        {isMobile ? (
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white" onClick={() => setFiltersOpen(true)} type="button">
              Filters ({activeFiltersCount})
            </button>
            <button
              className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-400"
              onClick={() => {
                setStatusFilters(['ALL'])
                setEndpointFilter('all')
                setDateFilter('7d')
                setSearch('')
              }}
              type="button"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', 'DELIVERED', 'FAILED', 'PENDING'] as const).map((status) => {
              const active = statusFilters.includes(status)
              const className = status === 'DELIVERED'
                ? 'border-green-500/25 bg-green-500/10 text-green-400'
                : status === 'FAILED'
                  ? 'border-red-500/25 bg-red-500/10 text-red-400'
                  : status === 'PENDING'
                    ? 'border-amber-500/25 bg-amber-500/10 text-amber-400'
                    : 'border-white/15 bg-white/10 text-white'

              return (
                <button
                  key={status}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${active ? className : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}
                  onClick={() => {
                    if (status === 'ALL') {
                      setStatusFilters(['ALL'])
                      return
                    }
                    setStatusFilters((current) => {
                      const withoutAll = current.filter((item) => item !== 'ALL')
                      return withoutAll.includes(status)
                        ? (withoutAll.filter((item) => item !== status).length === 0 ? ['ALL'] : withoutAll.filter((item) => item !== status))
                        : [...withoutAll, status]
                    })
                  }}
                  type="button"
                >
                  {status}
                </button>
              )
            })}

            <select
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200"
              value={endpointFilter}
              onChange={(event) => setEndpointFilter(event.target.value)}
            >
              <option value="all">Endpoint</option>
              {endpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>{endpoint.name}</option>
              ))}
            </select>

            {(['24h', '7d', '30d'] as const).map((date) => (
              <button
                key={date}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${dateFilter === date ? 'border-white/15 bg-white/10 text-white' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}
                onClick={() => setDateFilter(date)}
                type="button"
              >
                {date}
              </button>
            ))}

            <UpgradeGate feature="date_filter_custom" plan={me.plan} variant="tooltip">
              <button
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${dateFilter === 'custom' ? 'border-white/15 bg-white/10 text-white' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}
                onClick={() => setDateFilter('custom')}
                type="button"
              >
                Custom {me.plan === 'free' ? '🔒' : ''}
              </button>
            </UpgradeGate>

            <input
              className="min-w-[220px] flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-200"
              placeholder="Search by event type or Stripe ID..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <button
              className="text-xs text-zinc-500 hover:text-zinc-300"
              onClick={() => {
                setStatusFilters(['ALL'])
                setEndpointFilter('all')
                setDateFilter('7d')
                setSearch('')
              }}
              type="button"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/70">
        {filtered.map((event) => {
          const attempts = attemptsCache[event.id] ?? detailCache[event.id]?.eventAttempts ?? event.eventAttempts
          const detail = detailCache[event.id]
          const expanded = expandedId === event.id
          const loadingDetail = loadingMap[event.id] ?? false
          const latestAttempt = attempts[attempts.length - 1] ?? null

          return (
            <div key={event.id}>
              <button
                className="flex h-14 w-full items-center gap-3 border-b border-white/5 px-4 text-left transition hover:bg-white/[0.02]"
                onClick={() => {
                  void openRow(event)
                }}
                type="button"
                title={new Date(event.receivedAt).toISOString()}
              >
                <StatusDot status={event.status} />
                <span className="max-w-[220px] truncate font-mono text-sm text-zinc-200">{event.type}</span>
                <span className="max-w-[160px] truncate text-xs text-zinc-500">→ {event.endpointName ?? 'Unknown endpoint'}</span>
                <span className="ml-auto" />
                {event.ingestionLatencyMs !== null && event.ingestionLatencyMs > 0 ? (
                  <span className="font-mono text-xs text-zinc-600" title="Time between Stripe sending and Perspectify receiving">
                    {event.ingestionLatencyMs}ms ingestion
                  </span>
                ) : null}
                <span className="text-xs tabular-nums text-zinc-500">{relativeTime(event.receivedAt)}</span>
                {event.attempts > 1 ? (
                  <span className={`font-mono text-xs ${event.attempts < me.limits.maxRetries ? 'text-amber-400' : 'text-red-400'}`}>
                    {event.attempts} attempts
                  </span>
                ) : null}
                {expanded ? <ChevronDown size={16} className="text-zinc-600" /> : <ChevronRight size={16} className="text-zinc-600" />}
              </button>

              {!isMobile && expanded ? (
                <div className="border-b border-white/10 bg-white/[0.015] px-4 py-5">
                  {loadingDetail ? (
                    <div className="space-y-2">
                      <div className="h-4 w-1/3 animate-pulse rounded bg-white/10" />
                      <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
                      <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
                    </div>
                  ) : (
                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
                      <div>
                        <MetadataGrid event={detail ?? event} maxRetries={me.limits.maxRetries} />
                        <Timeline attempts={attempts} />
                      </div>

                      <div>
                        <div className="mb-4 rounded-xl border border-white/10 bg-[#1a1a1a] p-4">
                          <button
                            className={`w-full rounded-xl py-2.5 text-sm font-bold ${event.status === 'FAILED' ? 'bg-green-500 text-black' : 'bg-zinc-700 text-white'}`}
                            onClick={() => {
                              void replayOrRescue(event.id, event.status)
                            }}
                            type="button"
                            disabled={rescuePendingId === event.id}
                          >
                            {rescuePendingId === event.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : event.status === 'FAILED' ? 'Rescue' : 'Replay'}
                          </button>
                          <p className="mt-2 text-center text-xs text-zinc-600">
                            {event.status === 'FAILED' ? 'Re-queues this event for immediate delivery' : 'Sends the same payload again and may cause duplicates'}
                          </p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-[#1a1a1a] p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-xs uppercase tracking-widest text-zinc-600">Payload</p>
                            <button
                              className="text-xs text-zinc-500 hover:text-zinc-300"
                              onClick={() => {
                                void navigator.clipboard.writeText(JSON.stringify((detail ?? event).payload ?? {}, null, 2))
                              }}
                              type="button"
                            >
                              Copy JSON
                            </button>
                          </div>

                          {(detail ?? event).payload ? (
                            <div className="json-scroll max-h-[280px] overflow-y-auto">
                              <JsonViewer data={(detail ?? event).payload ?? {}} defaultExpanded={1} />
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
                              <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
                              <div className="h-3 w-4/5 animate-pulse rounded bg-white/10" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {latestAttempt?.failureCategory ? <FailureHint category={latestAttempt.failureCategory} /> : null}
            </div>
          )
        })}
      </div>

      {hasMore ? (
        <button
          className="rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-white"
          onClick={() => {
            void loadMore()
          }}
          type="button"
          disabled={loadingMore}
        >
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      ) : null}

      <BottomSheet onClose={() => setFiltersOpen(false)} open={filtersOpen} title="Filters">
        <div className="space-y-3">
          <input
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-200"
            placeholder="Search by event type or Stripe ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="w-full rounded-lg bg-green-500 py-2 text-sm font-bold text-black" onClick={() => setFiltersOpen(false)} type="button">
            Apply filters
          </button>
        </div>
      </BottomSheet>

      <EventDetailDrawer
        open={Boolean(drawerEvent)}
        event={drawerEvent}
        onClose={() => setDrawerEvent(null)}
        onReplay={async (eventId) => {
          const currentStatus = events.find((item) => item.id === eventId)?.status ?? 'FAILED'
          await replayOrRescue(eventId, currentStatus)
        }}
        plan={me.plan}
      />
    </section>
  )
}

function StatusDot({ status }: { status: EventResponse['status'] }) {
  const color = status === 'FAILED' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : status === 'DELIVERED' ? 'bg-green-500' : 'bg-amber-400'
  return <span className={`h-2 w-2 rounded-full ${color}`} />
}

function MetadataGrid({ event, maxRetries }: { event: Partial<EventDetailResponse> & EventResponse; maxRetries: number }) {
  const payloadSizeKb = ((event.payloadSize ?? 0) / 1024).toFixed(1)
  const ingestion = event.ingestionLatencyMs

  return (
    <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-4">
      <MetaCell label="STRIPE ID" value={event.stripeId} mono copyable />
      <MetaCell label="PERSPECTIFY ID" value={event.id} mono copyable />
      <div>
        <p className="mb-1 text-xs uppercase tracking-widest text-zinc-600">INGESTION LATENCY</p>
        <p className={`text-sm ${ingestion === null || ingestion < 0 ? 'text-zinc-600' : ingestion < 500 ? 'text-green-400' : ingestion <= 2000 ? 'text-amber-400' : 'text-red-400'} font-mono`}>
          {ingestion === null ? 'N/A' : ingestion < 0 ? 'N/A (clock skew)' : `${ingestion}ms`}
        </p>
        <p className="text-xs text-zinc-600">Stripe → Perspectify</p>
      </div>
      <MetaCell label="PAYLOAD SIZE" value={`${payloadSizeKb} KB`} mono />
      <MetaCell label="TOTAL ATTEMPTS" value={`${event.attempts} of ${maxRetries}`} mono />
      <MetaCell label="SIGNATURE" value={event.signatureValid ? 'Valid ✓' : 'Invalid ✗'} valueClass={event.signatureValid ? 'text-green-400' : 'text-red-400'} />
    </div>
  )
}

function Timeline({ attempts }: { attempts: EventAttemptResponse[] }) {
  return (
    <div>
      <p className="mb-3 text-xs uppercase tracking-widest text-zinc-600">DELIVERY TIMELINE</p>
      <div className="relative">
        <div className="absolute bottom-4 left-[7px] top-4 w-px bg-zinc-800" />
        {attempts.map((attempt) => {
          const isSuccess = attempt.status !== null && attempt.status >= 200 && attempt.status < 300
          const isInFlight = attempt.status === null

          return (
            <div key={attempt.id} className="relative flex gap-4 pb-5 last:pb-0">
              <div className={`relative z-10 mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${isSuccess ? 'border-green-500 bg-green-500' : isInFlight ? 'animate-pulse border-amber-400 bg-amber-400' : 'border-red-500 bg-red-500'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-zinc-200">Attempt #{attempt.attempt}</span>
                  <span className={`rounded px-2 py-0.5 font-mono text-xs ${isSuccess ? 'bg-green-500/10 text-green-400' : isInFlight ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                    {attempt.status ? `${attempt.status}` : isInFlight ? 'In Flight...' : 'Error'}
                  </span>
                  {attempt.durationMs !== null && attempt.durationMs !== undefined ? (
                    <span className="font-mono text-xs text-zinc-500">{attempt.durationMs}ms</span>
                  ) : null}
                  {attempt.failureCategory ? (
                    <span className="rounded border border-red-500/15 bg-red-500/10 px-2 py-0.5 font-mono text-xs text-red-400">
                      {attempt.failureCategory.replace('_', ' ')}
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-xs tabular-nums text-zinc-600">{attempt.attemptStartedAt ? new Date(attempt.attemptStartedAt).toLocaleString() : 'N/A'}</span>
                </div>

                {attempt.error ? (
                  <div className="mt-2 rounded-lg border border-red-500/15 bg-red-500/10 px-3 py-2">
                    <p className="break-all font-mono text-xs text-red-400">{attempt.error}</p>
                    {attempt.status && attempt.status >= 400 ? (
                      <a
                        href={`https://developer.mozilla.org/docs/Web/HTTP/Status/${attempt.status}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-400"
                      >
                        What is {attempt.status}?
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {attempt.failureCategory ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{FAILURE_EXPLANATIONS[attempt.failureCategory]}</p>
                ) : null}

                <CollapsibleSection label="Request headers" defaultOpen={false}>
                  <HeadersTable headers={attempt.requestHeaders} />
                </CollapsibleSection>

                {attempt.responseHeaders ? (
                  <CollapsibleSection label="Response headers" defaultOpen={false}>
                    <HeadersTable headers={attempt.responseHeaders} />
                  </CollapsibleSection>
                ) : null}

                {attempt.responseBody ? (
                  <CollapsibleSection label="Response body" defaultOpen={!isSuccess}>
                    <ResponseBody body={attempt.responseBody} />
                  </CollapsibleSection>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MetaCell({
  label,
  value,
  mono,
  copyable,
  valueClass,
}: {
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
  valueClass?: string
}) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-widest text-zinc-600">{label}</p>
      <div className="flex items-center gap-2">
        <p className={`text-sm text-zinc-200 ${mono ? 'font-mono text-xs' : ''} ${valueClass ?? ''}`}>{value}</p>
        {copyable ? (
          <button
            className="text-zinc-600 hover:text-zinc-300"
            onClick={() => {
              void navigator.clipboard.writeText(value)
            }}
            type="button"
          >
            <Copy size={12} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function FailureHint({ category }: { category: string }) {
  return (
    <div className="mx-4 mb-4 mt-2 flex items-start gap-3 rounded-xl border border-red-500/15 bg-red-500/10 p-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
      <p className="text-xs text-zinc-400">{FAILURE_EXPLANATIONS[category] ?? FAILURE_EXPLANATIONS.unknown}</p>
      <Link href="https://developer.mozilla.org/docs/Web/HTTP/Status" target="_blank" className="ml-auto text-zinc-600 hover:text-zinc-400">
        <ExternalLink size={12} />
      </Link>
    </div>
  )
}

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime()
  const mins = Math.max(1, Math.floor(delta / 60000))
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
