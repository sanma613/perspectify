'use client'

import { ChevronDown, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EventResponse } from '../../../../../lib/api-types'
import { StatusDot } from './status-dot'
import { UpgradeGate } from './upgrade-gate'

type RowEvent = Pick<
  EventResponse,
  'id' | 'type' | 'status' | 'attempts' | 'destinationUrl' | 'receivedAt' | 'lastAttemptStatus'
> & {
  endpointName?: string | null
  amountLabel?: string | null
  replayDisabled?: boolean
}

function formatRelativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime()
  const minutes = Math.max(1, Math.floor(delta / 60000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function truncate(value: string, length: number) {
  if (value.length <= length) return value
  return `${value.slice(0, length - 1)}...`
}

export function EventRow({
  event,
  expanded,
  onToggle,
  onRescue,
  rescuePending,
  rescueError,
  plan,
  replayCount,
  rescueVariant = 'tooltip',
  children,
}: {
  event: RowEvent
  expanded: boolean
  onToggle: () => void
  onRescue?: () => void
  rescuePending?: boolean
  rescueError?: string | null
  plan?: 'free' | 'starter'
  replayCount?: number
  rescueVariant?: 'tooltip' | 'bottom-sheet'
  children?: ReactNode
}) {
  const destination = event.endpointName ?? event.destinationUrl ?? 'Unknown destination'
  const canRescue = event.status === 'FAILED' && onRescue

  return (
    <article className="rounded-xl border border-white/10 bg-[#111111]">
      <button
        className="grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors duration-200 ease-in-out hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 md:grid-cols-[auto_minmax(0,2.2fr)_minmax(0,1.3fr)_auto_auto_auto]"
        onClick={onToggle}
        type="button"
      >
        <StatusDot size="md" status={event.status} />
        <p className="min-w-0 truncate font-mono text-sm text-[#ffffff]">{event.type}</p>
        <p className="hidden min-w-0 truncate text-sm text-[#a1a1aa] md:block">{truncate(destination, 30)}</p>
        <p className="text-xs text-[#a1a1aa]">{formatRelativeTime(event.receivedAt)}</p>
        <p
          className={`text-xs ${event.attempts > 1 ? 'text-[#f59e0b]' : 'text-[#a1a1aa]'} ${event.lastAttemptStatus !== null && event.lastAttemptStatus >= 400 ? 'text-[#ef4444]' : ''}`}
        >
          {event.attempts}
        </p>
        <ChevronDown className={`h-4 w-4 text-[#a1a1aa] transition-transform duration-200 ease-in-out ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-white/10 px-3 py-3">
          {children}
          {canRescue ? (
            plan === 'free' ? (
              <UpgradeGate
                currentUsage={replayCount ?? 0}
                feature="replay_limit"
                plan={plan}
                variant={rescueVariant}
              >
                <button
                  className="px-3 py-1.5 rounded-lg bg-green-500 text-black text-xs font-bold inline-flex items-center gap-1.5"
                  disabled={rescuePending}
                  onClick={onRescue}
                  type="button"
                >
                  {rescuePending ? <Loader2 size={14} className="animate-spin" /> : null}
                  {rescuePending ? 'Rescuing...' : 'Rescue'}
                </button>
              </UpgradeGate>
            ) : (
              <button
                className="px-3 py-1.5 rounded-lg bg-green-500 text-black text-xs font-bold inline-flex items-center gap-1.5"
                disabled={rescuePending}
                onClick={onRescue}
                type="button"
              >
                {rescuePending ? <Loader2 size={14} className="animate-spin" /> : null}
                {rescuePending ? 'Rescuing...' : 'Rescue'}
              </button>
            )
          ) : null}
          {rescueError ? <p className="text-red-400 text-xs">{rescueError}</p> : null}
        </div>
      ) : null}
    </article>
  )
}
