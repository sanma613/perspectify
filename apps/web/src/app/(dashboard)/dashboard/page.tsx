'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy } from 'lucide-react'
import type { EventResponse } from '../../../lib/api-types'
import { getAccessToken } from '../../../lib/access-token'
import { apiFetch, getApiBaseUrl } from '../../../lib/http'
import { useDashboardData } from '../../../lib/use-dashboard-data'
import { useMobile } from '../../../lib/hooks/use-mobile'
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

function WaitingForFirstEvent({ endpointUrl }: { endpointUrl: string }) {
  async function copy(value: string) {
    await navigator.clipboard.writeText(value)
  }

  return (
    <section className="rounded-xl border border-white/10 bg-[#111111] p-4">
      <p className="text-sm text-white">● Your endpoint is ready</p>
      <p className="mt-4 text-sm text-[#a1a1aa]">Waiting for your first webhook from Stripe</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#1a1a1a] p-3">
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-white">{endpointUrl}</p>
        <button
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
          onClick={() => {
            void copy(endpointUrl)
          }}
          type="button"
        >
          <Copy className="h-4 w-4" />
          Copy
        </button>
      </div>

      <p className="mt-4 text-sm text-[#a1a1aa]">Make sure this URL is saved in Stripe.</p>
      <a
        className="mt-2 inline-flex h-11 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white"
        href="https://dashboard.stripe.com/webhooks"
        rel="noreferrer"
        target="_blank"
      >
        Open Stripe Webhooks
      </a>

      <p className="mt-4 text-sm text-[#a1a1aa]">Once Stripe fires a webhook, it will appear here automatically.</p>

      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="text-sm text-[#a1a1aa]">To test it now:</p>
        <p className="mt-2 rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 font-mono text-xs text-white">
          stripe trigger payment_intent.succeeded
        </p>
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
  const router = useRouter()
  const isMobile = useMobile()
  const { me, endpoints, loading, error, eventsThisMonth } = useDashboardData()

  const [events, setEvents] = useState<EventResponse[]>([])
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [pendingRescue, setPendingRescue] = useState<string | null>(null)
  const [rescueAllLoading, setRescueAllLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isNew, setIsNew] = useState(false)
  const rescueRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setIsNew(typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('new') === 'true')
  }, [])

  useEffect(() => {
    async function loadEvents() {
      try {
        const token = await getAccessToken()
        const response = await apiFetch<{ items: EventResponse[] }>('/events?limit=30', token)
        setEvents(response.items)
        setLastUpdated(new Date())
      } catch (fetchError) {
        setEventsError(fetchError instanceof Error ? fetchError.message : 'Could not load events.')
      }
    }

    void loadEvents()
  }, [])

  const failedEvents = useMemo(() => events.filter((event) => event.status === 'FAILED'), [events])
  const deliveredEvents = useMemo(() => events.filter((event) => event.status === 'DELIVERED'), [events])

  const hasEndpoints = endpoints.length > 0
  const hasEvents = events.length > 0

  useEffect(() => {
    if (isNew && !hasEndpoints) {
      router.replace('/onboarding')
    }
  }, [isNew, hasEndpoints, router])

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-[#111111]" />
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
            Open onboarding
          </Link>
        }
        description="Create your first endpoint to start receiving webhooks."
        title="No endpoint yet"
      />
    )
  }

  const endpointUrl = `${getApiBaseUrl()}/webhook/${endpoints[0]?.tokenPrefix ?? 'psp_live_...'}`

  async function rescueEvent(eventId: string) {
    setPendingRescue(eventId)
    try {
      const token = await getAccessToken()
      await apiFetch(`/events/${eventId}/replay`, token, { method: 'POST' })
      setEvents((current) =>
        current.map((event) =>
          event.id === eventId
            ? { ...event, status: 'PENDING', replayCount: event.replayCount + 1 }
            : event
        )
      )
    } finally {
      setPendingRescue(null)
    }
  }

  async function rescueAll() {
    setRescueAllLoading(true)
    try {
      const token = await getAccessToken()
      await apiFetch('/events/replay-all', token, { method: 'POST' })
      setEvents((current) =>
        current.map((event) =>
          event.status === 'FAILED' ? { ...event, status: 'PENDING', replayCount: event.replayCount + 1 } : event
        )
      )
    } finally {
      setRescueAllLoading(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 rounded-full border border-[#22c55e]/40 bg-[#22c55e]/15 px-4 py-3 text-sm text-[#dcfce7] md:flex-row md:items-center md:justify-between">
        <span className="truncate">● All systems delivering</span>
        <span className="text-xs text-[#bbf7d0]">Last updated {lastUpdated ? relative(lastUpdated.toISOString()) : 'just now'}</span>
      </div>

      {!hasEvents ? (
        <WaitingForFirstEvent endpointUrl={endpointUrl} />
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
