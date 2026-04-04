'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, CircleCheckBig, Loader2, OctagonAlert, RefreshCcw } from 'lucide-react'
import { getAccessToken } from '../../../../lib/access-token'
import { derivePlanCapabilities } from '../../../../lib/capabilities'
import { apiFetch } from '../../../../lib/http'
import { usePaginatedEvents } from '../../../../lib/use-paginated-events'
import { useDashboardData } from '../../../../lib/use-dashboard-data'
import { useMobile } from '../../../../lib/hooks/use-mobile'
import type { EventResponse } from '../../../../lib/api-types'
import { EventDetailDrawer } from './event-detail-drawer'
import { FlashMessage } from './flash-message'
import { OnboardingFlow } from './onboarding-flow'
import { CopyToClipboard } from './copyToClipboard'
import { BottomSheet } from './ui/bottom-sheet'
import { ConfirmModal } from './ui/confirm-modal'
import { UpgradeGate } from './ui/upgrade-gate'

export function DashboardOverview() {
  const isMobile = useMobile()
  const { me, endpoints, loading, error } = useDashboardData()
  const [displayEvents, setDisplayEvents] = useState<EventResponse[]>([])
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [isRescueAllWorking, setIsRescueAllWorking] = useState(false)
  const [showRescueAllModal, setShowRescueAllModal] = useState(false)
  const [detailEventId, setDetailEventId] = useState<string | null>(null)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [selectedEndpointIds, setSelectedEndpointIds] = useState<string[]>([])
  const [showEndpointFilter, setShowEndpointFilter] = useState(false)
  const [isFilterTransitioning, setIsFilterTransitioning] = useState(false)
  const endpointFilterRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef<HTMLLIElement | null>(null)

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
        status: 'DELIVERING',
        lastAttemptStatus: null,
        lastError: null,
      })
      setRowErrors((current) => {
        if (!current[eventId]) return current
        const next = { ...current }
        delete next[eventId]
        return next
      })
    } catch (replayError) {
      setRowErrors((current) => ({
        ...current,
        [eventId]: 'Rescue failed. Try again.',
      }))
      throw replayError instanceof Error ? replayError : new Error('Replay failed. Try again.')
    } finally {
      setPendingId(null)
    }
  }

  async function rescueAllFailed() {
    setActionError(null)
    setActionSuccess(null)
    setIsRescueAllWorking(true)

    try {
      const token = await getAccessToken()
      const result = await apiFetch<{ rescued?: number; replayed?: number }>('/events/rescue-all', token, {
        method: 'POST',
      })
      const rescuedCount = result.rescued ?? result.replayed ?? 0
      setActionSuccess(
        rescuedCount > 0
          ? `${rescuedCount} failed event${rescuedCount === 1 ? '' : 's'} sent to rescue queue.`
          : 'No failed events available for Rescue All.'
      )
      for (const failedEvent of filteredEvents.filter((event) => resolveVisualState(event) === 'FAILED')) {
        patchEvent(failedEvent.id, {
          status: 'DELIVERING',
          lastAttemptStatus: null,
          lastError: null,
          replayCount: failedEvent.replayCount + 1,
        })
      }
      setShowRescueAllModal(false)
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
        {me.plan === 'free' ? (
          <UpgradeGate
            feature="rescue_all"
            plan={me.plan}
            variant={isMobile ? 'bottom-sheet' : 'tooltip'}
          >
            <button className="text-sm font-bold px-4 py-2 rounded-xl bg-green-500 text-black" type="button">
              Rescue all ({filteredFailedEvents})
            </button>
          </UpgradeGate>
        ) : (
          <button
            className="text-sm font-bold px-4 py-2 rounded-xl bg-green-500 text-black inline-flex items-center gap-1.5"
            onClick={() => setShowRescueAllModal(true)}
            type="button"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${isRescueAllWorking ? 'animate-spin' : ''}`} />
            Rescue all ({filteredFailedEvents})
          </button>
        )}
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
            const visualState = resolveVisualState(event)
            const isFailed = visualState === 'FAILED'
            const isDelivering = visualState === 'IN_PROGRESS'
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

            return (
              <li
                className="group flex cursor-pointer items-start justify-between gap-4 rounded-xl px-2 py-3 transition hover:bg-white/5"
                key={event.id}
                onClick={() => setDetailEventId(event.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(eventKey) => {
                  if (eventKey.key === 'Enter' || eventKey.key === ' ') {
                    eventKey.preventDefault()
                    setDetailEventId(event.id)
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
                        setDetailEventId(event.id)
                      }}
                      type="button"
                    >
                      View details
                    </button>
                    {rowErrors[event.id] ? <p className="mt-1 text-red-400 text-xs">{rowErrors[event.id]}</p> : null}
                  </div>
                </div>

                <div className="relative flex w-40 shrink-0 flex-col items-end gap-1">
                  {isFailed ? (
                    me.plan === 'free' ? (
                      <UpgradeGate
                        currentUsage={event.replayCount}
                        feature="replay_limit"
                        plan={me.plan}
                        variant={isMobile ? 'bottom-sheet' : 'tooltip'}
                      >
                        <button
                          className="px-3 py-1.5 rounded-lg bg-green-500 text-black text-xs font-bold inline-flex items-center gap-1.5"
                          disabled={pendingId === event.id}
                          onClick={(eventClick) => {
                            eventClick.stopPropagation()
                            void replay(event.id)
                          }}
                          type="button"
                        >
                          {pendingId === event.id ? <Loader2 className="animate-spin" size={14} /> : null}
                          {pendingId === event.id ? 'Rescuing...' : 'Rescue'}
                        </button>
                      </UpgradeGate>
                    ) : (
                      <button
                        className="px-3 py-1.5 rounded-lg bg-green-500 text-black text-xs font-bold inline-flex items-center gap-1.5"
                        disabled={pendingId === event.id}
                        onClick={(eventClick) => {
                          eventClick.stopPropagation()
                          void replay(event.id)
                        }}
                        type="button"
                      >
                        {pendingId === event.id ? <Loader2 className="animate-spin" size={14} /> : null}
                        {pendingId === event.id ? 'Rescuing...' : 'Rescue'}
                      </button>
                    )
                  ) : (
                    <span className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400">
                      {readableStatus(visualState)}
                    </span>
                  )}
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

      {isMobile ? (
        <BottomSheet onClose={() => setShowRescueAllModal(false)} open={showRescueAllModal} title="Rescue all failed events?">
          <p className="text-sm text-zinc-300 leading-relaxed">
            This will re-queue {filteredFailedEvents} failed event{filteredFailedEvents === 1 ? '' : 's'} for delivery to your endpoints.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              className="h-11 flex-1 rounded-lg bg-zinc-700 text-sm text-white"
              onClick={() => setShowRescueAllModal(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="h-11 flex-1 rounded-lg bg-green-500 text-sm font-bold text-black inline-flex items-center justify-center gap-1.5"
              disabled={isRescueAllWorking}
              onClick={() => {
                void rescueAllFailed()
              }}
              type="button"
            >
              {isRescueAllWorking ? <Loader2 className="animate-spin" size={14} /> : null}
              Rescue all
            </button>
          </div>
        </BottomSheet>
      ) : (
        <ConfirmModal
          cancelLabel="Cancel"
          confirmLabel={isRescueAllWorking ? 'Rescuing...' : 'Rescue all'}
          onClose={() => setShowRescueAllModal(false)}
          onConfirm={() => {
            void rescueAllFailed()
          }}
          open={showRescueAllModal}
          title="Rescue all failed events?"
          description={`This will re-queue ${filteredFailedEvents} failed event${filteredFailedEvents === 1 ? '' : 's'} for delivery to your endpoints.`}
        />
      )}

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

function formatBytes(bytes: number | null) {
  if (!bytes) return '0 KB'
  const kb = bytes / 1024
  return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`
}
