'use client'

import { AlertCircle, Copy, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAccessToken } from '../../../../lib/access-token'
import type { EventDetailResponse, EventResponse } from '../../../../lib/api-types'
import { apiFetch } from '../../../../lib/http'
import { useMobile } from '../../../../lib/hooks/use-mobile'
import { PLANS } from '../../../../lib/plans'
import { BottomSheet } from './ui/bottom-sheet'
import { ConfirmModal } from './ui/confirm-modal'
import { SlideOver } from './ui/slide-over'

type DetailTab = 'overview' | 'payload' | 'response'

interface EventDetailDrawerProps {
  open: boolean
  event: EventResponse | null
  onClose: () => void
  onReplay: (eventId: string) => Promise<void>
  plan: 'free' | 'starter'
  endpointNameFallback?: string | null
  destinationFallback?: string | null
}

export function EventDetailDrawer({
  open,
  event,
  onClose,
  onReplay,
  plan,
  endpointNameFallback,
  destinationFallback,
}: EventDetailDrawerProps) {
  const isMobile = useMobile()
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [detailCache, setDetailCache] = useState<Record<string, EventDetailResponse>>({})
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [showReplayConfirm, setShowReplayConfirm] = useState(false)
  const [replayLoading, setReplayLoading] = useState(false)
  const [replayError, setReplayError] = useState<string | null>(null)

  const selectedId = event?.id ?? null
  const detail = selectedId ? detailCache[selectedId] : undefined
  const effectiveEvent = detail ?? event

  const endpointName =
    detail?.endpoint?.name ??
    effectiveEvent?.endpointName ??
    endpointNameFallback ??
    'Unknown endpoint'

  const destination =
    detail?.endpoint?.destination ??
    effectiveEvent?.destinationUrl ??
    destinationFallback ??
    'Unknown destination'

  const attempts = useMemo(() => {
    const input = effectiveEvent?.eventAttempts ?? []
    return [...input].sort((a, b) => a.attempt - b.attempt)
  }, [effectiveEvent?.eventAttempts])

  const fallbackDeliveries = effectiveEvent?.deliveries ?? []
  const latestAttempt = attempts[attempts.length - 1] ?? null
  const statusLabel = effectiveEvent ? readableStatus(resolveVisualState(effectiveEvent)) : 'In progress'

  const ensureDetail = useCallback(async () => {
    if (!selectedId || detailCache[selectedId]) return

    setLoadingDetail(true)
    setDetailError(null)
    try {
      const token = await getAccessToken()
      const data = await apiFetch<EventDetailResponse>(`/events/${selectedId}`, token)
      setDetailCache((current) => ({
        ...current,
        [selectedId]: data,
      }))
    } catch (fetchError) {
      setDetailError(fetchError instanceof Error ? fetchError.message : 'Could not load event detail.')
    } finally {
      setLoadingDetail(false)
    }
  }, [detailCache, selectedId])

  useEffect(() => {
    if (!open) return
    setActiveTab('overview')
    setDetailError(null)
    setShowReplayConfirm(false)
    setReplayError(null)
  }, [open, selectedId])

  async function handleReplayConfirm() {
    if (!effectiveEvent || replayLoading) return
    setReplayLoading(true)
    setReplayError(null)
    try {
      await onReplay(effectiveEvent.id)
      setShowReplayConfirm(false)
    } catch (error) {
      setReplayError(error instanceof Error ? error.message : 'Replay failed. Try again.')
    } finally {
      setReplayLoading(false)
    }
  }

  function openTab(tab: DetailTab) {
    setActiveTab(tab)
    if (tab === 'payload' || tab === 'response') {
      void ensureDetail()
    }
  }

  if (!effectiveEvent) {
    return null
  }

  const body = (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-1 text-xs">
        {(['overview', 'payload', 'response'] as const).map((tab) => {
          const active = activeTab === tab
          return (
            <button
              className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${active ? 'bg-emerald-400/20 text-emerald-100' : 'text-zinc-400 hover:text-zinc-100'}`}
              key={tab}
              onClick={() => openTab(tab)}
              type="button"
            >
              {tab}
            </button>
          )
        })}
      </div>

      {detailError ? <p className="text-xs text-red-300">{detailError}</p> : null}

      {activeTab === 'overview' ? (
        <OverviewTab
          event={effectiveEvent}
          endpointName={endpointName}
          destination={destination}
          attempts={attempts}
          fallbackDeliveries={fallbackDeliveries}
          statusLabel={statusLabel}
          plan={plan}
          replayLoading={replayLoading}
          onReplay={() => setShowReplayConfirm(true)}
        />
      ) : null}

      {activeTab === 'payload' ? (
        <PayloadTab
          loadingDetail={loadingDetail}
          payload={detail?.payload ?? effectiveEvent.payload ?? {}}
          sourceHeaders={detail?.sourceHeaders ?? effectiveEvent.sourceHeaders}
        />
      ) : null}

      {activeTab === 'response' ? (
        <ResponseTab loadingDetail={loadingDetail} latestAttempt={latestAttempt} />
      ) : null}

      {replayError ? <p className="text-red-400 text-xs">{replayError}</p> : null}
    </div>
  )

  if (isMobile) {
    return (
      <>
        <BottomSheet onClose={onClose} open={open} title="Event details">
          {body}
        </BottomSheet>

        <BottomSheet onClose={() => setShowReplayConfirm(false)} open={showReplayConfirm} title="Replay this event?">
          <p className="text-sm text-zinc-300 leading-relaxed">
            This event was already delivered to <span className="text-white font-medium">{endpointName}</span>. Replaying it will send the same payload again.
          </p>

          <div className="bg-amber-500/8 border border-amber-500/25 rounded-lg p-4 mt-4 flex gap-3">
            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-zinc-300">
              Your automation may process this event twice, potentially creating duplicate records, charges, or emails.
            </p>
          </div>

          {plan === 'free' ? (
            <div className="bg-red-500/6 border border-red-500/25 rounded-lg p-3 mt-3">
              <p className="text-sm text-zinc-300">
                This will use 1 of your {Math.max(0, PLANS.free.maxReplays - effectiveEvent.replayCount)} remaining free replays for this event.
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex gap-2">
            <button
              className="h-11 flex-1 rounded-lg bg-zinc-700 text-sm text-white"
              onClick={() => setShowReplayConfirm(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="h-11 flex-1 rounded-lg bg-zinc-600 text-sm font-bold text-white inline-flex items-center justify-center gap-1.5"
              disabled={replayLoading}
              onClick={() => {
                void handleReplayConfirm()
              }}
              type="button"
            >
              {replayLoading ? <Loader2 size={14} className="animate-spin" /> : null}
              Replay anyway
            </button>
          </div>
        </BottomSheet>
      </>
    )
  }

  return (
    <>
      <SlideOver onClose={onClose} open={open} title="Event details">
        {body}
      </SlideOver>

      <ConfirmModal
        cancelLabel="Cancel"
        confirmLabel={replayLoading ? 'Replaying...' : 'Replay anyway'}
        onClose={() => setShowReplayConfirm(false)}
        onConfirm={() => {
          void handleReplayConfirm()
        }}
        open={showReplayConfirm}
        title="Replay this event?"
        description={`This event was already delivered to ${endpointName}. Replaying it will send the same payload again.`}
      >
        <div className="bg-amber-500/8 border border-amber-500/25 rounded-lg p-4 mt-1 flex gap-3">
          <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-300">
            Your automation may process this event twice, potentially creating duplicate records, charges, or emails.
          </p>
        </div>
        {plan === 'free' ? (
          <div className="bg-red-500/6 border border-red-500/25 rounded-lg p-3 mt-3">
            <p className="text-sm text-zinc-300">
              This will use 1 of your {Math.max(0, PLANS.free.maxReplays - effectiveEvent.replayCount)} remaining free replays for this event.
            </p>
          </div>
        ) : null}
      </ConfirmModal>
    </>
  )
}

function OverviewTab({
  event,
  endpointName,
  destination,
  attempts,
  fallbackDeliveries,
  statusLabel,
  plan,
  replayLoading,
  onReplay,
}: {
  event: EventResponse
  endpointName: string
  destination: string
  attempts: EventResponse['eventAttempts']
  fallbackDeliveries: NonNullable<EventResponse['deliveries']>
  statusLabel: string
  plan: 'free' | 'starter'
  replayLoading: boolean
  onReplay: () => void
}) {
  const payloadBytes = formatBytes(event.payloadSize)
  const responseTime = estimateResponseTime(event.receivedAt, attempts[attempts.length - 1]?.createdAt)
  const isDelivered = statusLabel === 'Delivered'

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-zinc-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-xs">{statusLabel}</span>
          <span className="text-xs text-zinc-500">{new Date(event.receivedAt).toLocaleString()}</span>
          <span className="rounded-full border border-white/10 bg-black/35 px-2 py-0.5 text-xs text-zinc-300">replays: {event.replayCount}</span>
        </div>
      </div>

      {isDelivered ? (
        <div>
          <button
            className="px-3 py-1.5 rounded-lg bg-zinc-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
            disabled={replayLoading}
            onClick={onReplay}
            type="button"
          >
            {replayLoading ? <Loader2 size={14} className="animate-spin" /> : null}
            Replay
          </button>
          {plan === 'free' ? (
            <p className="mt-2 text-xs text-zinc-500">Free replays remaining: {Math.max(0, PLANS.free.maxReplays - event.replayCount)}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-white/10 bg-black/25 p-3 text-sm sm:grid-cols-2">
        <MetaItem label="Endpoint" value={endpointName} />
        <MetaItem label="Destination" value={destination} />
        <MetaItem label="Payload size" value={payloadBytes} />
        <MetaItem label="Attempts" value={String(event.attempts)} />
        <MetaItem label="Response time" value={responseTime} />
      </div>

      <div className="rounded-xl border border-white/10 bg-black/25 p-3">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Delivery timeline</p>
        {attempts.length > 0 ? (
          <ul className="mt-2 space-y-2 text-xs text-zinc-300">
            {attempts.map((attempt) => (
              <li className="flex flex-wrap items-center gap-2" key={attempt.id}>
                <span className="rounded bg-black/45 px-1.5 py-0.5">Attempt {attempt.attempt}</span>
                <span>{new Date(attempt.createdAt).toLocaleTimeString()}</span>
                <span className={attempt.status !== null && attempt.status >= 400 ? 'text-red-300' : 'text-emerald-300'}>
                  {attempt.status ? `HTTP ${attempt.status}` : 'No status'}
                </span>
                {attempt.error ? <span className="truncate text-red-300">{attempt.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : fallbackDeliveries.length > 0 ? (
          <ul className="mt-2 space-y-2 text-xs text-zinc-300">
            {fallbackDeliveries.map((delivery) => (
              <li className="flex flex-wrap items-center gap-2" key={delivery.id}>
                <span className="rounded bg-black/45 px-1.5 py-0.5">Attempt {delivery.attempt}</span>
                <span>{new Date(delivery.attemptedAt).toLocaleTimeString()}</span>
                <span className={delivery.statusCode !== null && delivery.statusCode >= 400 ? 'text-red-300' : 'text-emerald-300'}>
                  {delivery.statusCode ? `HTTP ${delivery.statusCode}` : delivery.status}
                </span>
                {delivery.error ? <span className="truncate text-red-300">{delivery.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">No delivery attempts recorded yet.</p>
        )}
      </div>
    </div>
  )
}

function PayloadTab({
  loadingDetail,
  payload,
  sourceHeaders,
}: {
  loadingDetail: boolean
  payload: unknown
  sourceHeaders: Record<string, string> | null | undefined
}) {
  const [expanded, setExpanded] = useState(true)
  const payloadText = JSON.stringify(payload ?? {}, null, 2)

  return (
    <div className="space-y-3">
      {loadingDetail ? <p className="text-xs text-zinc-500">Loading payload...</p> : null}
      <div className="flex items-center gap-2">
        <button
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-black/50"
          onClick={() => {
            void navigator.clipboard.writeText(payloadText)
          }}
          type="button"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy JSON
        </button>
        <button
          className="rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-black/50"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {expanded ? (
        <div className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-black/45 p-3 text-xs text-zinc-200">
          <JsonViewer value={payload ?? {}} />
        </div>
      ) : null}

      <details className="rounded-lg border border-white/10 bg-black/25 p-3" open>
        <summary className="cursor-pointer text-xs text-zinc-300">Source headers</summary>
        {sourceHeaders ? (
          <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-white/10 bg-black/45 p-2 text-xs text-zinc-200">
            {JSON.stringify(sourceHeaders, null, 2)}
          </pre>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">No headers captured.</p>
        )}
      </details>
    </div>
  )
}

function ResponseTab({
  loadingDetail,
  latestAttempt,
}: {
  loadingDetail: boolean
  latestAttempt: EventResponse['eventAttempts'][number] | null
}) {
  const body = latestAttempt?.responseBody ?? latestAttempt?.error ?? null
  const status = latestAttempt?.status ?? null

  return (
    <div className="space-y-3">
      {loadingDetail ? <p className="text-xs text-zinc-500">Loading response...</p> : null}

      <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-zinc-200">
        <p className="text-xs uppercase tracking-wider text-zinc-500">Latest attempt</p>
        <p className="mt-1 text-sm text-zinc-100">Status: {status ?? 'No status'}</p>
        <p className="mt-1 text-xs text-zinc-400">{statusHelperText(status)}</p>
      </div>

      {body ? (
        <pre className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-black/45 p-3 text-xs text-zinc-200">
          {formatResponseBody(body)}
        </pre>
      ) : (
        <p className="text-xs text-zinc-500">No response body recorded for the latest attempt.</p>
      )}
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 break-all text-sm text-zinc-100">{value}</p>
    </div>
  )
}

function resolveVisualState(event: { status: string; lastAttemptStatus: number | null }) {
  if (event.status === 'DELIVERING') return 'IN_PROGRESS'
  if (event.status === 'PENDING') return 'IN_PROGRESS'
  if (event.lastAttemptStatus === 200) return 'DELIVERED'
  if (event.lastAttemptStatus !== null && event.lastAttemptStatus >= 400) return 'FAILED'
  return 'IN_PROGRESS'
}

function readableStatus(state: 'IN_PROGRESS' | 'FAILED' | 'DELIVERED') {
  if (state === 'FAILED') return 'Failed'
  if (state === 'IN_PROGRESS') return 'In progress'
  return 'Delivered'
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '0 KB'
  const kb = bytes / 1024
  return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`
}

function estimateResponseTime(receivedAt: string, latestAttemptAt?: string) {
  if (!latestAttemptAt) return 'Pending'
  const delta = Math.max(0, new Date(latestAttemptAt).getTime() - new Date(receivedAt).getTime())
  if (delta < 1000) return `${delta} ms`
  return `${(delta / 1000).toFixed(1)} s`
}

function statusHelperText(status: number | null) {
  if (status === null) return 'Still waiting for a destination response.'
  if (status >= 500) return 'Destination server error. Check destination logs and retry later.'
  if (status >= 400) return 'Destination rejected the request. Validate auth and payload format.'
  if (status >= 200 && status < 300) return 'Successful destination response.'
  return 'Timeout or network issue can appear with empty response bodies.'
}

function formatResponseBody(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
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
