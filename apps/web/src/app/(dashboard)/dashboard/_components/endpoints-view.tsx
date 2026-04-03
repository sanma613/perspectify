'use client'

import { useState } from 'react'
import { Edit3, Link2, RotateCcw, Trash2 } from 'lucide-react'
import { derivePlanCapabilities } from '../../../../lib/capabilities'
import { useDashboardData } from '../../../../lib/use-dashboard-data'
import { CreateEndpointForm } from './create-endpoint-form'
import { ActionModal } from './action-modal'
import { FlashMessage } from './flash-message'
import { CopyToClipboard } from './copyToClipboard'
import { getAccessToken } from '../../../../lib/access-token'
import { apiFetch, getApiBaseUrl } from '../../../../lib/http'

export function EndpointsView() {
  const { me, endpoints, loading, error, refresh } = useDashboardData()
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDestination, setEditDestination] = useState('')
  const [editSecret, setEditSecret] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [rotatingId, setRotatingId] = useState<string | null>(null)
  const [copyModalUrl, setCopyModalUrl] = useState<string | null>(null)
  const [copyModalTokenHash, setCopyModalTokenHash] = useState<string | null>(null)
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false)
  const [isUpgradePlanModalOpen, setIsUpgradePlanModalOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(true)

  function maskTokenHash(value: string) {
    if (value.length <= 8) return value
    return `${value.slice(0, 4)}...${value.slice(-4)}`
  }

  const maskedCopyModalUrl =
    copyModalUrl && copyModalTokenHash
      ? copyModalUrl.replace(copyModalTokenHash, maskTokenHash(copyModalTokenHash))
      : copyModalUrl

  function openCopyModal(webhookUrl: string, tokenHash: string) {
    setCopyModalUrl(webhookUrl)
    setCopyModalTokenHash(tokenHash)
    setIsCopyModalOpen(true)
  }

  if (!me && loading) {
    return (
      <div className="grid min-h-[68vh] place-items-center md:h-full md:min-h-full">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-emerald-300" />
      </div>
    )
  }
  if (error || !me) return <p className="text-red-500">{error ?? 'Could not load endpoints.'}</p>

  const capabilities = derivePlanCapabilities({
    plan: me.plan,
    limits: me.limits,
    endpointCount: endpoints.length,
  })

  const endpointBudgetTotal = capabilities.maxEndpoints === -1 ? '∞' : String(capabilities.maxEndpoints)
  const endpointCounterLabel = `${endpoints.length}/${endpointBudgetTotal}`

  async function saveEndpoint(id: string) {
    setActionError(null)
    setActionSuccess(null)
    setSavingId(id)

    try {
      const token = await getAccessToken()
      const body: { name?: string; destination?: string; secret?: string } = {}

      if (editName.trim()) body.name = editName.trim()
      if (editDestination.trim()) body.destination = editDestination.trim()
      if (editSecret.trim()) body.secret = editSecret.trim()

      await apiFetch(`/endpoints/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })

      setEditId(null)
      setEditSecret('')
      setActionSuccess('Endpoint updated successfully.')
      await refresh()
    } catch (updateError) {
      setActionError(updateError instanceof Error ? updateError.message : 'Could not update endpoint.')
    } finally {
      setSavingId(null)
    }
  }

  async function deleteEndpoint(id: string) {
    if (!window.confirm('Delete this endpoint? This action cannot be undone.')) return

    setActionError(null)
    setActionSuccess(null)
    setDeletingId(id)

    try {
      const token = await getAccessToken()
      await apiFetch(`/endpoints/${id}`, token, { method: 'DELETE' })
      setActionSuccess('Endpoint deleted successfully.')
      if (editId === id) setEditId(null)
      await refresh()
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'Could not delete endpoint.')
    } finally {
      setDeletingId(null)
    }
  }

  async function rotateToken(id: string) {
    setActionError(null)
    setActionSuccess(null)
    setRotatingId(id)

    try {
      const token = await getAccessToken()
      const rotated = await apiFetch<{ tokenHash: string }>(`/endpoints/${id}/rotate-token`, token, {
        method: 'POST',
      })

      openCopyModal(`${getApiBaseUrl()}/webhook/${rotated.tokenHash}`, rotated.tokenHash)
      setActionSuccess('New secure webhook URL generated. Copy it in Stripe now.')
      await refresh()
    } catch (rotateError) {
      setActionError(rotateError instanceof Error ? rotateError.message : 'Could not generate a new secure URL.')
    } finally {
      setRotatingId(null)
    }
  }

  function openEdit(id: string, name: string, destination: string) {
    setEditId(id)
    setEditName(name)
    setEditDestination(destination)
    setEditSecret('')
    setActionError(null)
    setActionSuccess(null)
  }

  return (
    <section className="space-y-5 border-t border-white/10 pt-4">
      <header className="px-2">
        <h2 className="inline-flex items-center gap-2 font-display text-2xl text-zinc-100 sm:text-3xl">
          <Link2 className="h-6 w-6 text-emerald-300" />
          Endpoints
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Plan:{' '}
          {me.plan === 'starter' ? (
            <span className="text-zinc-100 capitalize">{me.plan}</span>
          ) : (
            <button
              className="inline-flex items-center text-zinc-100 capitalize underline decoration-white/35 underline-offset-2 transition hover:text-white"
              onClick={() => setIsUpgradePlanModalOpen(true)}
              type="button"
            >
              {me.plan}
            </button>
          )}
          {' · '}
          Endpoints: <span className="text-zinc-100">{endpointCounterLabel}</span>
        </p>
      </header>

      <div className="grid gap-8 px-2 xl:grid-cols-[1.05fr_1.45fr]">
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          {isCreateOpen ? (
            <CreateEndpointForm
              capabilities={capabilities}
              isCapabilitiesPending={loading}
              onClose={() => setIsCreateOpen(false)}
              onCreated={async (webhookUrl, tokenHash) => {
                openCopyModal(webhookUrl, tokenHash)
                setActionSuccess('Endpoint created. Copy the secure URL in Stripe now.')
                await refresh()
              }}
            />
          ) : (
            <button
              className="inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white transition-colors hover:bg-white/10"
              onClick={() => setIsCreateOpen(true)}
              type="button"
            >
              + New endpoint
            </button>
          )}
        </aside>

        <div className="space-y-4">
          <div className="min-h-[72px] -mt-2 space-y-2">
            <FlashMessage message={actionError} onDone={() => setActionError(null)} tone="error" />
            <FlashMessage message={actionSuccess} onDone={() => setActionSuccess(null)} tone="success" />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="flex items-center justify-between gap-2 px-1 py-1">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">Active endpoints</h3>
              <span className="text-xs text-zinc-500">{endpointCounterLabel}</span>
            </div>

            <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/25">
              {loading ? (
                <EndpointsLoadingSkeleton />
              ) : (
                <ul className="divide-y divide-white/10 md:max-h-[560px] md:overflow-y-auto md:pr-4">
                  {endpoints.length === 0 ? (
                    <li className="px-5 py-5 text-sm text-zinc-400">No endpoints yet. Create your first one.</li>
                  ) : null}
                  {endpoints.map((endpoint) => (
                    <li className="group px-3 py-3 transition hover:bg-white/5" key={endpoint.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-zinc-100">{endpoint.name}</p>
                          <p className="mt-1 break-all text-sm text-zinc-400">{endpoint.destination}</p>
                        </div>
                        <p className="rounded-full border border-white/10 bg-black/35 px-2 py-0.5 text-[11px] text-zinc-500">
                          {endpoint.tokenPrefix}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <button
                          className="rounded-lg border border-white/15 bg-black/35 px-3 py-1.5 text-zinc-200 transition hover:bg-black/55"
                          onClick={() => openEdit(endpoint.id, endpoint.name, endpoint.destination)}
                          type="button"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Edit3 className="h-3.5 w-3.5" />
                            Edit
                          </span>
                        </button>
                        <button
                          className="rounded-lg border border-white/15 bg-black/35 px-3 py-1.5 text-zinc-200 transition hover:bg-black/55"
                          disabled={rotatingId === endpoint.id}
                          onClick={() => rotateToken(endpoint.id)}
                          type="button"
                        >
                          <span className="inline-flex items-center gap-1">
                            <RotateCcw className={`h-3.5 w-3.5 ${rotatingId === endpoint.id ? 'animate-spin' : ''}`} />
                            {rotatingId === endpoint.id ? 'Generating...' : 'Generate URL'}
                          </span>
                        </button>
                        <button
                          className="rounded-lg border border-red-400/45 bg-red-500/12 px-3 py-1.5 text-red-300 transition hover:bg-red-500/20"
                          disabled={deletingId === endpoint.id}
                          onClick={() => deleteEndpoint(endpoint.id)}
                          type="button"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </span>
                        </button>
                      </div>

                      {editId === endpoint.id ? (
                        <div className="mt-4 space-y-2 border-l-2 border-white/15 pl-3">
                          <input
                            className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                            onChange={(event) => setEditName(event.target.value)}
                            placeholder="Endpoint name"
                            value={editName}
                          />
                          <input
                            className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                            onChange={(event) => setEditDestination(event.target.value)}
                            placeholder="https://destination"
                            value={editDestination}
                          />
                          <input
                            className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                            onChange={(event) => setEditSecret(event.target.value)}
                            placeholder="New Stripe signing secret (optional)"
                            value={editSecret}
                          />
                          <div className="flex gap-2">
                            <button
                              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-emerald-950"
                              disabled={savingId === endpoint.id}
                              onClick={() => saveEndpoint(endpoint.id)}
                              type="button"
                            >
                              <span className="inline-flex items-center gap-1">
                                <Edit3 className="h-3.5 w-3.5" />
                                Save
                              </span>
                            </button>
                            <button
                              className="rounded-lg border border-white/15 bg-black/35 px-3 py-1.5 text-xs text-zinc-200"
                              onClick={() => setEditId(null)}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      <ActionModal
        cancelLabel="Not now"
        confirmLabel="Upgrade"
        open={isUpgradePlanModalOpen}
        title="Upgrade your plan"
        message="You can unlock more endpoint slots and higher limits by moving to a higher plan."
        onClose={() => setIsUpgradePlanModalOpen(false)}
        onConfirm={() => setIsUpgradePlanModalOpen(false)}
      />

      <ActionModal
        cancelLabel="Close"
        open={isCopyModalOpen && Boolean(copyModalUrl)}
        title="Your secure URL is ready"
        message="Paste this exact URL in Stripe Webhook Endpoint URL. After closing this modal, the URL will not be shown again."
        onClose={() => setIsCopyModalOpen(false)}
        showCloseIcon={false}
      >
        <code className="block overflow-x-auto whitespace-nowrap rounded bg-black/45 p-2 text-sm text-emerald-200">
          {maskedCopyModalUrl}
        </code>
        {copyModalUrl ? (
          <div className="mt-3 text-xs text-zinc-300">
            <CopyToClipboard
              text={copyModalUrl}
              label="Copy"
              className="inline-flex items-center gap-1 underline"
              iconClassName="h-3.5 w-3.5"
            />
          </div>
        ) : null}
      </ActionModal>
    </section>
  )
}

function EndpointsLoadingSkeleton() {
  return (
    <section className="space-y-3 -mt-2 px-2 py-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 animate-pulse" key={`endpoints-skeleton-${index}`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-2">
                <div className="h-4 w-36 rounded-full bg-white/15" />
                <div className="h-3 w-64 rounded-full bg-white/10" />
              </div>
              <div className="h-5 w-20 rounded-full border border-white/10 bg-white/10" />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="h-8 w-20 rounded-lg border border-white/10 bg-white/10" />
              <div className="h-8 w-32 rounded-lg border border-white/10 bg-white/10" />
              <div className="h-8 w-24 rounded-lg border border-white/10 bg-white/10" />
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}
