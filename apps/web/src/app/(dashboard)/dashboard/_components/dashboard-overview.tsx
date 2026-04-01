'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowRight, CircleCheckBig, OctagonAlert, RefreshCcw } from 'lucide-react'
import { getAccessToken } from '../../../../lib/access-token'
import { derivePlanCapabilities, getReplayUiState } from '../../../../lib/capabilities'
import { apiFetch } from '../../../../lib/http'
import { usePaginatedEvents } from '../../../../lib/use-paginated-events'
import { useDashboardData } from '../../../../lib/use-dashboard-data'
import type { EventResponse } from '../../../../lib/api-types'
import { ActionModal } from './action-modal'
import { FlashMessage } from './flash-message'
import { OnboardingFlow } from './onboarding-flow'
import { CopyToClipboard } from './copyToClipboard'

type OverviewModal =
  | {
      type: 'blocked' | 'confirm-delivered' | 'bulk-paywall'
      eventId: string
      title: string
      message: string
    }
  | null

export function DashboardOverview() {
  const { me, endpoints, loading, error } = useDashboardData()
  const [displayEvents, setDisplayEvents] = useState<EventResponse[]>([])
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [isRescueAllWorking, setIsRescueAllWorking] = useState(false)
  const [modal, setModal] = useState<OverviewModal>(null)
  const [hoverHintEventId, setHoverHintEventId] = useState<string | null>(null)
  const [inspectorEventId, setInspectorEventId] = useState<string | null>(null)
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
    if (!eventsLoading) {
      setIsFilterTransitioning(false)
    }
  }, [eventsLoading])

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

  const filteredEvents = displayEvents.filter((event) => {
    if (attentionOnly && !requiresAttention(event)) return false
    if (selectedEndpointIds.length > 0 && !selectedEndpointIds.includes(event.endpointId)) return false
    return true
  })

  const filteredFailedEvents = filteredEvents.filter((event) => resolveVisualState(event) === 'FAILED').length
  const filteredDeliveredEvents = filteredEvents.filter((event) => resolveVisualState(event) === 'DELIVERED').length
  const stableStatsRef = useRef({ captured: 0, failed: 0, delivered: 0 })
  const shouldFreezeStats = isFilterTransitioning || (eventsLoading && displayEvents.length === 0)
  const showStatsSkeleton = loading || shouldFreezeStats
  const visibleStats = shouldFreezeStats
    ? stableStatsRef.current
    : {
        captured: filteredEvents.length,
        failed: filteredFailedEvents,
        delivered: filteredDeliveredEvents,
      }

  useEffect(() => {
    if (shouldFreezeStats) return
    stableStatsRef.current = {
      captured: filteredEvents.length,
      failed: filteredFailedEvents,
      delivered: filteredDeliveredEvents,
    }
  }, [filteredDeliveredEvents, filteredEvents.length, filteredFailedEvents, shouldFreezeStats])

  if (loading && !me) {
    return <CenteredSpinner />
  }

  if (error || eventsError || !me) {
    return <p className="text-red-500">{error ?? eventsError ?? 'Could not load dashboard.'}</p>
  }

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
  const freeRescuesLeft = me.plan === 'free' ? capabilities.maxReplays : null

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
      setActionError(replayError instanceof Error ? replayError.message : 'Could not replay event.')
    } finally {
      setPendingId(null)
    }
  }

  async function rescueAllFailed() {
    if (me.plan === 'free') {
      setModal({
        type: 'bulk-paywall',
        eventId: 'bulk',
        title: 'Rescue All is a paid feature',
        message: 'Rescue All is available on Starter. Upgrade to fix all failed events with one click.',
      })
      return
    }

    setActionError(null)
    setActionSuccess(null)
    setIsRescueAllWorking(true)

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
    } catch (rescueError) {
      setActionError(rescueError instanceof Error ? rescueError.message : 'Could not run Rescue All.')
    } finally {
      setIsRescueAllWorking(false)
    }
  }

  const hasActiveFilters = attentionOnly || selectedEndpointIds.length > 0
  const showOnboarding =
    !loading && !eventsLoading && !hasActiveFilters && displayEvents.length === 0 && totalCount === 0
  const showNoMatchesState = !loading && !eventsLoading && hasActiveFilters && displayEvents.length === 0

  if (endpoints.length === 0 && showOnboarding) {
    return <OnboardingFlow />
  }

  return (
    <section className="space-y-6 border-t border-white/10 pt-4 px-0">
      <header className="flex flex-wrap items-start justify-between gap-3 px-2">
        <h2 className="inline-flex items-center gap-2 font-display text-3xl text-zinc-100">
          <Activity className="h-7 w-7 text-emerald-300" />
          Events
        </h2>
        <div className="group relative flex w-40 flex-col items-end gap-2">
          <button
            className={`w-full rounded-lg px-3 py-1.5 text-center text-sm font-medium transition ${me.plan === 'free' ? 'cursor-not-allowed border border-white/15 bg-black/35 text-zinc-500 opacity-60 hover:bg-black/45' : 'bg-red-500 text-red-50 hover:bg-red-400'}`}
            onClick={rescueAllFailed}
            type="button"
          >
            <span className="inline-flex w-full items-center justify-center gap-1.5">
              <RefreshCcw className={`h-3.5 w-3.5 ${isRescueAllWorking ? 'animate-spin' : ''}`} />
              {isRescueAllWorking ? 'Rescuing...' : 'Rescue All'}
            </span>
          </button>
          {me.plan === 'free' ? (
            <p
              className="pointer-events-none absolute right-0 top-full mt-1 w-max whitespace-nowrap text-right text-xs leading-tight text-zinc-400 transition-colors duration-200 group-hover:text-zinc-200"
            >
              Rescue All is a paid feature. Upgrade to rescue all failures in one click.
            </p>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-2 text-sm text-zinc-400">
        <p className="inline-flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-zinc-500" />
          Captured{' '}
          {showStatsSkeleton ? (
            <span className="inline-block h-4 w-8 rounded bg-white/15 align-middle animate-[pulse_1.5s_ease-in-out_infinite]" />
          ) : (
            <span className="font-semibold text-zinc-100">{visibleStats.captured}</span>
          )}
        </p>
        <p className="inline-flex items-center gap-1.5">
          <CircleCheckBig className="h-4 w-4 text-emerald-300" />
          Delivered{' '}
          {showStatsSkeleton ? (
            <span className="inline-block h-4 w-8 rounded bg-white/15 align-middle animate-[pulse_1.5s_ease-in-out_infinite]" />
          ) : (
            <span className="font-semibold text-zinc-100">{visibleStats.delivered}</span>
          )}
        </p>
        <p className="inline-flex items-center gap-1.5">
          <OctagonAlert className="h-4 w-4 text-red-300" />
          Failed{' '}
          {showStatsSkeleton ? (
            <span className="inline-block h-4 w-8 rounded bg-white/15 align-middle animate-[pulse_1.5s_ease-in-out_infinite]" />
          ) : (
            <span className="font-semibold text-zinc-100">{visibleStats.failed}</span>
          )}
        </p>
      </div>
      {freeRescuesLeft !== null ? (
        <p className="px-2 text-xs font-medium text-amber-300">
          Up to {freeRescuesLeft} replays are allowed per event on Free.
        </p>
      ) : null}

      <div>
        <div className="min-h-[50px] max-h-[50px] flex flex-col justify-center -my-4">
          <FlashMessage message={actionError} onDone={() => setActionError(null)} tone="error" />
          <FlashMessage message={actionSuccess} onDone={() => setActionSuccess(null)} tone="success" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
        <button
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${attentionOnly ? 'border-red-400/60 bg-red-500/20 text-red-200' : 'border-white/15 bg-black/40 text-zinc-300 hover:bg-black/55'}`}
          onClick={() => setAttentionOnly((value) => !value)}
          type="button"
        >
          Failures Only
        </button>

        <div className="relative" ref={endpointFilterRef}>
          <button
            className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs text-zinc-300 transition hover:bg-black/55"
            onClick={() => setShowEndpointFilter((value) => !value)}
            type="button"
          >
            Endpoints Selected: {selectedEndpointLabel}
          </button>
          {showEndpointFilter ? (
            <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-white/10 bg-black/90 p-3 text-xs text-zinc-200 shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
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
        <div className="sticky top-2 z-10 px-2">
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

            const visualState = resolveVisualState(event)
            const isFailed = visualState === 'FAILED'
            const isDelivering = visualState === 'IN_PROGRESS'
            const isBlocked = !replayUi.allowed
            const dotClass = isFailed
              ? 'bg-red-500'
              : isDelivering
                ? 'bg-amber-500'
                : 'bg-emerald-500'

            const latestTimestamp = event.eventAttempts[0]?.createdAt ?? event.receivedAt
            const endpointName = event.endpointName ?? endpointNameMap.get(event.endpointId) ?? 'Unknown endpoint'
            const subtitle = [
              readableStatus(visualState),
              relativeTime(latestTimestamp),
              visualState === 'IN_PROGRESS' ? null : latestError(event),
            ]
              .filter(Boolean)
              .join(' · ')

            function handleActionClick() {
              if (isBlocked) {
                const message =
                  replayUi.code === 'credits_exhausted'
                    ? `You have used all ${me.limits.maxReplays} replays for this event.`
                    : replayUi.reason ?? 'This action is currently unavailable.'

                setModal({
                  type: 'blocked',
                  eventId: event.id,
                  title: 'Action blocked',
                  message,
                })
                return
              }

              if (visualState === 'DELIVERED') {
                const warning =
                  me.plan === 'free'
                    ? `This event was already delivered successfully. Replaying it can create duplicate data in your destination. It will consume 1 of your ${me.limits.maxReplays} event replays. Continue?`
                    : 'This event was already delivered successfully. Replaying it can create duplicate data in your destination. Continue?'

                setModal({
                  type: 'confirm-delivered',
                  eventId: event.id,
                  title: 'Confirm Replay Event',
                  message: warning,
                })
                return
              }

              void replay(event.id)
            }

            return (
              <li
                className="group flex cursor-pointer items-start justify-between gap-4 rounded-xl px-2 py-3 transition hover:bg-white/5"
                key={event.id}
                onClick={() => setInspectorEventId(event.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(eventKey) => {
                  if (eventKey.key === 'Enter' || eventKey.key === ' ') {
                    eventKey.preventDefault()
                    setInspectorEventId(event.id)
                  }
                }}
              >
                <div className="flex min-w-0 gap-3">
                  <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium text-zinc-100">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-zinc-200">
                          {endpointName}
                        </span>
                        <span className="text-zinc-500">—</span>
                        <span>{event.type}</span>
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-sm text-zinc-400">{subtitle}</p>
                    <button
                      className="mt-1 text-xs text-zinc-300 underline hover:text-white font-bold"
                      onClick={(eventClick) => {
                        eventClick.stopPropagation()
                        setInspectorEventId(event.id)
                      }}
                      type="button"
                    >
                      View details
                    </button>
                  </div>
                </div>

                <div className="relative flex w-40 shrink-0 flex-col items-end gap-1">
                  <button
                    aria-disabled={isBlocked || pendingId === event.id}
                    className={`w-full rounded-lg px-3 py-1.5 text-center text-sm font-medium transition ${isBlocked ? 'cursor-not-allowed border border-white/15 bg-black/30 text-zinc-500 opacity-60 hover:bg-black/40' : replayUi.actionLabel === 'Rescue Event' ? 'bg-red-500 text-red-50 hover:bg-red-400' : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'} ${pendingId === event.id ? 'opacity-70' : ''}`}
                    onClick={(eventClick) => {
                      eventClick.stopPropagation()
                      handleActionClick()
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
                      {pendingId === event.id
                        ? replayUi.actionLabel === 'Rescue Event'
                          ? 'Rescuing...'
                          : 'Replaying...'
                        : replayUi.actionLabel}
                    </span>
                  </button>
                  {replayUi.reason ? (
                    <span
                      aria-hidden={!(isBlocked && hoverHintEventId === event.id)}
                      className={`pointer-events-none absolute right-0 top-full mt-1 w-max whitespace-nowrap text-right text-xs leading-tight text-zinc-500 transition-opacity duration-200 ${isBlocked && hoverHintEventId === event.id ? 'opacity-100' : 'opacity-0'}`}
                    >
                      {replayUi.reason}
                    </span>
                  ) : null}
                </div>
              </li>
            )
          })}
          {hasMore ? (
            <>
              {loadingMore ? (
                <>
                  <li className="rounded-2xl border border-white/10 bg-black/25 p-4 animate-pulse">
                    <div className="flex items-start gap-3">
                      <span className="mt-2 h-2.5 w-2.5 rounded-full bg-white/20" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3.5 w-52 rounded-full bg-white/15" />
                        <div className="h-3 w-40 rounded-full bg-white/10" />
                        <div className="h-2.5 w-24 rounded-full bg-white/10" />
                      </div>
                      <div className="h-9 w-40 rounded-lg border border-white/10 bg-white/10" />
                    </div>
                  </li>
                  <li className="rounded-2xl border border-white/10 bg-black/25 p-4 animate-pulse">
                    <div className="flex items-start gap-3">
                      <span className="mt-2 h-2.5 w-2.5 rounded-full bg-white/20" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3.5 w-48 rounded-full bg-white/15" />
                        <div className="h-3 w-44 rounded-full bg-white/10" />
                        <div className="h-2.5 w-20 rounded-full bg-white/10" />
                      </div>
                      <div className="h-9 w-40 rounded-lg border border-white/10 bg-white/10" />
                    </div>
                  </li>
                  <li className="rounded-2xl border border-white/10 bg-black/25 p-4 animate-pulse">
                    <div className="flex items-start gap-3">
                      <span className="mt-2 h-2.5 w-2.5 rounded-full bg-white/20" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3.5 w-56 rounded-full bg-white/15" />
                        <div className="h-3 w-36 rounded-full bg-white/10" />
                        <div className="h-2.5 w-28 rounded-full bg-white/10" />
                      </div>
                      <div className="h-9 w-40 rounded-lg border border-white/10 bg-white/10" />
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

      <div className="pt-2">
        <Link className="text-sm text-zinc-400 underline hover:text-zinc-100" href="/dashboard/endpoints">
          Manage endpoints setup
        </Link>
      </div>

      <ActionModal
        cancelLabel={modal?.type === 'blocked' || modal?.type === 'bulk-paywall' ? 'Upgrade Plan' : undefined}
        confirmLabel="Continue"
        onClose={() => setModal(null)}
        onConfirm={
          modal?.type === 'confirm-delivered'
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

      {inspectorEventId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setInspectorEventId(null)}
          role="presentation"
        >
          <div
            className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl border border-white/10 bg-black/90 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            {(() => {
              const selected = displayEvents.find((item) => item.id === inspectorEventId)
              if (!selected) return null
              const destination = selected.destinationUrl ?? endpointMap.get(selected.endpointId) ?? 'Unknown destination'
              const latestAttempt = selected.eventAttempts[0]
              const attemptsChrono = [...selected.eventAttempts].sort((a, b) => a.attempt - b.attempt)
              const payloadText = JSON.stringify(selected.payload ?? {}, null, 2)
              const visualState = resolveVisualState(selected)
              const flowLastLegClass = visualState === 'FAILED' ? 'text-red-300' : 'text-emerald-300'
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

              return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Event inspector</p>
                      <p className="mt-1 text-lg font-semibold text-zinc-100">
                        {readableTitle(selected.type, selected.stripeId)}
                      </p>
                    </div>
                    <button
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
                      onClick={() => setInspectorEventId(null)}
                      type="button"
                    >
                      Close
                    </button>
                  </div>

                  {latestAttempt ? (
                    <div className={`rounded-lg border p-3 text-xs ${latestCardClass}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-1">
                          <RefreshCcw className="h-3.5 w-3.5" />
                          Latest destination response
                        </p>
                        {latestAttempt.responseBody || latestAttempt.error ? (
                          <CopyToClipboard
                            text={latestAttempt.responseBody ?? latestAttempt.error ?? ''}
                            label="Copy response"
                            className="inline-flex items-center gap-1 text-[11px] text-zinc-300 underline hover:text-zinc-100"
                            iconClassName="h-3 w-3"
                          />
                        ) : null}
                      </div>
                      <p className={`mt-1 ${latestTextClass}`}>Status: {latestAttempt.status ?? 'No status'}</p>
                      {latestAttempt.responseBody ? (
                        <pre className={`mt-2 max-h-40 overflow-auto rounded-md border border-white/10 bg-black/40 p-2 text-[11px] ${latestTextClass}`}>
                          {latestAttempt.responseBody}
                        </pre>
                      ) : latestAttempt.error ? (
                        <p className={`mt-1 break-all ${latestTextClass}`}>{latestAttempt.error}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-zinc-300">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Request journey</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <span className="rounded-md bg-black/45 px-2 py-1">{selected.providerName ?? 'Stripe'}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="rounded-md bg-black/45 px-2 py-1">Perspectify</span>
                      <ArrowRight className={`h-3.5 w-3.5 ${flowLastLegClass}`} />
                      <span className={`max-w-[320px] truncate rounded-md bg-black/45 px-2 py-1 ${flowLastLegClass}`}>{destination}</span>
                    </div>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-zinc-400">Received at</p>
                    <p className="mt-1 text-xs text-zinc-400">{new Date(selected.receivedAt).toLocaleString()}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-zinc-400">Source headers</p>
                    {selected.sourceHeaders ? (
                      <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-white/10 bg-black/45 p-2 text-[11px] text-zinc-200">
                        {JSON.stringify(selected.sourceHeaders, null, 2)}
                      </pre>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-500">No headers captured.</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-zinc-300">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Metadata</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Perspectify ID: <span className="text-zinc-100">{selected.id}</span>
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Payload size: <span className="text-zinc-100">{formatBytes(selected.payloadSize)}</span>
                    </p>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-zinc-300">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Attempt history</p>
                    {attemptsChrono.length === 0 ? (
                      <p className="mt-2 text-xs text-zinc-500">No delivery attempts recorded yet.</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5 text-xs text-zinc-400">
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

                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">Payload</p>
                      <CopyToClipboard
                        text={payloadText}
                        label="Copy JSON"
                        className="inline-flex items-center gap-1 text-xs text-zinc-300 underline hover:text-zinc-100"
                        iconClassName="h-3.5 w-3.5"
                      />
                    </div>
                    <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-white/10 bg-black/50 p-3 text-xs text-zinc-200">
                      <JsonViewer value={selected.payload ?? {}} />
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      ) : null}
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

function CenteredSpinner() {
  return (
    <div className="grid min-h-[68vh] place-items-center md:h-full md:min-h-full">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-emerald-300" />
    </div>
  )
}

function EventsLoadingSkeleton() {
  return (
    <section className="space-y-3 -mt-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 animate-pulse" key={`dashboard-skeleton-${index}`}>
          <div className="flex items-start gap-3">
            <span className="mt-2 h-2.5 w-2.5 rounded-full bg-white/20" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-56 rounded-full bg-white/15" />
              <div className="h-3 w-44 rounded-full bg-white/10" />
              <div className="h-2.5 w-24 rounded-full bg-white/10" />
            </div>
            <div className="h-9 w-40 rounded-lg border border-white/10 bg-white/10" />
          </div>
        </div>
      ))}
    </section>
  )
}

function readableTitle(type: string, stripeId: string) {
  const shortId = stripeId.slice(-8)
  const prettyType = type.replaceAll('_', ' ')
  return `${prettyType} — ${shortId}`
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

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} d ago`
}

function latestError(event: {
  eventAttempts: Array<{ error: string | null; responseBody: string | null }>
  lastAttemptStatus: number | null
  lastError?: string | null
}) {
  if (event.lastAttemptStatus === 200) return null
  const latestAttempt = event.eventAttempts?.[0]
  const rawError = latestAttempt
    ? latestAttempt.error ?? latestAttempt.responseBody ?? event.lastError ?? null
    : event.lastError ?? null

  if (!rawError) return null
  return rawError.length > 78 ? `${rawError.slice(0, 78)}...` : rawError
}

function requiresAttention(event: { lastAttemptStatus: number | null; status?: string }) {
  if (event.status === 'FAILED') return true
  return event.lastAttemptStatus !== null && event.lastAttemptStatus >= 400
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

function formatBytes(bytes: number | null) {
  if (!bytes) return '0 KB'
  const kb = bytes / 1024
  return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`
}
