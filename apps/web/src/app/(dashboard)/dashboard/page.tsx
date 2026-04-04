'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Copy } from 'lucide-react'
import type { EventResponse } from '../../../lib/api-types'
import { getAccessToken } from '../../../lib/access-token'
import { apiFetch } from '../../../lib/http'
import { usePaginatedEvents } from '../../../lib/use-paginated-events'
import { useDashboardData } from '../../../lib/use-dashboard-data'
import { useMobile } from '../../../lib/hooks/use-mobile'
import { Skeleton } from '../../../components/skeleton'
import { EmptyState } from './_components/ui/empty-state'
import { EventRow } from './_components/ui/event-row'
import { MetricCard } from './_components/ui/metric-card'
import { UpgradeGate } from './_components/ui/upgrade-gate'

function relative(value: string | null) {
  if (!value) return 'Never'
  const delta = Date.now() - new Date(value).getTime()
  const mins = Math.max(1, Math.floor(delta / 60000))
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  return `${Math.floor(hrs / 24)} d ago`
}

function amountFromPayload(payload: Record<string, unknown>) {
  const objectValue = payload.data
  if (!objectValue || typeof objectValue !== 'object') return null
  const objectNode = (objectValue as Record<string, unknown>).object
  if (!objectNode || typeof objectNode !== 'object') return null
  const amount = (objectNode as Record<string, unknown>).amount
  if (typeof amount !== 'number') return null
  return `$${(amount / 100).toFixed(2)}`
}

