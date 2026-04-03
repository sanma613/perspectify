'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Edit3, Eye, EyeOff, Loader2, MoreVertical, RotateCcw, Trash2 } from 'lucide-react'
import type { EndpointResponse } from '../../../../lib/api-types'
import { derivePlanCapabilities } from '../../../../lib/capabilities'
import { getAccessToken } from '../../../../lib/access-token'
import { ApiError, apiFetch, getApiBaseUrl } from '../../../../lib/http'
import { useDashboardData } from '../../../../lib/use-dashboard-data'
import { useMobile } from '../../../../lib/hooks/use-mobile'
import { CreateEndpointForm } from '../_components/create-endpoint-form'
import { BottomSheet } from '../_components/ui/bottom-sheet'
import { ConfirmModal } from '../_components/ui/confirm-modal'
import { EmptyState } from '../_components/ui/empty-state'
import { UpgradeGate } from '../_components/ui/upgrade-gate'
import { WebhookUrl } from '../_components/ui/webhook-url'
import { z } from 'zod'

const editNameSchema = z.string().trim().min(1, 'Name is required.').max(60, 'Name must be 60 characters or less.')
const editSecretSchema = z.string().trim().startsWith('whsec_', 'Secret must start with whsec_.')

type UpdateEndpointResponse =
  | { changed: false }
  | {
      changed: true
      endpoint: {
        id: string
        name: string
        destination: string
      }
    }

