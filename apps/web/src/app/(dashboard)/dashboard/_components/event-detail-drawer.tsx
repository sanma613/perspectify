'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Copy, ExternalLink, Loader2, Zap } from 'lucide-react'
import { getAccessToken } from '../../../../lib/access-token'
import type { EventAttemptResponse, EventDetailResponse, EventResponse } from '../../../../lib/api-types'
import { apiFetch } from '../../../../lib/http'
import { useMobile } from '../../../../lib/hooks/use-mobile'
import { BottomSheet } from './ui/bottom-sheet'
import { SlideOver } from './ui/slide-over'
import { CollapsibleSection } from '../../../../components/collapsible-section'
import { HeadersTable } from '../../../../components/headers-table'
import { JsonViewer } from '../../../../components/json-viewer'
import { ResponseBody } from '../../../../components/response-body'

type DetailTab = 'overview' | 'payload' | 'response'

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

const FAILURE_CATEGORY_TITLES: Record<string, string> = {
  timeout: 'Connection Timeout (10,000ms exceeded)',
  dns_error: 'DNS Resolution Failed',
  connection_refused: 'Connection Refused',
  tls_error: 'TLS/SSL Certificate Error',
  http_4xx: 'Client Error',
  http_5xx: 'Server Error',
  http_3xx: 'Redirect (not followed)',
  unknown: 'Unknown Error',
}

export function EventDetailDrawer({
  open,
  event,
  onClose,
  onReplay,
  plan,
}: {
  open: boolean
  event: EventResponse | null
  onClose: () => void
  onReplay: (eventId: string) => Promise<void>
  plan: 'free' | 'starter'
  endpointNameFallback?: string | null
  destinationFallback?: string | null
}) {
  const isMobile = useMobile()
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [detailCache, setDetailCache] = useState<Record<string, EventDetailResponse>>({})
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [actionPending, setActionPending] = useState(false)

  const selectedId = event?.id ?? null
  const detail = selectedId ? detailCache[selectedId] : undefined
  const effectiveEvent = detail ?? event

  const attempts = useMemo(() => {
    const source = effectiveEvent?.eventAttempts ?? []
    return [...source].sort((a, b) => a.attempt - b.attempt)
  }, [effectiveEvent?.eventAttempts])

  const lastAttempt = attempts[attempts.length - 1] ?? null

  const ensureDetail = useCallback(async () => {
    if (!selectedId || detailCache[selectedId]) return
    setLoadingDetail(true)
    try {
      const token = await getAccessToken()
      const data = await apiFetch<EventDetailResponse>(`/events/${selectedId}`, token)
      setDetailCache((current) => ({ ...current, [selectedId]: data }))
    } finally {
      setLoadingDetail(false)
    }
  }, [detailCache, selectedId])

  useEffect(() => {
    if (!open) return
    setActiveTab('overview')
    void ensureDetail()
  }, [open, ensureDetail])

  if (!effectiveEvent) return null

  const content = (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-1 text-xs">
        {(['overview', 'payload', 'response'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(tab)
              if (tab !== 'overview') {
                void ensureDetail()
              }
            }}
            className={`rounded-lg px-3 py-1.5 capitalize ${activeTab === tab ? 'bg-emerald-400/20 text-emerald-100' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div>
          <div className="flex items-start justify-between p-6 pb-4">
            <div>
              <StatusBadge status={effectiveEvent.status} />
              <p className="mt-1.5 font-mono text-xs text-zinc-500">
                {new Date(effectiveEvent.receivedAt).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  fractionalSecondDigits: 3,
                })}
              </p>
              {effectiveEvent.ingestionLatencyMs !== null && effectiveEvent.ingestionLatencyMs >= 0 ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-600">
                  <Zap size={11} className="text-green-500" />
                  Received {effectiveEvent.ingestionLatencyMs}ms after Stripe sent it
                </p>
              ) : null}
            </div>

            <button
              className={`rounded-xl px-4 py-2.5 text-sm font-bold ${effectiveEvent.status === 'FAILED' ? 'bg-green-500 text-black' : 'bg-zinc-700 text-white'}`}
              disabled={actionPending}
              onClick={async () => {
                setActionPending(true)
                try {
                  await onReplay(effectiveEvent.id)
                } finally {
                  setActionPending(false)
                }
              }}
              type="button"
            >
              {actionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : effectiveEvent.status === 'FAILED' ? 'Rescue' : 'Replay'}
            </button>
          </div>

          <div className="px-6 pb-6">
            <MetadataGrid event={effectiveEvent} maxRetries={plan === 'starter' ? 7 : 3} />
            <Timeline attempts={attempts} defaultCollapsed={isMobile} />
          </div>
        </div>
      ) : null}

      {activeTab === 'payload' ? (
        <div className="px-6 pb-6">
          <div className="mb-3 flex items-center gap-2">
            <button
              className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200"
              onClick={() => {
                void navigator.clipboard.writeText(JSON.stringify(effectiveEvent.payload ?? {}, null, 2))
              }}
              type="button"
            >
              Copy JSON
            </button>
          </div>

          <div className="flex items-center gap-2 pb-3">
            <span className="text-xs text-zinc-600">Stripe event ID:</span>
            <span className="font-mono text-xs text-zinc-400">{effectiveEvent.stripeId}</span>
            <button
              className="p-1 text-zinc-600 hover:text-zinc-400"
              onClick={() => {
                void navigator.clipboard.writeText(effectiveEvent.stripeId)
              }}
              type="button"
            >
              <Copy size={12} />
            </button>
            <a
              href={`https://dashboard.stripe.com/events/${effectiveEvent.stripeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400"
            >
              View in Stripe <ExternalLink size={11} />
            </a>
          </div>

          {loadingDetail ? (
            <div className="space-y-2">
              <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-white/10" />
            </div>
          ) : (
            <div className="json-scroll max-h-[420px] overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3">
              <JsonViewer data={effectiveEvent.payload ?? {}} defaultExpanded={1} />
            </div>
          )}
        </div>
      ) : null}

      {activeTab === 'response' ? (
        <div className="px-6 pb-6">
          {effectiveEvent.status === 'FAILED' && lastAttempt?.failureCategory ? (
            <div className="mx-0 mb-2 mt-4 flex items-start gap-3 rounded-xl border border-red-500/15 bg-red-500/10 p-4">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
              <div>
                <p className="mb-1 text-sm font-medium text-zinc-200">
                  {lastAttempt.failureCategory.startsWith('http_') && lastAttempt.status
                    ? `HTTP ${lastAttempt.status} — ${FAILURE_CATEGORY_TITLES[lastAttempt.failureCategory]}`
                    : FAILURE_CATEGORY_TITLES[lastAttempt.failureCategory]}
                </p>
                <p className="text-xs leading-relaxed text-zinc-400">
                  {FAILURE_EXPLANATIONS[lastAttempt.failureCategory]}
                </p>
              </div>
            </div>
          ) : null}

          <Timeline attempts={attempts} defaultCollapsed={isMobile} />
        </div>
      ) : null}
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet onClose={onClose} open={open} title="Event details">
        {content}
      </BottomSheet>
    )
  }

  return (
    <SlideOver onClose={onClose} open={open} title="Event details">
      {content}
    </SlideOver>
  )
}

