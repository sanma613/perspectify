'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Eye, EyeOff, Link2, X } from 'lucide-react'
import { z } from 'zod'
import { getAccessToken } from '../../../../lib/access-token'
import { ApiError, apiFetch, getApiBaseUrl } from '../../../../lib/http'
import { handleEnterAdvance } from '../../../../lib/forms/enter-navigation'
import type { PlanCapabilities } from '../../../../lib/capabilities'
import { useDashboardData } from '../../../../lib/use-dashboard-data'
import { usePasswordVisibility } from '../../../../hooks/use-password-visibility'
import { CopyToClipboard } from './copyToClipboard'
import { ActionModal } from './action-modal'
import { FlashMessage } from './flash-message'

interface CreateEndpointPayload {
  id: string
  name: string
  destination: string
  tokenPrefix: string
  tokenHash: string
}

interface DraftEndpointState {
  id: string
  tokenHash: string
  tokenPrefix: string
}

export function CreateEndpointForm({
  capabilities,
  isCapabilitiesPending = false,
  onCreated,
  onClose,
  showInlineClose = true,
}: {
  capabilities: PlanCapabilities
  isCapabilitiesPending?: boolean
  onCreated: (webhookUrl: string, tokenHash: string) => Promise<void>
  onClose?: () => void
  showInlineClose?: boolean
}) {
  const { endpoints } = useDashboardData()

  const [step, setStep] = useState<'A' | 'B'>('A')
  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [secret, setSecret] = useState('')
  const [nameError, setNameError] = useState('')
  const [destinationError, setDestinationError] = useState('')
  const [secretError, setSecretError] = useState('')
  const [globalError, setGlobalError] = useState<string | null>(null)
  const secretVisibility = usePasswordVisibility()
  const [isLoading, setIsLoading] = useState(false)
  const [showLimitHint, setShowLimitHint] = useState(false)
  const [showLimitModal, setShowLimitModal] = useState(false)

  // Draft endpoint state to keep token stable between back/next toggles.
  const [draftEndpointId, setDraftEndpointId] = useState<string | null>(null)
  const [draftTokenHash, setDraftTokenHash] = useState('')
  const [draftTokenPrefix, setDraftTokenPrefix] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftDestination, setDraftDestination] = useState('')
  const completedRef = useRef(false)

  const nameSchema = useMemo(() => z.string().trim().min(1).max(60), [])
  const destinationSchema = useMemo(() => z.string().trim().url().startsWith('https://'), [])

  const endpointNames = useMemo(() => {
    return new Set(
      endpoints
        .filter((endpoint) => endpoint.id !== draftEndpointId)
        .map((endpoint) => endpoint.name.trim().toLowerCase())
    )
  }, [endpoints, draftEndpointId])
  const endpointDestinations = useMemo(() => {
    return new Set(
      endpoints
        .filter((endpoint) => endpoint.id !== draftEndpointId)
        .map((endpoint) => endpoint.destination.trim().toLowerCase())
    )
  }, [endpoints, draftEndpointId])

  const endpointLimitError = useMemo(() => {
    if (capabilities.canCreateEndpoint) return null
    return capabilities.endpointLimitReason ?? 'Endpoint limit reached.'
  }, [capabilities])

  const stepAReady =
    nameSchema.safeParse(name).success &&
    destinationSchema.safeParse(destination).success &&
    !nameError &&
    !destinationError

  const fullEndpointUrl = draftTokenHash ? `${getApiBaseUrl()}/webhook/${draftTokenHash}` : ''

  useEffect(() => {
    return () => {
      if (!draftEndpointId || completedRef.current) return

      void (async () => {
        try {
          const token = await getAccessToken()
          await apiFetch(`/endpoints/${draftEndpointId}`, token, { method: 'DELETE' })
        } catch {
          // Best effort cleanup on unmount.
        }
      })()
    }
  }, [draftEndpointId])

  useEffect(() => {
    if (!destination.trim()) {
      setDestinationError('')
      return
    }

    const timeoutId = window.setTimeout(() => {
      validateDestination(destination)
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [destination])

  function validateName(value: string): boolean {
    const parsed = nameSchema.safeParse(value)
    if (!parsed.success) {
      setNameError('Name must be between 1 and 60 characters')
      return false
    }

    const normalized = parsed.data.toLowerCase()
    if (endpointNames.has(normalized)) {
      setNameError('You already have an endpoint with this name')
      return false
    }

    setNameError('')
    return true
  }

  function validateDestination(value: string): boolean {
    const parsed = destinationSchema.safeParse(value)
    if (!parsed.success) {
      setDestinationError('Enter a valid https:// destination URL')
      return false
    }

    const normalized = parsed.data.toLowerCase()
    if (endpointDestinations.has(normalized)) {
      setDestinationError('You already have an endpoint with this destination')
      return false
    }

    setDestinationError('')
    return true
  }

  function resetLocalState() {
    setStep('A')
    setName('')
    setDestination('')
    setSecret('')
    if (secretVisibility.visible) secretVisibility.toggle()
    setNameError('')
    setDestinationError('')
    setSecretError('')
    setGlobalError(null)
    setDraftEndpointId(null)
    setDraftTokenHash('')
    setDraftTokenPrefix('')
    setDraftName('')
    setDraftDestination('')
    completedRef.current = false
  }

  async function cleanupDraft(silent = true) {
    if (!draftEndpointId || completedRef.current) return

    try {
      const token = await getAccessToken()
      await apiFetch(`/endpoints/${draftEndpointId}`, token, { method: 'DELETE' })
    } catch (error) {
      if (!silent) {
        setGlobalError(error instanceof Error ? error.message : 'Could not clean up draft endpoint.')
      }
    }
  }

  async function closePanel(skipCleanup = false) {
    if (!skipCleanup) {
      await cleanupDraft(true)
    }
    resetLocalState()
    onClose?.()
  }

  async function ensureDraftEndpoint(): Promise<DraftEndpointState> {
    const normalizedName = name.trim()
    const normalizedDestination = destination.trim()

    if (!normalizedName || !normalizedDestination) {
      throw new Error('Name and destination are required.')
    }

    if (
      draftEndpointId &&
      draftName.trim() === normalizedName &&
      draftDestination.trim() === normalizedDestination
    ) {
      return {
        id: draftEndpointId,
        tokenHash: draftTokenHash,
        tokenPrefix: draftTokenPrefix,
      }
    }

    // If user changed name/destination, discard previous draft and mint a new stable token.
    if (draftEndpointId) {
      await cleanupDraft(true)
      setDraftEndpointId(null)
      setDraftTokenHash('')
      setDraftTokenPrefix('')
      setDraftName('')
      setDraftDestination('')
    }

    const token = await getAccessToken()
    const draft = await apiFetch<CreateEndpointPayload>('/endpoints', token, {
      method: 'POST',
      body: JSON.stringify({
        name: normalizedName,
        destination: normalizedDestination,
      }),
    })

    setDraftEndpointId(draft.id)
    setDraftTokenHash(draft.tokenHash)
    setDraftTokenPrefix(draft.tokenPrefix)
    setDraftName(normalizedName)
    setDraftDestination(normalizedDestination)

    return {
      id: draft.id,
      tokenHash: draft.tokenHash,
      tokenPrefix: draft.tokenPrefix,
    }
  }

  async function goToStepB() {
    setGlobalError(null)

    const nameValid = validateName(name)
    const destinationValid = validateDestination(destination)
    if (!nameValid || !destinationValid) return

    if (isCapabilitiesPending) return
    if (endpointLimitError) {
      setShowLimitModal(true)
      return
    }

    setIsLoading(true)
    try {
      await ensureDraftEndpoint()
      setStep('B')
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'conflict') {
        if (error.field === 'name') setNameError(error.message)
        if (error.field === 'destination') setDestinationError(error.message)
        setStep('A')
      } else {
        setGlobalError(error instanceof Error ? error.message : 'Could not prepare endpoint.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  function goToStepA() {
    setStep('A')
  }

  async function finalizeEndpoint() {
    setGlobalError(null)

    if (!secret.trim()) {
      setSecretError('Stripe webhook secret is required')
      return
    }

    if (!secret.trim().startsWith('whsec_')) {
      setSecretError('Stripe secrets start with whsec_')
      return
    }

    if (secret.trim().slice('whsec_'.length).length < 13) {
      setSecretError('After whsec_, include at least 13 characters')
      return
    }

    setSecretError('')
    setIsLoading(true)

    try {
      const draft = await ensureDraftEndpoint()

      const token = await getAccessToken()
      await apiFetch(`/endpoints/${draft.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          secret: secret.trim(),
        }),
      })

      completedRef.current = true
      await onCreated(`${getApiBaseUrl()}/webhook/${draft.tokenHash}`, draft.tokenHash)
      await closePanel(true)
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setSecretError('Invalid secret format')
      } else {
        setGlobalError(error instanceof Error ? error.message : 'Something went wrong. Try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="glass-card space-y-4 rounded-3xl border border-white/10 bg-black/30 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 font-display text-xl text-zinc-100 sm:text-2xl">
          <Link2 className="h-5 w-5 text-emerald-300" />
          Create endpoint
        </h3>
        {showInlineClose ? (
          <button
            aria-label="Close create endpoint form"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
            onClick={() => {
              void closePanel()
            }}
            type="button"
          >
            <X size={20} />
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
          {step === 'A' ? (
            <div
              className="animate-[fade-up_200ms_ease]"
              onKeyDown={(event) => {
                handleEnterAdvance(event, {
                  onComplete: () => {
                    void goToStepB()
                  },
                  allowFormSubmit: false,
                })
              }}
            >
              <label className="block text-sm text-zinc-300">
                Name
                <input
                  className="mt-1 w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2.5 text-zinc-100 outline-none transition placeholder:text-zinc-500 hover:border-white/25 focus:border-emerald-400/70 focus:ring-4 focus:ring-emerald-400/18"
                  minLength={1}
                  onBlur={(event) => {
                    validateName(event.target.value)
                  }}
                  onChange={(event) => {
                    setName(event.target.value)
                    if (nameError) validateName(event.target.value)
                  }}
                  placeholder="Stripe → Make (production)"
                  required
                  value={name}
                />
                {nameError ? <p className="mt-1 text-xs text-red-400">{nameError}</p> : null}
              </label>

              <label className="mt-4 block text-sm text-zinc-300">
                Destination URL
                <input
                  className="mt-1 w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2.5 text-zinc-100 outline-none transition placeholder:text-zinc-500 hover:border-white/25 focus:border-emerald-400/70 focus:ring-4 focus:ring-emerald-400/18"
                  onBlur={(event) => {
                    validateDestination(event.target.value)
                  }}
                  onChange={(event) => {
                    setDestination(event.target.value)
                    if (destinationError) validateDestination(event.target.value)
                  }}
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  required
                  type="url"
                  value={destination}
                />
                {destinationError ? <p className="mt-1 text-xs text-red-400">{destinationError}</p> : null}
                <p className="mt-1 text-xs text-zinc-600">Where Perspectify will forward your Stripe events</p>
              </label>

              <div className="mt-6 flex gap-3">
                <button
                  className="rounded-xl bg-green-500 px-4 py-2.5 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-60"
                  data-enter-submit="true"
                  disabled={!name.trim() || !destination.trim() || !stepAReady || Boolean(endpointLimitError) || isLoading}
                  onClick={() => {
                    void goToStepB()
                  }}
                  onMouseEnter={() => {
                    if (endpointLimitError) setShowLimitHint(true)
                  }}
                  onMouseLeave={() => setShowLimitHint(false)}
                  type="button"
                >
                  {isLoading ? 'Preparing...' : 'Next →'}
                </button>
              </div>

              {endpointLimitError ? (
                <p
                  aria-hidden={!showLimitHint}
                  className={`mt-2 text-xs text-zinc-500 transition-opacity duration-200 ${showLimitHint ? 'opacity-100' : 'opacity-0'}`}
                >
                  Endpoint limit reached. Upgrade your plan to create more destinations.
                </p>
              ) : null}
            </div>
          ) : (
            <div
              className="animate-[fade-up_200ms_ease]"
              onKeyDown={(event) => {
                handleEnterAdvance(event, {
                  onComplete: () => {
                    void finalizeEndpoint()
                  },
                  allowFormSubmit: false,
                })
              }}
            >
              <div className="mb-5 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex h-11 items-center justify-between gap-2 rounded-xl border border-green-500/25 bg-green-500/10 px-3">
                  <span className="truncate font-mono text-sm text-green-400">
                    {`${getApiBaseUrl()}/webhook/${draftTokenPrefix}...`}
                  </span>
                  {fullEndpointUrl ? (
                    <CopyToClipboard
                      label="Copy"
                      text={fullEndpointUrl}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 px-3 text-xs text-zinc-200 hover:border-white/30 hover:text-white"
                      iconClassName="h-3.5 w-3.5"
                    />
                  ) : (
                    <span className="inline-flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs text-zinc-500">
                      Copy
                    </span>
                  )}
                </div>
                <a
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-zinc-300 transition-colors hover:border-white/20 hover:text-zinc-100"
                  href="https://dashboard.stripe.com/webhooks"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open Stripe Webhooks <ExternalLink size={16} />
                </a>
              </div>

              <label className="mb-1 block text-sm text-zinc-400">Stripe webhook secret</label>
              <div className="relative">
                <input
                  className={`h-11 w-full rounded-xl border bg-black/35 px-3 py-2.5 pr-10 font-mono text-sm text-zinc-100 outline-none transition-colors ${
                    secret && !secretError
                      ? 'border-green-500/40'
                      : secretError
                        ? 'border-red-400'
                        : 'border-white/10'
                  } focus:border-green-500/40`}
                  onChange={(event) => {
                    const nextSecret = event.target.value
                    setSecret(nextSecret)
                    if (nextSecret && !nextSecret.startsWith('whsec_')) {
                      setSecretError('Stripe secrets start with whsec_')
                    } else if (nextSecret && nextSecret.startsWith('whsec_') && nextSecret.slice('whsec_'.length).length < 13) {
                      setSecretError('After whsec_, include at least 13 characters')
                    } else {
                      setSecretError('')
                    }
                  }}
                  pattern="^whsec_.*$"
                  placeholder="whsec_..."
                  required
                  type={secretVisibility.inputType}
                  value={secret}
                />
                <button
                  aria-label={secretVisibility.visible ? 'Hide' : 'Show'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  onClick={secretVisibility.toggle}
                  tabIndex={-1}
                  type="button"
                >
                  {secretVisibility.visible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {secretError ? <p className="mt-1 text-xs text-red-400">{secretError}</p> : null}

              <div className="mt-6 flex gap-3">
                <button
                  className="text-sm 'text-zinc-500 hover:text-white'"
                  onClick={goToStepA}
                  type="button"
                >
                  ← Back
                </button>
                <button
                  className="h-11 rounded-xl bg-green-500 px-4 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-60"
                  data-enter-submit="true"
                  disabled={!secret || Boolean(secretError) || isLoading}
                  onClick={() => {
                    void finalizeEndpoint()
                  }}
                  type="button"
                >
                  {isLoading ? 'Creating...' : 'Create endpoint'}
                </button>
              </div>
            </div>
          )}

          <FlashMessage message={globalError} onDone={() => setGlobalError(null)} tone="error" />
      </div>

      <ActionModal
        cancelLabel="Upgrade Plan"
        open={showLimitModal}
        title="Endpoint limit reached"
        message="You reached your endpoint limit for this plan. Upgrade to add more destinations and avoid integration bottlenecks."
        onClose={() => setShowLimitModal(false)}
      />
    </div>
  )
}
