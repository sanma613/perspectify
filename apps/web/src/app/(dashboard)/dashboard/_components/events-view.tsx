'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlarmClock, ArrowRight, BadgeAlert, RefreshCcw, ShieldAlert } from 'lucide-react'
import { derivePlanCapabilities, getReplayUiState } from '../../../../lib/capabilities'
import { getAccessToken } from '../../../../lib/access-token'
import { apiFetch } from '../../../../lib/http'
import { usePaginatedEvents } from '../../../../lib/use-paginated-events'
import { useDashboardData } from '../../../../lib/use-dashboard-data'
import type { EventResponse } from '../../../../lib/api-types'
import { ActionModal } from './action-modal'
import { EventDetailDrawer } from './event-detail-drawer'
import { FlashMessage } from './flash-message'
import { OnboardingFlow } from './onboarding-flow'
import { CopyToClipboard } from './copyToClipboard'

type ModalState =
  | {
      type: 'blocked' | 'bulk-paywall' | 'confirm-delivered'
      title: string
      message: string
      eventId?: string
    }
  | null

export function EventsView() {
  const { me, endpoints, loading, error } = useDashboardData()
  const [displayEvents, setDisplayEvents] = useState<EventResponse[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailEventId, setDetailEventId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [hoverHintEventId, setHoverHintEventId] = useState<string | null>(null)
  const [isBulkWorking, setIsBulkWorking] = useState(false)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [selectedEndpointIds, setSelectedEndpointIds] = useState<string[]>([])
  const [showEndpointFilter, setShowEndpointFilter] = useState(false)
  const [isFilterTransitioning, setIsFilterTransitioning] = useState(false)
  const endpointFilterRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef<HTMLLIElement | null>(null)
  const hoverHintTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverHintDelayMs = 300

  const {
    events,
    loading: eventsLoading,
    loadingMore,
    hasMore,
    totalCount,
    error: eventsError,
    pendingNewCount,
    loadMore,
    revealNewEvents,
    patchEvent,
  } = usePaginatedEvents({
    allEndpointIds: endpoints.map((endpoint) => endpoint.id),
    selectedEndpointIds,
    needsRescue: attentionOnly,
  })

  useEffect(() => {
    setDisplayEvents(events)
    setIsFilterTransitioning(false)
  }, [events])

  const filterSignature = useMemo(() => {
    const sortedIds = [...selectedEndpointIds].sort().join(',')
    return `${attentionOnly ? 'rescue' : 'all'}:${sortedIds}`
  }, [attentionOnly, selectedEndpointIds])

  useEffect(() => {
    setIsFilterTransitioning(true)
  }, [filterSignature])

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore()
        }
      },
      { rootMargin: '240px 0px 240px 0px' }
    )

    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [displayEvents.length, hasMore, loadMore, loading, loadingMore])

  useEffect(() => {
    if (!hasMore) return

    const checkLoadMore = () => {
      if (loading || loadingMore) return
      const sentinel = loadMoreRef.current
      if (!sentinel) return
      const rect = sentinel.getBoundingClientRect()
      if (rect.top <= window.innerHeight + 260) {
        void loadMore()
      }
    }

    window.addEventListener('scroll', checkLoadMore, { passive: true })
    window.addEventListener('resize', checkLoadMore)
    return () => {
      window.removeEventListener('scroll', checkLoadMore)
      window.removeEventListener('resize', checkLoadMore)
    }
  }, [displayEvents.length, hasMore, loadMore, loading, loadingMore])

  useEffect(() => {
    if (!showEndpointFilter) return

    function handleClick(event: MouseEvent) {
      if (!endpointFilterRef.current) return
      if (!endpointFilterRef.current.contains(event.target as Node)) {
        setShowEndpointFilter(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showEndpointFilter])

  if (loading || (eventsLoading && displayEvents.length === 0)) return <EventsLoadingSkeleton />
  if (error || eventsError || !me) return <p className="text-red-500">{error ?? eventsError ?? 'Could not load events.'}</p>

  const hasActiveFilters = attentionOnly || selectedEndpointIds.length > 0
  const showOnboarding =
    !loading && !eventsLoading && !hasActiveFilters && displayEvents.length === 0 && totalCount === 0
  const showNoMatchesState = !loading && !eventsLoading && hasActiveFilters && displayEvents.length === 0

  const capabilities = derivePlanCapabilities({
    plan: me.plan,
    limits: me.limits,
    endpointCount: endpoints.length,
  })

  const endpointMap = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint.destination]))
  const endpointNameMap = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint.name]))
  const endpointOptions = [...endpoints].sort((a, b) => a.name.localeCompare(b.name))
  const selectedEndpointLabel =
    selectedEndpointIds.length === 0
      ? 'All'
      : selectedEndpointIds.length === 1
        ? endpointNameMap.get(selectedEndpointIds[0]) ?? '1 endpoint'
        : `${selectedEndpointIds.length} endpoints selected`
  const freeRescuesLeft =
    me.plan === 'free' ? capabilities.maxReplays : null

  const filteredEvents = displayEvents.filter((event) => {
    if (attentionOnly && !requiresAttention(event)) return false
    if (selectedEndpointIds.length > 0 && !selectedEndpointIds.includes(event.endpointId)) return false
    return true
  })

  async function replayAllFailed() {
    if (me.plan === 'free') {
      setModal({
        type: 'bulk-paywall',
        title: 'Rescue All is a paid feature',
        message: 'Tired of replaying one by one? Rescue All is available on Starter. Upgrade to fix all failures with one click.',
      })
      return
    }

    setActionError(null)
    setActionSuccess(null)
    setIsBulkWorking(true)

    try {
      const token = await getAccessToken()
      const result = await apiFetch<{ replayed: number }>('/events/replay-all', token, {
        method: 'POST',
      })
      setActionSuccess(
        result.replayed > 0
          ? `${result.replayed} failed event${result.replayed === 1 ? '' : 's'} sent to rescue queue.`
          : 'No failed events available for Rescue All.'
      )
      for (const failedEvent of filteredEvents.filter((event) => resolveVisualState(event) === 'FAILED')) {
        patchEvent(failedEvent.id, {
          status: 'PENDING',
          lastAttemptStatus: null,
          lastError: null,
        })
      }
    } catch (bulkError) {
      setActionError(bulkError instanceof Error ? bulkError.message : 'Could not run Rescue All.')
    } finally {
      setIsBulkWorking(false)
    }
  }

  async function replay(eventId: string) {
    setActionError(null)
    setActionSuccess(null)
    setPendingId(eventId)
    try {
      const token = await getAccessToken()
      await apiFetch<{ replayed: true }>(`/events/${eventId}/replay`, token, {
        method: 'POST',
      })
      setActionSuccess('Event queued successfully.')
      patchEvent(eventId, {
        status: 'PENDING',
        lastAttemptStatus: null,
        lastError: null,
      })
    } catch (replayError) {
      setActionError(
        replayError instanceof Error ? replayError.message : 'Could not replay event.'
      )
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section className="space-y-5 border-t border-white/10 pt-4">
      <header className="space-y-1">
        <h2 className="inline-flex items-center gap-2 font-display text-2xl text-zinc-100 sm:text-3xl">
          <AlarmClock className="h-6 w-6 text-emerald-300" />
          Events and replay
        </h2>
        <p className="text-sm text-zinc-400">
          Replay is a reliability tool for rescuing failed deliveries.
        </p>
        <p className="text-xs text-zinc-500">
          Automatic retries always active. Perspectify retries before asking you to intervene.
        </p>
        {freeRescuesLeft !== null ? (
          <p className="text-xs font-medium text-amber-300">Up to {freeRescuesLeft} replays per event on Free.</p>
        ) : null}
      </header>

      <FlashMessage message={actionError} onDone={() => setActionError(null)} tone="error" />
      <FlashMessage message={actionSuccess} onDone={() => setActionSuccess(null)} tone="success" />

      <div className="group flex justify-end">
        <button
          className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${me.plan === 'free' ? 'cursor-not-allowed border border-white/15 bg-black/35 text-zinc-500 opacity-60' : 'bg-red-500 text-red-50 hover:bg-red-400'}`}
          onClick={replayAllFailed}
          type="button"
        >
          {isBulkWorking ? 'Rescuing...' : 'Rescue All'}
        </button>
      </div>
      {me.plan === 'free' ? (
        <p
          className="-mt-2 text-right text-xs text-zinc-400 transition-colors duration-200 group-hover:text-zinc-200"
        >
          Rescue All is available on Starter.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
        <button
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${attentionOnly ? 'border-red-400/60 bg-red-500/20 text-red-200' : 'border-white/15 bg-black/40 text-zinc-300 hover:bg-black/55'}`}
          onClick={() => setAttentionOnly((value) => !value)}
          type="button"
        >
          Events failure
        </button>

        <div className="relative" ref={endpointFilterRef}>
          <button
            className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs text-zinc-300 transition hover:bg-black/55"
            onClick={() => setShowEndpointFilter((value) => !value)}
            type="button"
          >
            Endpoints selected: {selectedEndpointLabel}
          </button>
          {showEndpointFilter ? (
            <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-white/10 bg-black/90 p-3 text-xs text-zinc-200 shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                All endpoints
              </p>
              <div className="max-h-48 space-y-1 overflow-auto pr-1">
                {endpointOptions.map((endpoint) => (
                  <label className="flex cursor-pointer items-center gap-2" key={endpoint.id}>
                    <input
                      checked={selectedEndpointIds.includes(endpoint.id)}
                      className="h-3.5 w-3.5 rounded border border-white/20 bg-black/40"
                      onChange={(event) => {
                        setSelectedEndpointIds((current) =>
                          event.target.checked
                            ? [...current, endpoint.id]
                            : current.filter((id) => id !== endpoint.id)
                        )
                      }}
                      type="checkbox"
                    />
                    <span className="truncate text-zinc-200">{endpoint.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {pendingNewCount > 0 ? (
        <div className="sticky top-2 z-10">
          <button
            className="rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-100 transition hover:bg-emerald-400/25"
            onClick={revealNewEvents}
            type="button"
          >
            New events: {pendingNewCount} - Show
          </button>
        </div>
      ) : null}

      {displayEvents.length === 0 ? (
        showOnboarding ? <OnboardingFlow /> : showNoMatchesState ? <NoMatchesState /> : <EventsLoadingSkeleton />
      ) : (
      <ul
        className={`space-y-2 -mt-4 transition-opacity duration-200 ${isFilterTransitioning ? 'opacity-70' : 'opacity-100'}`}
      >
        {filteredEvents.length === 0 ? (
          <li className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-zinc-400">
            No events match the current filters.
          </li>
        ) : null}
        {filteredEvents.map((event) => {
          const replayUi = getReplayUiState({
            plan: me.plan,
            limits: me.limits,
            replayCount: event.replayCount,
            status: event.status,
            lastAttemptStatus: event.lastAttemptStatus,
          })

          const isBlocked = !replayUi.allowed
          const isPending = pendingId === event.id
          const visualState = resolveVisualState(event)
          const destination = event.destinationUrl ?? endpointMap.get(event.endpointId) ?? 'Unknown destination'
          const endpointName = event.endpointName ?? endpointNameMap.get(event.endpointId) ?? 'Unknown endpoint'
          const latestAttempt = event.eventAttempts[0]
          const attemptsChrono = [...event.eventAttempts].sort((a, b) => a.attempt - b.attempt)
          const latestStatus = latestAttempt?.status
          const latestTone =
            latestStatus === null || latestStatus === undefined
              ? 'neutral'
              : latestStatus >= 400
                ? 'error'
                : 'success'
          const latestCardClass =
            latestTone === 'error'
              ? 'border-red-400/30 bg-red-500/10 text-red-200'
              : latestTone === 'success'
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                : 'border-white/10 bg-black/40 text-zinc-300'
          const latestTextClass =
            latestTone === 'error'
              ? 'text-red-100'
              : latestTone === 'success'
                ? 'text-emerald-100'
                : 'text-zinc-200'

          const flowLastLegClass =
            visualState === 'FAILED' ? 'text-red-300' : 'text-emerald-300'

          function handleReplayClick() {
            if (isBlocked) {
              const blockedMessage =
                replayUi.code === 'credits_exhausted'
                  ? `You have used all ${me.limits.maxReplays} replays for this event.`
                  : replayUi.reason ?? 'This action is currently unavailable.'

              setModal({
                type: 'blocked',
                title: 'Action blocked',
                message: blockedMessage,
                eventId: event.id,
              })
              return
            }

            if (visualState === 'DELIVERED') {
              const duplicateWarning =
                me.plan === 'free'
                  ? `This event was already delivered successfully. Replaying it can create duplicate data in your destination. It will consume 1 of your ${me.limits.maxReplays} event replays. Continue?`
                  : 'This event was already delivered successfully. Replaying it can create duplicate data in your destination. Continue?'

              setModal({
                type: 'confirm-delivered',
                title: 'Confirm Replay Event',
                message: duplicateWarning,
                eventId: event.id,
              })
              return
            }

            void replay(event.id)
          }

          const payloadText = JSON.stringify(event.payload ?? {}, null, 2)

          return (
            <li
              className="rounded-2xl border border-white/10 bg-black/25 p-4 cursor-pointer"
              key={event.id}
              onClick={() => setExpandedId((value) => (value === event.id ? null : event.id))}
              role="button"
              tabIndex={0}
              onKeyDown={(eventKey) => {
                if (eventKey.key === 'Enter' || eventKey.key === ' ') {
                  eventKey.preventDefault()
                  setExpandedId((value) => (value === event.id ? null : event.id))
                }
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <p className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
                    <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                      {endpointName}
                    </span>
                    <span className="text-zinc-500">—</span>
                    <span>{event.type}</span>
                  </p>
                  <p className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                    <BadgeAlert className="h-3.5 w-3.5 text-zinc-500" />
                    Status: <span className="text-zinc-100">{readableStatus(visualState)}</span> · Attempts: {event.attempts}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span className="rounded-md bg-black/45 px-2 py-1">Stripe</span>
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="rounded-md bg-black/45 px-2 py-1">Perspectify</span>
                    <ArrowRight className={`h-3.5 w-3.5 ${flowLastLegClass}`} />
                    <span className={`max-w-[280px] truncate rounded-md bg-black/45 px-2 py-1 ${flowLastLegClass}`}>{endpointName}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <button
                    aria-disabled={isBlocked || isPending}
                    className={`w-full rounded-xl px-3.5 py-2 text-center text-sm font-semibold transition ${isBlocked ? 'cursor-not-allowed border border-white/15 bg-black/30 text-zinc-500 opacity-60 hover:bg-black/40' : replayUi.actionLabel === 'Rescue Event' ? 'bg-red-500 text-red-50 hover:bg-red-400' : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'} ${isPending ? 'opacity-70' : ''}`}
                    onClick={(eventClick) => {
                      eventClick.stopPropagation()
                      handleReplayClick()
                    }}
                    onMouseEnter={() => {
                      if (!isBlocked) return
                      if (hoverHintTimeout.current) clearTimeout(hoverHintTimeout.current)
                      hoverHintTimeout.current = setTimeout(() => {
                        setHoverHintEventId(event.id)
                      }, hoverHintDelayMs)
                    }}
                    onMouseLeave={() => {
                      if (hoverHintTimeout.current) clearTimeout(hoverHintTimeout.current)
                      hoverHintTimeout.current = null
                      setHoverHintEventId((value) => (value === event.id ? null : value))
                    }}
                    type="button"
                  >
                    <span className="inline-flex w-full items-center justify-center gap-1.5">
                      <RefreshCcw className="h-3.5 w-3.5" />
                      {isPending
                        ? replayUi.actionLabel === 'Rescue Event'
                          ? 'Rescuing...'
                          : 'Replaying...'
                        : replayUi.actionLabel}
                    </span>
                  </button>
                  {replayUi.reason ? (
                    <span
                      aria-hidden={!(isBlocked && hoverHintEventId === event.id)}
                      className={`max-w-[260px] text-right text-xs text-zinc-500 transition-opacity duration-200 ${isBlocked && hoverHintEventId === event.id ? 'opacity-100' : 'opacity-0'}`}
                    >
                      {replayUi.reason}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Retry timeline</p>
                  <button
                    className="text-xs text-zinc-400 underline hover:text-zinc-200"
                    onClick={(eventClick) => {
                      eventClick.stopPropagation()
                      setDetailEventId(event.id)
                    }}
                    type="button"
                  >
                    View details
                  </button>
                </div>

                {attemptsChrono.length === 0 ? (
                  <p className="text-xs text-zinc-500">No delivery attempts recorded yet.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs text-zinc-400">
                    {attemptsChrono.map((attempt) => {
                      const tone =
                        attempt.status === null || attempt.status === undefined
                          ? 'neutral'
                          : attempt.status >= 400
                            ? 'error'
                            : 'success'
                      const statusClass =
                        tone === 'error'
                          ? 'text-red-300'
                          : tone === 'success'
                            ? 'text-emerald-300'
                            : 'text-zinc-400'
                      const detailClass =
                        tone === 'error'
                          ? 'text-red-300'
                          : tone === 'success'
                            ? 'text-emerald-200'
                            : 'text-zinc-400'

                      return (
                        <li className="flex flex-wrap items-center gap-2" key={attempt.id}>
                          <span className="rounded bg-black/45 px-1.5 py-0.5">Attempt {attempt.attempt}</span>
                          <span>{new Date(attempt.createdAt).toLocaleTimeString()}</span>
                          <span className={statusClass}>
                            {attempt.status ? `HTTP ${attempt.status}` : 'No status'}
                          </span>
                          {attempt.responseBody ? (
                            <span className={`truncate ${detailClass}`}>{attempt.responseBody}</span>
                          ) : attempt.error ? (
                            <span className={`truncate ${detailClass}`}>{attempt.error}</span>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {expandedId === event.id ? (
                <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-black/30 p-3">
                  {latestAttempt ? (
                    <div className={`rounded-lg border p-2 text-xs ${latestCardClass}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-1">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Destination response
                        </p>
                        {latestAttempt.responseBody || latestAttempt.error ? (
                          <CopyToClipboard
                            text={latestAttempt.responseBody ?? latestAttempt.error ?? ''}
                            label="Copy response"
                            className="inline-flex items-center gap-1 text-xs text-zinc-300 underline hover:text-zinc-100"
                            iconClassName="h-3 w-3"
                          />
                        ) : null}
                      </div>
                      <p className={`mt-1 ${latestTextClass}`}>Status: {latestAttempt.status ?? 'No status'}</p>
                      {latestAttempt.responseBody ? (
                        <pre className={`mt-2 max-h-40 overflow-auto rounded-md border border-white/10 bg-black/40 p-2 text-xs ${latestTextClass}`}>
                          {latestAttempt.responseBody}
                        </pre>
                      ) : latestAttempt.error ? (
                        <p className={`mt-1 break-all ${latestTextClass}`}>{latestAttempt.error}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-white/10 bg-black/25 p-2 text-xs text-zinc-300">
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Request journey</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <span className="rounded-md bg-black/45 px-2 py-1">{event.providerName ?? 'Stripe'}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="rounded-md bg-black/45 px-2 py-1">Perspectify</span>
                      <ArrowRight className={`h-3.5 w-3.5 ${flowLastLegClass}`} />
                      <span className={`max-w-[280px] truncate rounded-md bg-black/45 px-2 py-1 ${flowLastLegClass}`}>{destination}</span>
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-wider text-zinc-400">Received at</p>
                    <p className="mt-1 text-xs text-zinc-400">{new Date(event.receivedAt).toLocaleString()}</p>
                    <p className="mt-2 text-xs uppercase tracking-wider text-zinc-400">Source headers</p>
                    {event.sourceHeaders ? (
                      <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-white/10 bg-black/45 p-2 text-xs text-zinc-200">
                        {JSON.stringify(event.sourceHeaders, null, 2)}
                      </pre>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-500">No headers captured.</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/25 p-2 text-xs text-zinc-300">
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Metadata</p>
                    <p className="mt-1 text-xs text-zinc-400">Perspectify ID: <span className="text-zinc-100">{event.id}</span></p>
                    <p className="mt-1 text-xs text-zinc-400">Payload size: <span className="text-zinc-100">{formatBytes(event.payloadSize)}</span></p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Payload</p>
                      <CopyToClipboard
                        text={payloadText}
                        label="Copy JSON"
                        className="inline-flex items-center gap-1 text-xs text-zinc-300 underline hover:text-zinc-100"
                        iconClassName="h-3.5 w-3.5"
                      />
                    </div>
                    <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-white/10 bg-black/50 p-3 text-xs text-zinc-200">
                      <JsonViewer value={event.payload ?? {}} />
                    </div>
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
        {hasMore ? (
          <>
            {loadingMore ? (
              <>
                <li className="rounded-2xl border border-white/10 bg-black/25 p-4 animate-pulse">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-2">
                        <div className="h-3 w-40 rounded-full bg-white/15" />
                        <div className="h-3 w-56 rounded-full bg-white/10" />
                      </div>
                      <div className="h-10 w-40 rounded-xl border border-white/10 bg-white/10" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-14 rounded-full bg-white/10" />
                      <div className="h-3 w-6 rounded-full bg-white/10" />
                      <div className="h-6 w-24 rounded-full bg-white/10" />
                    </div>
                    <div className="h-14 rounded-xl border border-white/10 bg-white/5" />
                  </div>
                </li>
                <li className="rounded-2xl border border-white/10 bg-black/25 p-4 animate-pulse">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-2">
                        <div className="h-3 w-36 rounded-full bg-white/15" />
                        <div className="h-3 w-52 rounded-full bg-white/10" />
                      </div>
                      <div className="h-10 w-40 rounded-xl border border-white/10 bg-white/10" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-16 rounded-full bg-white/10" />
                      <div className="h-3 w-8 rounded-full bg-white/10" />
                      <div className="h-6 w-20 rounded-full bg-white/10" />
                    </div>
                    <div className="h-14 rounded-xl border border-white/10 bg-white/5" />
                  </div>
                </li>
                <li className="rounded-2xl border border-white/10 bg-black/25 p-4 animate-pulse">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-2">
                        <div className="h-3 w-44 rounded-full bg-white/15" />
                        <div className="h-3 w-48 rounded-full bg-white/10" />
                      </div>
                      <div className="h-10 w-40 rounded-xl border border-white/10 bg-white/10" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-12 rounded-full bg-white/10" />
                      <div className="h-3 w-10 rounded-full bg-white/10" />
                      <div className="h-6 w-24 rounded-full bg-white/10" />
                    </div>
                    <div className="h-14 rounded-xl border border-white/10 bg-white/5" />
                  </div>
                </li>
              </>
            ) : null}
            <li className="py-2 text-center text-xs text-zinc-500" ref={loadMoreRef}>
              {loadingMore ? '' : 'Scroll to load more'}
            </li>
          </>
        ) : null}
      </ul>
      )}

      <ActionModal
        cancelLabel={modal?.type === 'blocked' || modal?.type === 'bulk-paywall' ? 'Upgrade Plan' : undefined}
        confirmLabel="Continue"
        onClose={() => setModal(null)}
        onConfirm={
          modal?.type === 'confirm-delivered' && modal.eventId
            ? () => {
                const eventId = modal.eventId
                setModal(null)
                void replay(eventId)
              }
            : undefined
        }
        open={Boolean(modal)}
        title={modal?.title ?? ''}
        message={modal?.message ?? ''}
      />

      <EventDetailDrawer
        open={Boolean(detailEventId)}
        event={detailEventId ? displayEvents.find((item) => item.id === detailEventId) ?? null : null}
        onClose={() => setDetailEventId(null)}
        onReplay={(eventId) => replay(eventId)}
        plan={me.plan}
        endpointNameFallback={
          detailEventId
            ? endpointNameMap.get(displayEvents.find((item) => item.id === detailEventId)?.endpointId ?? '') ?? null
            : null
        }
        destinationFallback={
          detailEventId
            ? endpointMap.get(displayEvents.find((item) => item.id === detailEventId)?.endpointId ?? '') ?? null
            : null
        }
      />
    </section>
  )
}

function NoMatchesState() {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-zinc-400">
      No events match the current filters.
    </div>
  )
}

function EventsLoadingSkeleton() {
  return (
    <section className="space-y-3 -mt-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 animate-pulse" key={`events-skeleton-${index}`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-2">
                <div className="h-3 w-44 rounded-full bg-white/15" />
                <div className="h-3 w-56 rounded-full bg-white/10" />
              </div>
              <div className="h-10 w-40 rounded-xl border border-white/10 bg-white/10" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-16 rounded-full bg-white/10" />
              <div className="h-3 w-8 rounded-full bg-white/10" />
              <div className="h-6 w-24 rounded-full bg-white/10" />
            </div>
            <div className="h-14 rounded-xl border border-white/10 bg-white/5" />
          </div>
        </div>
      ))}
    </section>
  )
}

function JsonViewer({ value }: { value: unknown }) {
  return (
    <div className="font-mono">
      <JsonNode value={value} label="root" depth={0} />
    </div>
  )
}

function JsonNode({
  value,
  label,
  depth,
}: {
  value: unknown
  label?: string
  depth: number
}) {
  if (value === null || typeof value !== 'object') {
    return (
      <div className="whitespace-pre-wrap">
        {label ? <span className="text-emerald-300">{label}: </span> : null}
        <span className="text-cyan-200">{formatJsonScalar(value)}</span>
      </div>
    )
  }

  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value)
  const summaryLabel = Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`
  const isOpen = depth < 1

  return (
    <details className="ml-2" open={isOpen}>
      <summary className="cursor-pointer select-none text-zinc-300">
        {label ? <span className="text-emerald-300">{label}: </span> : null}
        <span className="text-zinc-400">{summaryLabel}</span>
      </summary>
      <div className="mt-1 space-y-1">
        {entries.length === 0 ? (
          <div className="ml-4 text-zinc-500">Empty</div>
        ) : (
          entries.map(([childLabel, childValue]) => (
            <div className="ml-4" key={`${label ?? 'root'}-${childLabel}`}>
              <JsonNode value={childValue} label={childLabel} depth={depth + 1} />
            </div>
          ))
        )}
      </div>
    </details>
  )
}

function formatJsonScalar(value: unknown) {
  if (value === null) return 'null'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return String(value)
}

type VisualState = 'IN_PROGRESS' | 'FAILED' | 'DELIVERED'

function resolveVisualState(event: { status: string; lastAttemptStatus: number | null }) {
  if (event.status === 'DELIVERING') return 'IN_PROGRESS'
  if (event.status === 'PENDING') return 'IN_PROGRESS'
  if (event.lastAttemptStatus === 200) return 'DELIVERED'
  if (event.lastAttemptStatus !== null && event.lastAttemptStatus >= 400) return 'FAILED'
  return 'IN_PROGRESS'
}

function readableStatus(state: VisualState) {
  if (state === 'FAILED') return 'Failed'
  if (state === 'IN_PROGRESS') return 'In progress'
  return 'Delivered'
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '0 KB'
  const kb = bytes / 1024
  return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`
}

function requiresAttention(event: { lastAttemptStatus: number | null; status?: string }) {
  if (event.status === 'FAILED') return true
  return event.lastAttemptStatus !== null && event.lastAttemptStatus >= 400
}
