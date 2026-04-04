'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { getAccessToken } from '../../../../lib/access-token'
import { derivePlanCapabilities } from '../../../../lib/capabilities'
import { apiFetch } from '../../../../lib/http'
import { useDashboardData } from '../../../../lib/use-dashboard-data'
import { useMobile } from '../../../../lib/hooks/use-mobile'
import type { EventResponse } from '../../../../lib/api-types'
import { EventDetailDrawer } from './event-detail-drawer'
import { UpgradeGate } from './ui/upgrade-gate'

export function DashboardOverview() {
  const isMobile = useMobile()
  const { me, loading, error, eventStats, endpoints, refresh } = useDashboardData()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [detailEvent, setDetailEvent] = useState<EventResponse | null>(null)
  const [rescueAllPending, setRescueAllPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const capabilities = useMemo(() => {
    if (!me) return null
    return derivePlanCapabilities({
      plan: me.plan,
      limits: me.limits,
      endpointCount: endpoints.length,
    })
  }, [endpoints.length, me])

  if (loading && !eventStats) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-emerald-400" />
      </div>
    )
  }

  if (!me || !eventStats || error) {
    return <p className="text-sm text-red-400">{error ?? 'Could not load dashboard.'}</p>
  }

  const failed = eventStats.failed
  const pending = eventStats.pending
  const eventsThisMonth = eventStats.eventsThisMonth
  const successRate = eventsThisMonth > 0 ? Math.round((eventStats.delivered / eventsThisMonth) * 100) : 100
  const usagePct = me.limits.maxEventsPerMonth > 0
    ? Math.min(100, Math.round((eventsThisMonth / me.limits.maxEventsPerMonth) * 100))
    : 0

  const latestEvent = [...eventStats.failedRecent, ...eventStats.recentDelivered]
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0] ?? null

  const healthState = failed > 0 ? 'FAILED' : pending > 0 ? 'IN_FLIGHT' : 'CLEAR'

  async function rescue(eventId: string) {
    setActionError(null)
    setPendingId(eventId)
    try {
      const token = await getAccessToken()
      await apiFetch(`/events/${eventId}/rescue`, token, { method: 'POST' })
      await refresh()
    } catch (rescueError) {
      setActionError(rescueError instanceof Error ? rescueError.message : 'Rescue failed.')
    } finally {
      setPendingId(null)
    }
  }

  async function rescueAll() {
    setActionError(null)
    setRescueAllPending(true)
    try {
      const token = await getAccessToken()
      await apiFetch('/events/rescue-all', token, { method: 'POST' })
      await refresh()
    } catch (rescueError) {
      setActionError(rescueError instanceof Error ? rescueError.message : 'Rescue all failed.')
    } finally {
      setRescueAllPending(false)
    }
  }

  return (
    <section className="space-y-5 border-t border-white/10 pt-4">
      <SystemHealthBar
        state={healthState}
        failed={failed}
        pending={pending}
        lastReceivedAt={latestEvent?.receivedAt ?? null}
        canBulkRescue={me.plan !== 'free'}
      />

      {failed > 0 ? (
        <div id="needs-rescue" className="rounded-xl border border-red-500/20 bg-zinc-950/70">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center">
              <h3 className="text-sm font-display font-bold text-white">Needs rescue</h3>
              <span className="ml-2 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                {failed}
              </span>
            </div>

            {me.plan === 'free' ? (
              <UpgradeGate feature="rescue_all" plan={me.plan} variant={isMobile ? 'bottom-sheet' : 'tooltip'}>
                <button className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300" type="button">
                  Rescue all
                </button>
              </UpgradeGate>
            ) : (
              <button
                className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-bold text-black"
                onClick={() => {
                  void rescueAll()
                }}
                type="button"
                disabled={rescueAllPending}
              >
                {rescueAllPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Rescue all'}
              </button>
            )}
          </div>

          {eventStats.failedRecent.map((event) => (
            <button
              key={event.id}
              className="flex h-14 w-full items-center gap-3 border-t border-white/5 px-4 text-left transition hover:bg-white/[0.02]"
              onClick={() => setDetailEvent(event)}
              type="button"
            >
              <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              <span className="max-w-[180px] truncate font-mono text-xs text-zinc-300">{event.type}</span>
              <span className="max-w-[140px] truncate text-xs text-zinc-500">→ {event.endpointName ?? 'Unknown'}</span>
              <span className="ml-auto text-xs text-zinc-600">{relativeTime(event.receivedAt)}</span>
              {event.latestAttempt?.durationMs && event.latestAttempt.durationMs > 8000 ? (
                <span className="rounded bg-red-500/10 px-2 py-0.5 font-mono text-xs text-red-400">{event.latestAttempt.durationMs}ms</span>
              ) : null}
              <button
                className="ml-3 shrink-0 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-bold text-black"
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation()
                  void rescue(event.id)
                }}
                type="button"
                disabled={pendingId === event.id}
              >
                {pendingId === event.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Rescue'}
              </button>
            </button>
          ))}

          {failed > 5 ? (
            <Link className="block px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300" href="/dashboard/events?status=FAILED">
              View {failed - 5} more →
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="EVENTS THIS MONTH"
          value={String(eventsThisMonth)}
          sub={`${eventsThisMonth} / ${me.limits.maxEventsPerMonth}`}
          barColor={usagePct >= 100 ? 'bg-red-500' : usagePct >= 80 ? 'bg-amber-500' : 'bg-green-500'}
          barValue={usagePct}
        />
        <MetricCard
          label="DELIVERED"
          value={String(eventStats.delivered)}
          sub={`${successRate}% success rate`}
          subClass={successRate > 95 ? 'text-green-400' : successRate >= 80 ? 'text-amber-400' : 'text-red-400'}
        />
        <MetricCard
          label="FAILED"
          value={String(eventStats.failed)}
          valueClass={eventStats.failed > 0 ? 'text-red-400' : 'text-zinc-500'}
          sub={eventStats.failed > 0 ? 'Needs attention' : 'None this month ✓'}
          subClass={eventStats.failed > 0 ? 'text-red-400' : 'text-zinc-600'}
        />
        <MetricCard
          label="AVG. RESPONSE"
          value={eventStats.avgResponseMs !== null ? `${Math.round(eventStats.avgResponseMs)}ms` : 'N/A'}
          valueClass="font-mono"
          sub={
            eventStats.avgResponseMs === null
              ? 'No data yet'
              : eventStats.avgResponseMs > 9000
                ? 'Near timeout'
                : eventStats.avgResponseMs > 5000
                  ? 'Slow destination'
                  : eventStats.avgResponseMs < 2000
                    ? 'Fast ✓'
                    : 'Normal'
          }
          subClass={
            eventStats.avgResponseMs === null
              ? 'text-zinc-600'
              : eventStats.avgResponseMs > 9000
                ? 'text-red-400'
                : eventStats.avgResponseMs > 5000
                  ? 'text-amber-400'
                  : 'text-zinc-600'
          }
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-950/60">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-display font-bold text-white">Recent activity</h3>
          <Link className="text-xs text-zinc-500 hover:text-zinc-300" href="/dashboard/events">View all →</Link>
        </div>
        {eventStats.recentDelivered.map((event) => (
          <button
            key={event.id}
            className="flex h-14 w-full items-center gap-3 border-t border-white/5 px-4 text-left transition hover:bg-white/[0.02]"
            onClick={() => setDetailEvent(event)}
            type="button"
          >
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="max-w-[180px] truncate font-mono text-xs text-zinc-300">{event.type}</span>
            <span className="max-w-[140px] truncate text-xs text-zinc-500">→ {event.endpointName ?? 'Unknown'}</span>
            <span className="ml-auto text-xs text-zinc-600">{relativeTime(event.receivedAt)}</span>
            {event.latestAttempt?.durationMs !== null && event.latestAttempt?.durationMs !== undefined ? (
              <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-500">{event.latestAttempt.durationMs}ms</span>
            ) : null}
          </button>
        ))}
      </div>

      {actionError ? <p className="text-xs text-red-400">{actionError}</p> : null}

      <EventDetailDrawer
        open={Boolean(detailEvent)}
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onReplay={async (eventId) => {
          await rescue(eventId)
        }}
        plan={me.plan}
      />
    </section>
  )
}

function SystemHealthBar({
  state,
  failed,
  pending,
  lastReceivedAt,
  canBulkRescue,
}: {
  state: 'CLEAR' | 'IN_FLIGHT' | 'FAILED'
  failed: number
  pending: number
  lastReceivedAt: string | null
  canBulkRescue: boolean
}) {
  const config = state === 'FAILED'
    ? {
        container: 'bg-[rgba(239,68,68,0.06)] border-[rgba(239,68,68,0.2)]',
        color: 'rgb(239,68,68)',
        text: `${failed} events need rescue`,
      }
    : state === 'IN_FLIGHT'
      ? {
          container: 'bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.15)]',
          color: 'rgb(245,158,11)',
          text: `${pending} events in flight`,
        }
      : {
          container: 'bg-[rgba(34,197,94,0.06)] border-[rgba(34,197,94,0.15)]',
          color: 'rgb(34,197,94)',
          text: 'All systems delivering',
        }

  return (
    <div className={`flex h-11 items-center justify-between rounded-xl border px-4 ${config.container}`}>
      <div className="flex items-center gap-2 text-sm text-zinc-100">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: config.color }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: config.color }} />
        </span>
        {config.text}
      </div>

      {state === 'FAILED' ? (
        canBulkRescue ? (
          <Link className="text-xs text-green-400 hover:underline" href="#needs-rescue">Rescue all →</Link>
        ) : (
          <Lock size={14} className="text-zinc-500" />
        )
      ) : state === 'IN_FLIGHT' ? (
        <Loader2 size={14} className="animate-spin text-amber-400" />
      ) : (
        <span className="text-xs text-zinc-500">Last event {lastReceivedAt ? relativeTime(lastReceivedAt) : 'N/A'}</span>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  sub,
  subClass = 'text-zinc-500',
  valueClass = 'text-zinc-100',
  barValue,
  barColor,
}: {
  label: string
  value: string
  sub: string
  subClass?: string
  valueClass?: string
  barValue?: number
  barColor?: string
}) {
  return (
    <div className="rounded-xl bg-zinc-900 p-5">
      <p className="text-[10px] tracking-[0.2em] text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>
      {typeof barValue === 'number' ? (
        <div className="mt-2 h-1.5 w-full rounded bg-zinc-800">
          <div className={`h-1.5 rounded ${barColor ?? 'bg-green-500'}`} style={{ width: `${barValue}%` }} />
        </div>
      ) : null}
      <p className={`mt-2 text-xs ${subClass}`}>{sub}</p>
    </div>
  )
}

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