export default function EndpointsPage() {
  const isMobile = useMobile()
  const { me, endpoints, loading, error, refresh } = useDashboardData()

  const [showCreate, setShowCreate] = useState(false)
  const [endpointRows, setEndpointRows] = useState<EndpointResponse[]>([])
  const [editingEndpointId, setEditingEndpointId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editOriginalName, setEditOriginalName] = useState('')
  const [editSecret, setEditSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [editNameError, setEditNameError] = useState<string | null>(null)
  const [editSecretError, setEditSecretError] = useState<string | null>(null)
  const [editGlobalError, setEditGlobalError] = useState<string | null>(null)
  const [editSaveState, setEditSaveState] = useState<'idle' | 'saving' | 'saved' | 'up-to-date'>('idle')
  const [rotateId, setRotateId] = useState<string | null>(null)
  const [deleteEndpoint, setDeleteEndpoint] = useState<EndpointResponse | null>(null)
  const [deleteEventCount, setDeleteEventCount] = useState<number | null>(null)
  const [deleteCountLoading, setDeleteCountLoading] = useState(false)
  const [deleteConfirmed, setDeleteConfirmed] = useState(false)
  const [deleteInProgress, setDeleteInProgress] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [removingEndpointIds, setRemovingEndpointIds] = useState<string[]>([])
  const [pendingTokenUrl, setPendingTokenUrl] = useState<string | null>(null)
  const [pendingTokenNote, setPendingTokenNote] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [mobileActionsEndpoint, setMobileActionsEndpoint] = useState<EndpointResponse | null>(null)
  const editCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const createCardRef = useRef<HTMLElement>(null)
  const createButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setEndpointRows(endpoints)
  }, [endpoints])

  useEffect(() => {
    if (!editingEndpointId) {
      setEditNameError(null)
      setEditSecretError(null)
      return
    }

    const timer = setTimeout(() => {
      const nameResult = editNameSchema.safeParse(editName)
      setEditNameError(nameResult.success ? null : nameResult.error.issues[0]?.message ?? 'Invalid name.')

      const normalizedSecret = editSecret.trim()
      if (!normalizedSecret) {
        setEditSecretError(null)
        return
      }

      const secretResult = editSecretSchema.safeParse(editSecret)
      setEditSecretError(secretResult.success ? null : secretResult.error.issues[0]?.message ?? 'Invalid secret.')
    }, 300)

    return () => clearTimeout(timer)
  }, [editingEndpointId, editName, editSecret])

  useEffect(() => {
    return () => {
      if (editCloseTimeoutRef.current) {
        clearTimeout(editCloseTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!showCreate || isMobile) return

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!target || !(target instanceof Node)) return
      if (createCardRef.current?.contains(target)) return
      if (createButtonRef.current?.contains(target)) return
      setShowCreate(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
    }
  }, [showCreate, isMobile])

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-[#111111]" />
  }

  if (error || !me) {
    return <p className="text-sm text-[#ef4444]">{error ?? 'Could not load endpoints.'}</p>
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
      setPendingTokenNote('Do not forget to update this URL in Stripe to avoid missing events.')
      setRotateId(null)
      await refresh()
    } catch (rotateError) {
      setErrorMessage(rotateError instanceof Error ? rotateError.message : 'Could not rotate token.')
    }
  }

  function closeDeleteConfirmation() {
    if (deleteInProgress) return
    setDeleteEndpoint(null)
    setDeleteEventCount(null)
    setDeleteCountLoading(false)
    setDeleteConfirmed(false)
    setDeleteError(null)
  }

  async function openDeleteConfirmation(endpoint: EndpointResponse) {
    setDeleteEndpoint(endpoint)
    setDeleteEventCount(null)
    setDeleteCountLoading(true)
    setDeleteConfirmed(false)
    setDeleteError(null)

    try {
      const token = await getAccessToken()
      const result = await apiFetch<{ count: number }>(
        `/events?endpointId=${encodeURIComponent(endpoint.id)}&count=true`,
        token
      )
      setDeleteEventCount(result.count)
    } catch {
      setDeleteError('Something went wrong. Try again.')
      setDeleteEventCount(0)
    } finally {
      setDeleteCountLoading(false)
    }
  }

  async function confirmDelete() {
    if (!deleteEndpoint || !deleteConfirmed || deleteInProgress) return

    const endpointId = deleteEndpoint.id
    setDeleteInProgress(true)
    setDeleteError(null)

    try {
      const token = await getAccessToken()
      await apiFetch(`/endpoints/${endpointId}`, token, { method: 'DELETE' })

      setDeleteEndpoint(null)
      setDeleteEventCount(null)
      setDeleteCountLoading(false)
      setDeleteConfirmed(false)
      setDeleteError(null)

      setRemovingEndpointIds((previous) => [...previous, endpointId])

      window.setTimeout(() => {
        setEndpointRows((previous) => previous.filter((endpoint) => endpoint.id !== endpointId))
        setRemovingEndpointIds((previous) => previous.filter((id) => id !== endpointId))
      }, 200)

      if (editingEndpointId === endpointId) {
        resetEditState()
      }

      await refresh()
    } catch {
      setDeleteError('Something went wrong. Try again.')
    }
    setDeleteInProgress(false)
  }

  function resetEditState() {
    if (editCloseTimeoutRef.current) {
      clearTimeout(editCloseTimeoutRef.current)
      editCloseTimeoutRef.current = null
    }
    setEditingEndpointId(null)
    setEditName('')
    setEditOriginalName('')
    setEditSecret('')
    setShowSecret(false)
    setEditNameError(null)
    setEditSecretError(null)
    setEditGlobalError(null)
    setEditSaveState('idle')
  }

  function openEdit(endpoint: EndpointResponse) {
    if (editCloseTimeoutRef.current) {
      clearTimeout(editCloseTimeoutRef.current)
      editCloseTimeoutRef.current = null
    }
    setEditingEndpointId(endpoint.id)
    setEditName(endpoint.name)
    setEditOriginalName(endpoint.name)
    setEditSecret('')
    setShowSecret(false)
    setEditNameError(null)
    setEditSecretError(null)
    setEditGlobalError(null)
    setEditSaveState('idle')
  }

  const normalizedEditName = editName.trim()
  const normalizedOriginalName = editOriginalName.trim()
  const normalizedEditSecret = editSecret.trim()
  const editingEndpoint = editingEndpointId
    ? endpointRows.find((endpoint) => endpoint.id === editingEndpointId) ?? null
    : null
  const isNameChanged = Boolean(editingEndpointId) && normalizedEditName !== normalizedOriginalName
  const hasSecretValue = normalizedEditSecret.length > 0
  const hasEditErrors = Boolean(editNameError || editSecretError)
  const canSaveEdit =
    Boolean(editingEndpointId) &&
    editSaveState !== 'saving' &&
    !hasEditErrors &&
    (isNameChanged || hasSecretValue)

  async function saveEdit() {
    if (!editingEndpointId || !canSaveEdit) return

    setEditGlobalError(null)
    setEditSaveState('saving')

    try {
      const token = await getAccessToken()
      const payload: { name?: string; secret?: string } = {}

      if (isNameChanged) payload.name = normalizedEditName
      if (hasSecretValue) payload.secret = normalizedEditSecret

      const result = await apiFetch<UpdateEndpointResponse>(`/endpoints/${editingEndpointId}`, token, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })

      if (!result.changed) {
        setEditSaveState('up-to-date')
      } else {
        setEditSaveState('saved')
        setEndpointRows((previous) =>
          previous.map((endpoint) =>
            endpoint.id === editingEndpointId
              ? {
                  ...endpoint,
                  name: payload.name ?? endpoint.name,
                }
              : endpoint
          )
        )
      }

      editCloseTimeoutRef.current = setTimeout(() => {
        resetEditState()
      }, 1500)

      await refresh()
    } catch (saveError) {
      setEditSaveState('idle')

      if (saveError instanceof ApiError) {
        if (saveError.status === 409 && saveError.field === 'name') {
          setEditNameError('You already have an endpoint with this name')
          return
        }

        if (saveError.status === 400) {
          setEditSecretError('Invalid secret format')
          return
        }
      }

      setEditGlobalError(saveError instanceof Error ? saveError.message : 'Could not update endpoint.')
    }
  }

  function renderEditForm(endpoint: EndpointResponse) {
    const hasValidSecret = hasSecretValue && !editSecretError
    const secretBorderClass = editSecretError ? 'border-red-500/70' : hasValidSecret ? 'border-emerald-500/70' : 'border-white/10'

    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-white/10 bg-black/30 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-[#a1a1aa]">Destination</p>
          <p className="mt-1 break-all text-sm text-white">{endpoint.destination}</p>
          <p className="mt-1 text-xs text-[#a1a1aa]">Wrong destination? Delete this endpoint and create a new one.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-[#a1a1aa]">Name</label>
          <input
            className={`h-11 w-full rounded-lg border bg-white/5 px-3 text-sm text-white placeholder:text-[#71717a] ${
              editNameError ? 'border-red-500/70' : 'border-white/10'
            }`}
            onChange={(event) => {
              setEditName(event.target.value)
              setEditGlobalError(null)
              if (editSaveState !== 'idle') setEditSaveState('idle')
            }}
            placeholder="Endpoint name"
            value={editName}
          />
          {editNameError ? <p className="mt-1 text-xs text-red-400">{editNameError}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-[#a1a1aa]">Secret (optional)</label>
          <div className="relative">
            <input
              className={`h-11 w-full rounded-lg border bg-white/5 px-3 pr-10 text-sm text-white placeholder:text-[#71717a] ${secretBorderClass}`}
              onChange={(event) => {
                setEditSecret(event.target.value)
                setEditGlobalError(null)
                if (editSaveState !== 'idle') setEditSaveState('idle')
              }}
              placeholder="whsec_..."
              type={showSecret ? 'text' : 'password'}
              value={editSecret}
            />
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"
              onClick={() => setShowSecret((previous) => !previous)}
              tabIndex={-1}
              type="button"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-[#a1a1aa]">Only change this after rotating the token in Stripe.</p>
          {editSecretError ? <p className="mt-1 text-xs text-red-400">{editSecretError}</p> : null}
        </div>

        {editGlobalError ? <p className="text-sm text-[#ef4444]">{editGlobalError}</p> : null}

        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-11 items-center rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSaveEdit}
            onClick={() => {
              void saveEdit()
            }}
            type="button"
          >
            {editSaveState === 'saving'
              ? 'Saving...'
              : editSaveState === 'saved'
                ? 'Saved ✓'
                : editSaveState === 'up-to-date'
                  ? 'Already up to date'
                  : 'Save'}
          </button>
          <button
            className="inline-flex h-11 items-center rounded-lg border border-white/10 bg-transparent px-3 text-sm text-zinc-500"
            onClick={resetEditState}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  function renderDeleteConfirmationContent() {
    const countLabel = deleteCountLoading ? '...' : String(deleteEventCount ?? 0)

    return (
      <div>
        <h2 className="font-display text-[18px] font-bold text-white">Delete this endpoint?</h2>

        <p className="mt-3 font-sans text-[14px] leading-relaxed text-zinc-300">
          This will permanently delete <span className="font-medium text-white">{deleteEndpoint?.name}</span> and all{' '}
          <span className="font-medium text-red-400">{countLabel}</span> associated events. This cannot be undone.
        </p>

        <div className="mt-4 flex gap-3 rounded-lg border border-red-500/25 bg-red-500/8 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="font-sans text-[13px] text-zinc-300">
            Your Stripe webhook pointing to this URL will stop working immediately. Go to Stripe and update or disable
            it to avoid losing future payments.
          </p>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            checked={deleteConfirmed}
            className="mt-0.5 accent-green-500"
            onChange={(event) => setDeleteConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span className="text-sm text-zinc-400">
            I understand this will delete all event history and cannot be recovered
          </span>
        </label>

        <div className="mt-6 flex gap-3">
          <button
            className="flex-1 rounded-xl bg-zinc-700 py-3 text-white"
            disabled={deleteInProgress}
            onClick={closeDeleteConfirmation}
            type="button"
          >
            Cancel
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-3 font-display text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!deleteConfirmed || deleteInProgress}
            onClick={() => {
              void confirmDelete()
            }}
            type="button"
          >
            {deleteInProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Delete endpoint
          </button>
        </div>

        {deleteError ? <p className="mt-3 text-sm text-red-400">{deleteError}</p> : null}
      </div>
    )
  }

  const endpointLimitUsage = endpointRows.length
  const capabilities = derivePlanCapabilities({
    plan: me.plan,
    limits: me.limits,
    endpointCount: endpointRows.length,
  })

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
            ref={createButtonRef}
            className="inline-flex h-11 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white"
            onClick={(event) => {
              event.stopPropagation()
              setShowCreate(true)
            }}
            type="button"
          >
            + New endpoint
          </button>
        </UpgradeGate>
      </header>

      {errorMessage ? <p className="text-sm text-[#ef4444]">{errorMessage}</p> : null}
      {pendingTokenUrl ? <WebhookUrl note={pendingTokenNote ?? undefined} url={pendingTokenUrl} /> : null}

      {showCreate && !isMobile ? (
        <article className="rounded-xl border border-white/10 bg-[#111111] p-4" ref={createCardRef}>
          <CreateEndpointForm
            capabilities={capabilities}
            isCapabilitiesPending={loading}
            onClose={() => setShowCreate(false)}
            showInlineClose
            onCreated={async () => {
              setPendingTokenUrl(null)
              setPendingTokenNote(null)
              setErrorMessage(null)
              await refresh()
            }}
          />
        </article>
      ) : null}

      {endpointRows.length === 0 ? (
        <EmptyState description="Create your first endpoint to start routing deliveries." title="No endpoints yet" />
      ) : (
        <div className="space-y-3">
          {endpointRows.map((endpoint) => (
            <article
              className={`rounded-xl border border-white/10 bg-[#111111] p-4 transition-opacity duration-200 ${
                removingEndpointIds.includes(endpoint.id) ? 'opacity-0' : 'opacity-100'
              }`}
              key={endpoint.id}
            >
              {!isMobile && editingEndpointId === endpoint.id ? (
                renderEditForm(endpoint)
              ) : (
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
                        onClick={() => openEdit(endpoint)}
                        type="button"
                      >
                        <Edit3 className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        className="inline-flex h-11 items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/20 px-3 text-sm text-white"
                        onClick={() => {
                          void openDeleteConfirmation(endpoint)
                        }}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <BottomSheet onClose={() => setShowCreate(false)} open={showCreate && isMobile} title="New endpoint">
        {showCreate && isMobile ? (
          <CreateEndpointForm
            capabilities={capabilities}
            isCapabilitiesPending={loading}
            onClose={() => setShowCreate(false)}
            showInlineClose={false}
            onCreated={async () => {
              setPendingTokenUrl(null)
              setPendingTokenNote(null)
              setErrorMessage(null)
              await refresh()
            }}
          />
        ) : null}
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
              onClick={() => {
                openEdit(mobileActionsEndpoint)
                setMobileActionsEndpoint(null)
              }}
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
                void openDeleteConfirmation(mobileActionsEndpoint)
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

      <BottomSheet
        onClose={resetEditState}
        open={Boolean(editingEndpointId && isMobile)}
        title={editingEndpoint?.name ?? 'Edit endpoint'}
      >
        {editingEndpoint && isMobile ? renderEditForm(editingEndpoint) : null}
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

      <BottomSheet
        onClose={closeDeleteConfirmation}
        open={Boolean(deleteEndpoint && isMobile)}
        title="Delete endpoint"
      >
        {deleteEndpoint && isMobile ? renderDeleteConfirmationContent() : null}
      </BottomSheet>

      {!isMobile ? (
        <>
          <button
            aria-hidden={!deleteEndpoint}
            aria-label="Close modal"
            className={`fixed inset-0 z-40 bg-black/70 transition-opacity duration-200 ease-in-out ${deleteEndpoint ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            onClick={closeDeleteConfirmation}
            type="button"
          />
          <section
            aria-hidden={!deleteEndpoint}
            className={`fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-[#111111] p-5 transition-all duration-200 ease-in-out ${deleteEndpoint ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            {deleteEndpoint ? renderDeleteConfirmationContent() : null}
          </section>
        </>
      ) : null}
    </section>
  )
}
