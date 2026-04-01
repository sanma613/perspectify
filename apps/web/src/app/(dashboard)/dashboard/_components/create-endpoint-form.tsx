'use client'

import { useMemo, useState } from 'react'
import { Link2, ShieldCheck } from 'lucide-react'
import { endpointSchema } from '../../../../lib/validation/endpoint'
import { getAccessToken } from '../../../../lib/access-token'
import { apiFetch, getApiBaseUrl } from '../../../../lib/http'
import type { PlanCapabilities } from '../../../../lib/capabilities'
import { ActionModal } from './action-modal'
import { FlashMessage } from './flash-message'

interface CreateEndpointPayload {
  id: string
  name: string
  destination: string
  tokenPrefix: string
  tokenHash: string
}

export function CreateEndpointForm({
  capabilities,
  isCapabilitiesPending = false,
  onCreated,
}: {
  capabilities: PlanCapabilities
  isCapabilitiesPending?: boolean
  onCreated: (webhookUrl: string, tokenHash: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [showLimitHint, setShowLimitHint] = useState(false)
  const [showLimitModal, setShowLimitModal] = useState(false)

  const endpointLimitError = useMemo(() => {
    if (capabilities.canCreateEndpoint) return null
    return capabilities.endpointLimitReason ?? 'Endpoint limit reached.'
  }, [capabilities])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (isCapabilitiesPending) return

    if (endpointLimitError) {
      setShowLimitModal(true)
      return
    }

    const parsed = endpointSchema.safeParse({ name, destination, secret })
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {}
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0]
        if (typeof key === 'string') nextErrors[key] = issue.message
      })
      setFieldErrors(nextErrors)
      return
    }

    setFieldErrors({})
    setIsLoading(true)

    try {
      const token = await getAccessToken()
      const created = await apiFetch<CreateEndpointPayload>('/endpoints', token, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      })

      const webhookUrl = `${getApiBaseUrl()}/webhook/${created.tokenHash}`
      setName('')
      setDestination('')
      setSecret('')
      await onCreated(webhookUrl, created.tokenHash)
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'Could not create endpoint.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="glass-card space-y-4 rounded-3xl border border-white/10 bg-black/30 p-5 sm:p-6">
      <h3 className="inline-flex items-center gap-2 font-display text-xl text-zinc-100 sm:text-2xl">
        <Link2 className="h-5 w-5 text-emerald-300" />
        Create endpoint
      </h3>
      <form className="space-y-3" onSubmit={onSubmit}>
        <label className="block text-sm text-zinc-300">
          Name
          <input
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2.5 text-zinc-100 outline-none transition placeholder:text-zinc-500 hover:border-white/25 focus:border-emerald-400/70 focus:ring-4 focus:ring-emerald-400/18"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          {fieldErrors.name ? <span className="text-xs text-red-400">{fieldErrors.name}</span> : null}
        </label>

        <label className="block text-sm text-zinc-300">
          Destination URL
          <input
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2.5 text-zinc-100 outline-none transition placeholder:text-zinc-500 hover:border-white/25 focus:border-emerald-400/70 focus:ring-4 focus:ring-emerald-400/18"
            onChange={(event) => setDestination(event.target.value)}
            placeholder="https://hooks.zapier.com/..."
            value={destination}
          />
          {fieldErrors.destination ? (
            <span className="text-xs text-red-400">{fieldErrors.destination}</span>
          ) : null}
        </label>

        <label className="block text-sm text-zinc-300">
          Stripe webhook signing secret
          <textarea
            className="mt-1 h-24 w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2.5 font-mono text-xs text-zinc-100 outline-none transition placeholder:text-zinc-500 hover:border-white/25 focus:border-emerald-400/70 focus:ring-4 focus:ring-emerald-400/18"
            onChange={(event) => setSecret(event.target.value)}
            placeholder="whsec_..."
            value={secret}
          />
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            Use the signing secret provided by Stripe for this webhook endpoint.
          </p>
          {fieldErrors.secret ? <span className="text-xs text-red-400">{fieldErrors.secret}</span> : null}
        </label>

        <FlashMessage message={error} onDone={() => setError(null)} tone="error" />

        {isCapabilitiesPending ? (
          <div className="h-11 w-40 rounded-xl border border-white/10 bg-white/10 animate-pulse" />
        ) : (
          <button
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${endpointLimitError ? 'cursor-not-allowed border border-white/15 bg-black/35 text-zinc-500 opacity-60 hover:bg-black/45' : 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-emerald-950 shadow-[0_8px_20px_rgba(16,185,129,0.24)] hover:opacity-90'} disabled:translate-y-0 disabled:opacity-50`}
            disabled={isLoading}
            onMouseEnter={() => {
              if (endpointLimitError) setShowLimitHint(true)
            }}
            onMouseLeave={() => setShowLimitHint(false)}
            type="submit"
          >
            {isLoading ? 'Creating...' : 'Create endpoint'}
          </button>
        )}
        {endpointLimitError ? (
          <p
            aria-hidden={!showLimitHint}
            className={`text-xs text-zinc-500 transition-opacity duration-200 ${showLimitHint ? 'opacity-100' : 'opacity-0'}`}
          >
            Endpoint limit reached. Upgrade your plan to create more destinations.
          </p>
        ) : null}
      </form>

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
