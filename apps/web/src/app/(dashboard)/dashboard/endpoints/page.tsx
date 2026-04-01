'use client'

import { useState } from 'react'
import { Edit3, MoreVertical, RotateCcw, Trash2 } from 'lucide-react'
import type { EndpointResponse } from '../../../../lib/api-types'
import { getAccessToken } from '../../../../lib/access-token'
import { apiFetch, getApiBaseUrl } from '../../../../lib/http'
import { useDashboardData } from '../../../../lib/use-dashboard-data'
import { useMobile } from '../../../../lib/hooks/use-mobile'
import { BottomSheet } from '../_components/ui/bottom-sheet'
import { ConfirmModal } from '../_components/ui/confirm-modal'
import { EmptyState } from '../_components/ui/empty-state'
import { UpgradeGate } from '../_components/ui/upgrade-gate'
import { WebhookUrl } from '../_components/ui/webhook-url'

export default function EndpointsPage() {
  const isMobile = useMobile()
  const { me, endpoints, loading, error, refresh } = useDashboardData()

  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('Stripe -> Make production')
  const [createDestination, setCreateDestination] = useState('')
  const [createSecret, setCreateSecret] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [rotateId, setRotateId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [pendingTokenUrl, setPendingTokenUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [mobileActionsEndpoint, setMobileActionsEndpoint] = useState<EndpointResponse | null>(null)

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-[#111111]" />
  }

  if (error || !me) {
    return <p className="text-sm text-[#ef4444]">{error ?? 'Could not load endpoints.'}</p>
  }

  async function createEndpoint() {
    setErrorMessage(null)
    setIsCreating(true)
    try {
      const token = await getAccessToken()
      const created = await apiFetch<{ tokenHash: string }>('/endpoints', token, {
        method: 'POST',
        body: JSON.stringify({
          name: createName,
          destination: createDestination,
          secret: createSecret || undefined,
        }),
      })
      setPendingTokenUrl(`${getApiBaseUrl()}/webhook/${created.tokenHash}`)
      setShowCreate(false)
      setCreateSecret('')
      await refresh()
    } catch (createError) {
      setErrorMessage(createError instanceof Error ? createError.message : 'Could not create endpoint.')
    } finally {
      setIsCreating(false)
    }
  }

  async function confirmRotate() {
    if (!rotateId) return
    setErrorMessage(null)
    try {
      const token = await getAccessToken()
      const rotated = await apiFetch<{ tokenHash: string }>(`/endpoints/${rotateId}/rotate-token`, token, {
        method: 'POST',
      })
      setPendingTokenUrl(`${getApiBaseUrl()}/webhook/${rotated.tokenHash}`)
      setRotateId(null)
      await refresh()
    } catch (rotateError) {
      setErrorMessage(rotateError instanceof Error ? rotateError.message : 'Could not rotate token.')
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    setErrorMessage(null)
    try {
      const token = await getAccessToken()
      await apiFetch(`/endpoints/${deleteId}`, token, { method: 'DELETE' })
      setDeleteId(null)
      await refresh()
    } catch (deleteError) {
      setErrorMessage(deleteError instanceof Error ? deleteError.message : 'Could not delete endpoint.')
    }
  }

  const endpointLimitUsage = endpoints.length

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-white">Endpoints</h1>
        <UpgradeGate
          currentUsage={endpointLimitUsage}
          feature="endpoint_limit"
          plan={me.plan}
          variant={isMobile ? 'bottom-sheet' : 'tooltip'}
        >
          <button
            className="inline-flex h-11 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white"
            onClick={() => setShowCreate(true)}
            type="button"
          >
            + New endpoint
          </button>
        </UpgradeGate>
      </header>

      {errorMessage ? <p className="text-sm text-[#ef4444]">{errorMessage}</p> : null}
      {pendingTokenUrl ? <WebhookUrl url={pendingTokenUrl} /> : null}

      {showCreate && !isMobile ? (
        <article className="rounded-xl border border-white/10 bg-[#111111] p-4">
          <h2 className="font-display text-sm uppercase tracking-[0.16em] text-[#a1a1aa]">New endpoint</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              className="h-11 rounded-lg border border-white/10 bg-[#1a1a1a] px-3 text-sm text-white"
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Endpoint name"
              value={createName}
            />
            <input
              className="h-11 rounded-lg border border-white/10 bg-[#1a1a1a] px-3 text-sm text-white"
              onChange={(event) => setCreateDestination(event.target.value)}
              placeholder="https://hooks.zapier.com/..."
              value={createDestination}
            />
            <input
              className="h-11 rounded-lg border border-white/10 bg-[#1a1a1a] px-3 text-sm text-white md:col-span-2"
              onChange={(event) => setCreateSecret(event.target.value)}
              placeholder="whsec_... (optional)"
              value={createSecret}
            />
          </div>
          <button
            className="mt-3 h-11 rounded-lg bg-[#22c55e] px-4 text-sm font-medium text-[#031108]"
            disabled={isCreating}
            onClick={() => {
              void createEndpoint()
            }}
            type="button"
          >
            {isCreating ? 'Creating...' : 'Create endpoint'}
          </button>
        </article>
      ) : null}

      {endpoints.length === 0 ? (
        <EmptyState description="Create your first endpoint to start routing deliveries." title="No endpoints yet" />
      ) : (
        <div className="space-y-3">
          {endpoints.map((endpoint) => (
            <article className="rounded-xl border border-white/10 bg-[#111111] p-4" key={endpoint.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg text-white">{endpoint.name}</p>
                  <p className="mt-1 text-sm text-[#a1a1aa]">● Active</p>
                  <p className="mt-1 break-all font-mono text-xs text-[#a1a1aa]">{`${getApiBaseUrl()}/webhook/${endpoint.tokenPrefix}...`}</p>
                  <p className="mt-1 truncate text-sm text-[#a1a1aa]">→ {endpoint.destination}</p>
                </div>

                {isMobile ? (
                  <button
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white"
                    onClick={() => setMobileActionsEndpoint(endpoint)}
                    type="button"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
                      onClick={() => setRotateId(endpoint.id)}
                      type="button"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Rotate
                    </button>
                    <button
                      className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
                      type="button"
                    >
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      className="inline-flex h-11 items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/20 px-3 text-sm text-white"
                      onClick={() => setDeleteId(endpoint.id)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <BottomSheet onClose={() => setShowCreate(false)} open={showCreate && isMobile} title="New endpoint">
        <div className="space-y-3">
          <input
            className="h-11 w-full rounded-lg border border-white/10 bg-[#111111] px-3 text-sm text-white"
            onChange={(event) => setCreateName(event.target.value)}
            placeholder="Stripe -> Make production"
            value={createName}
          />
          <input
            className="h-11 w-full rounded-lg border border-white/10 bg-[#111111] px-3 text-sm text-white"
            onChange={(event) => setCreateDestination(event.target.value)}
            placeholder="https://hooks.zapier.com/..."
            value={createDestination}
          />
          <input
            className="h-11 w-full rounded-lg border border-white/10 bg-[#111111] px-3 text-sm text-white"
            onChange={(event) => setCreateSecret(event.target.value)}
            placeholder="whsec_..."
            value={createSecret}
          />
          <button
            className="h-11 w-full rounded-lg bg-[#22c55e] text-sm font-medium text-[#031108]"
            disabled={isCreating}
            onClick={() => {
              void createEndpoint()
            }}
            type="button"
          >
            {isCreating ? 'Creating...' : 'Create endpoint'}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        onClose={() => setMobileActionsEndpoint(null)}
        open={Boolean(mobileActionsEndpoint)}
        title={mobileActionsEndpoint?.name ?? 'Endpoint actions'}
      >
        {mobileActionsEndpoint ? (
          <div className="space-y-2">
            <button
              className="inline-flex h-11 w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
              type="button"
            >
              <Edit3 className="h-4 w-4" />
              Edit
            </button>
            <button
              className="inline-flex h-11 w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
              onClick={() => {
                setRotateId(mobileActionsEndpoint.id)
                setMobileActionsEndpoint(null)
              }}
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
              Rotate token
            </button>
            <button
              className="inline-flex h-11 w-full items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/20 px-3 text-sm text-white"
              onClick={() => {
                setDeleteId(mobileActionsEndpoint.id)
                setMobileActionsEndpoint(null)
              }}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        ) : null}
      </BottomSheet>

      <ConfirmModal
        cancelLabel="Cancel"
        confirmLabel="Rotate"
        danger
        description="This rotates webhook token and requires updating Stripe URL."
        onClose={() => setRotateId(null)}
        onConfirm={() => {
          void confirmRotate()
        }}
        open={Boolean(rotateId)}
        title="Rotate endpoint token"
      />

      <ConfirmModal
        cancelLabel="Cancel"
        confirmLabel="Delete"
        danger
        description="This endpoint will be removed permanently."
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          void confirmDelete()
        }}
        open={Boolean(deleteId)}
        title="Delete endpoint"
      />
    </section>
  )
}