function WaitingForFirstEvent({ endpointItems }: { endpointItems: Array<{ name: string; destination: string }> }) {
  const endpointCount = endpointItems.length
  const hasOneEndpoint = endpointCount === 1
  const endpointHeading = hasOneEndpoint ? '● Your endpoint is ready' : '● Your endpoints are ready'
  const endpointListLabel = hasOneEndpoint ? 'Configured endpoint' : 'Configured endpoints'
  const [copied, setCopied] = useState(false)
  const commandLines = ['stripe login', 'stripe trigger payment_intent.succeeded']

  async function copyCommandLine() {
    await navigator.clipboard.writeText(commandLines.join('\n'))
    setCopied(true)
    window.setTimeout(() => {
      setCopied(false)
    }, 1200)
  }

  return (
    <section className="rounded-xl border border-white/10 bg-[#111111] p-4">
      <p className="text-sm text-white">{endpointHeading}</p>
      <p className="mt-4 text-sm text-[#a1a1aa]">Configure Stripe and send your first webhook.</p>

      <div className="mt-3 rounded-lg border border-white/10 bg-[#1a1a1a] p-3">
        <p className="text-xs text-[#a1a1aa]">{endpointListLabel}</p>
        <ul className="mt-2 space-y-1">
          {endpointItems.map((endpoint, index) => (
            <li className="truncate font-mono text-xs text-white" key={`${endpoint.name}-${index}`}>
              • {endpoint.name} ({endpoint.destination})
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-[#a1a1aa]">Ensure at least one listed endpoint is configured in Stripe.</p>
      </div>

      <p className="mt-4 text-sm text-[#a1a1aa]">Open Stripe Webhooks and confirm your endpoint is active.</p>
      <a
        className="mt-2 inline-flex h-11 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white"
        href="https://dashboard.stripe.com/webhooks"
        rel="noopener noreferrer"
        target="_blank"
      >
        Open Stripe Webhooks
      </a>

      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="text-sm text-[#a1a1aa]">To test from Stripe CLI:</p>
        <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-3">
          <p className="text-xs text-[#a1a1aa]">1. Install Stripe CLI:</p>
          <a
            className="inline-flex text-xs text-[#22c55e] underline underline-offset-2"
            href="https://docs.stripe.com/stripe-cli/install"
            rel="noopener noreferrer"
            target="_blank"
          >
            Stripe CLI download
          </a>
          <p className="text-xs text-[#a1a1aa]">2. Run these commands in your terminal:</p>

          <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0b0b0b]">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Command line</p>
              <div className="relative">
                <button
                  aria-label="Copy commands"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-300 transition hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    void copyCommandLine()
                  }}
                  type="button"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {copied ? (
                  <span className="pointer-events-none absolute right-0 top-8 whitespace-nowrap rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-xs text-emerald-200">
                    Copied
                  </span>
                ) : null}
              </div>
            </div>
            <div className="space-y-1 px-3 py-3 font-mono text-xs text-white">
              {commandLines.map((command) => (
                <p key={command}>$ {command}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-white/10 bg-[#131313] px-3 py-3">
          <p className="text-xs text-[#a1a1aa]">For more information:</p>
          <a
            className="mt-1 inline-flex text-xs text-[#22c55e] underline underline-offset-2"
            href="https://docs.stripe.com/stripe-cli/"
            rel="noopener noreferrer"
            target="_blank"
          >
            Stripe CLI docs
          </a>
        </div>
      </div>
    </section>
  )
}

function EventCard({
  event,
  onRescue,
  locked,
  plan,
}: {
  event: EventResponse
  onRescue: () => void
  locked: boolean
  plan: 'free' | 'starter'
}) {
  return (
    <article className="rounded-xl border border-white/10 bg-[#111111] p-4">
      <p className="text-sm text-white">● {event.type}</p>
      <p className="mt-1 text-sm text-[#a1a1aa]">{amountFromPayload(event.payload) ?? 'Unknown amount'}</p>
      <p className="mt-1 text-xs text-[#a1a1aa]">{event.destinationUrl ?? 'Unknown destination'}</p>
      <p className="mt-1 text-xs text-[#71717a]">
        {relative(event.receivedAt)} · {event.attempts} attempts
      </p>

      <div className="mt-3">
        <UpgradeGate currentUsage={event.replayCount} feature="replay_limit" plan={plan} variant="bottom-sheet">
          <button
            className={`h-11 w-full rounded-lg px-4 text-sm font-medium ${
              locked ? 'border border-zinc-700 bg-zinc-700 text-zinc-200' : 'bg-[#22c55e] text-[#031108]'
            }`}
            onClick={onRescue}
            type="button"
          >
            Rescue
          </button>
        </UpgradeGate>
      </div>
    </article>
  )
}

export default function DashboardPage() {
  const isMobile = useMobile()
  const { me, endpoints, loading, error, eventsThisMonth } = useDashboardData()

  const [pendingRescue, setPendingRescue] = useState<string | null>(null)
  const [rescueAllLoading, setRescueAllLoading] = useState(false)
  const rescueRef = useRef<HTMLDivElement | null>(null)
  const endpointIds = useMemo(() => endpoints.map((endpoint) => endpoint.id), [endpoints])

  const {
    events,
    loading: eventsLoading,
    error: eventsError,
    patchEvent,
    showPendingBanner,
    pendingCount,
    flushPendingEvents,
  } = usePaginatedEvents({
    allEndpointIds: endpointIds,
    selectedEndpointIds: [],
    needsRescue: false,
  })

  const failedEvents = useMemo(() => events.filter((event) => event.status === 'FAILED'), [events])
  const deliveredEvents = useMemo(() => events.filter((event) => event.status === 'DELIVERED'), [events])

  const hasEndpoints = endpoints.length > 0
  const hasEvents = events.length > 0

  if (loading || eventsLoading) {
    return <DashboardSkeleton />
  }

  if (error || eventsError || !me) {
    return <p className="text-sm text-[#ef4444]">{error ?? eventsError ?? 'Could not load dashboard.'}</p>
  }

  if (!hasEndpoints) {
    return (
      <EmptyState
        action={
          <Link
            className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white"
            href="/onboarding"
          >
            Set up your first endpoint →
          </Link>
        }
        description="Create your first endpoint to start receiving webhooks."
        title="No endpoints yet"
      />
    )
  }

  const endpointItems = endpoints
    .map((endpoint) => ({
      name: endpoint.name,
      destination: endpoint.destination,
    }))
    .filter((endpoint) => Boolean(endpoint.name && endpoint.destination))

  async function rescueEvent(eventId: string) {
    setPendingRescue(eventId)
    try {
      const token = await getAccessToken()
      await apiFetch(`/events/${eventId}/replay`, token, { method: 'POST' })
      patchEvent(eventId, (event) => ({
        ...event,
        status: 'PENDING',
        replayCount: event.replayCount + 1,
      }))
    } finally {
      setPendingRescue(null)
    }
  }

  async function rescueAll() {
    setRescueAllLoading(true)
    try {
      const token = await getAccessToken()
      await apiFetch('/events/replay-all', token, { method: 'POST' })
      for (const failedEvent of failedEvents) {
        patchEvent(failedEvent.id, (event) => ({
          ...event,
          status: 'PENDING',
          replayCount: event.replayCount + 1,
        }))
      }
    } finally {
      setRescueAllLoading(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 rounded-full border border-[#22c55e]/40 bg-[#22c55e]/15 px-4 py-3 text-sm text-[#dcfce7] md:flex-row md:items-center md:justify-between">
        <span className="truncate">● All systems delivering</span>
        <span className="text-xs text-[#bbf7d0]">Last updated {events[0]?.receivedAt ? relative(events[0].receivedAt) : 'just now'}</span>
      </div>

      {showPendingBanner ? (
        <button
          onClick={() => {
            void flushPendingEvents()
          }}
          className="animate-pulse-once flex w-full items-center justify-between rounded-xl border border-green-500/25 bg-green-500/8 px-4 py-3 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/12"
          type="button"
        >
          <div className="flex items-center gap-2">
            <ArrowDown size={16} />
            <span>{pendingCount} new event{pendingCount !== 1 ? 's' : ''} received</span>
          </div>
          <span className="text-xs text-green-500/60">Click to load</span>
        </button>
      ) : null}

      {!hasEvents ? (
        <WaitingForFirstEvent endpointItems={endpointItems} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
            <MetricCard label="Events" subtext="this month" value={String(eventsThisMonth)} />
            <MetricCard colorVariant="success" label="Delivered" subtext="successful" value={String(deliveredEvents.length)} />
            <MetricCard colorVariant={failedEvents.length > 0 ? 'danger' : 'default'} label="Failed" subtext="needs rescue" value={String(failedEvents.length)} />
            <MetricCard label="Replays" subtext={`${me.plan === 'free' ? '3 max' : 'unlimited'}`} value={String(me.usage.replaysUsed)} />
          </div>

          {failedEvents.length > 0 ? (
            <section className="space-y-2" ref={rescueRef}>
              <header className="flex items-center justify-between">
                <h2 className="font-display text-lg text-white">Needs rescue</h2>
                <UpgradeGate feature="rescue_all" plan={me.plan} variant={isMobile ? 'bottom-sheet' : 'tooltip'}>
                  <button
                    className="inline-flex h-11 items-center rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/20 px-4 text-sm text-white"
                    onClick={() => {
                      void rescueAll()
                    }}
                    type="button"
                  >
                    {rescueAllLoading ? 'Rescuing...' : 'Rescue all'}
                  </button>
                </UpgradeGate>
              </header>

              <div className="flex flex-col gap-3 md:hidden">
                {failedEvents.map((event) => (
                  <EventCard
                    event={event}
                    key={event.id}
                    locked={event.replayCount >= 3 && me.plan === 'free'}
                    plan={me.plan}
                    onRescue={() => {
                      void rescueEvent(event.id)
                    }}
                  />
                ))}
              </div>

              <div className="hidden md:block">
                {failedEvents.map((event) => (
                  <EventRow
                    event={{
                      id: event.id,
                      type: event.type,
                      status: event.status,
                      attempts: event.attempts,
                      receivedAt: event.receivedAt,
                      destinationUrl: event.destinationUrl,
                      endpointName: event.destinationUrl,
                      amountLabel: amountFromPayload(event.payload),
                      lastAttemptStatus: event.lastAttemptStatus,
                    }}
                    expanded={false}
                    key={event.id}
                    onRescue={() => {
                      void rescueEvent(event.id)
                    }}
                    onToggle={() => {}}
                    rescuePending={pendingRescue === event.id}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <header className="flex items-center justify-between">
              <h2 className="font-display text-lg text-white">Recent activity</h2>
              <Link className="text-sm text-[#22c55e]" href="/dashboard/events">
                View full history
              </Link>
            </header>

            {deliveredEvents.slice(0, 8).map((event) => (
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#111111] px-3 py-3" key={event.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{event.type}</p>
                  <p className="truncate text-xs text-[#a1a1aa]">{event.destinationUrl ?? 'Unknown destination'} · {relative(event.receivedAt)}</p>
                </div>
                <p className="text-xs text-[#a1a1aa]">{event.attempts} attempts</p>
              </div>
            ))}
          </section>
        </>
      )}
    </section>
  )
}

function DashboardSkeleton() {
  return (
    <section className="space-y-4">
      <Skeleton className="h-9 w-52 rounded-full" />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {[1, 2, 3, 4].map((item) => (
          <div className="rounded-xl border border-white/10 bg-[#111111] p-5" key={`metric-skeleton-${item}`}>
            <Skeleton className="mb-4 h-3 w-20" />
            <Skeleton className="h-8 w-14" />
            <Skeleton className="mt-3 h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2">
        {[1, 2, 3, 4, 5].map((item) => (
          <div className="flex items-center gap-3 border-b border-white/5 py-4 last:border-b-0" key={`event-skeleton-${item}`}>
            <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="ml-auto h-4 w-20" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-4" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#111111] p-4">
        <div className="space-y-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    </section>
  )
}