function StatusBadge({ status }: { status: EventResponse['status'] }) {
  const tone = status === 'FAILED' ? 'bg-red-500/10 text-red-400' : status === 'DELIVERED' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{status}</span>
}

function MetadataGrid({ event, maxRetries }: { event: EventResponse; maxRetries: number }) {
  const payloadSizeKb = ((event.payloadSize ?? 0) / 1024).toFixed(1)

  return (
    <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-4">
      <MetaCell label="STRIPE ID" value={event.stripeId} mono copyable />
      <MetaCell label="PERSPECTIFY ID" value={event.id} mono copyable />
      <div>
        <p className="mb-1 text-xs uppercase tracking-widest text-zinc-600">INGESTION LATENCY</p>
        <p className={`font-mono text-sm ${event.ingestionLatencyMs === null || event.ingestionLatencyMs < 0 ? 'text-zinc-600' : event.ingestionLatencyMs < 500 ? 'text-green-400' : event.ingestionLatencyMs <= 2000 ? 'text-amber-400' : 'text-red-400'}`}>
          {event.ingestionLatencyMs === null ? 'N/A' : event.ingestionLatencyMs < 0 ? 'N/A (clock skew)' : `${event.ingestionLatencyMs}ms`}
        </p>
        <p className="text-xs text-zinc-600">Stripe → Perspectify</p>
      </div>
      <MetaCell label="PAYLOAD SIZE" value={`${payloadSizeKb} KB`} mono />
      <MetaCell label="TOTAL ATTEMPTS" value={`${event.attempts} of ${maxRetries}`} mono />
      <MetaCell label="SIGNATURE" value={event.signatureValid ? 'Valid ✓' : 'Invalid ✗'} valueClass={event.signatureValid ? 'text-green-400' : 'text-red-400'} />
    </div>
  )
}

function Timeline({ attempts, defaultCollapsed }: { attempts: EventAttemptResponse[]; defaultCollapsed: boolean }) {
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
                  <span className="ml-auto font-mono text-xs tabular-nums text-zinc-600">
                    {attempt.attemptStartedAt ? new Date(attempt.attemptStartedAt).toLocaleString() : 'N/A'}
                  </span>
                </div>

                {attempt.error ? (
                  <div className="mt-2 rounded-lg border border-red-500/15 bg-red-500/10 px-3 py-2">
                    <p className="break-all font-mono text-xs text-red-400">{attempt.error}</p>
                    {attempt.status && attempt.status >= 400 ? (
                      <a
                        href={`https://developer.mozilla.org/docs/Web/HTTP/Status/${attempt.status}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-zinc-600 underline underline-offset-2 hover:text-zinc-400"
                      >
                        What is {attempt.status}?
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {attempt.failureCategory ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                    {FAILURE_EXPLANATIONS[attempt.failureCategory]}
                  </p>
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
                  <CollapsibleSection label="Response body" defaultOpen={!isSuccess && !defaultCollapsed}>
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
