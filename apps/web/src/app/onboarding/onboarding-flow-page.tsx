'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  Loader2,
} from 'lucide-react'
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { z } from 'zod'
import { getAccessToken } from '../../lib/access-token'
import { useMobile } from '../../lib/hooks/use-mobile'
import { apiFetch, getApiBaseUrl } from '../../lib/http'

type ToolName = 'zapier' | 'make'
type StepNumber = 1 | 2 | 3
type Direction = 'forward' | 'back'

const destinationSchema = z
  .string()
  .trim()
  .url('Please enter a valid URL starting with https://')
  .startsWith('https://', 'Please enter a valid URL starting with https://')

const stepTwoSchema = z.object({
  name: z.string().trim().min(2, 'Please add a name for your endpoint.').max(80),
  destination: destinationSchema,
  secret: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || value.startsWith('whsec_'), {
      message: 'Stripe secrets start with whsec_ - double-check this value.',
    }),
})

const saveSecretSchema = z
  .string()
  .trim()
  .min(1, 'Please enter your Stripe webhook secret.')
  .startsWith('whsec_', 'Stripe secrets start with whsec_ - double-check this value.')

const endpointSuggestions = ['Stripe -> Zapier', 'Stripe -> Make', 'Stripe -> Bubble']

interface CreatedEndpoint {
  id: string
  tokenHash: string
  webhookUrl: string
}

export function OnboardingFlowPage() {
  const router = useRouter()
  const isMobile = useMobile()

  const [step, setStep] = useState<StepNumber>(1)
  const [prevStep, setPrevStep] = useState<StepNumber | null>(null)
  const [direction, setDirection] = useState<Direction>('forward')
  const [isAnimating, setIsAnimating] = useState(false)

  const [tool, setTool] = useState<ToolName>('zapier')
  const [expandedInstruction, setExpandedInstruction] = useState(1)
  const [destination, setDestination] = useState('')
  const [destinationTouched, setDestinationTouched] = useState(false)
  const [destinationFocused, setDestinationFocused] = useState(false)
  const [debouncedDestination, setDebouncedDestination] = useState('')

  const [isDestinationEditable, setIsDestinationEditable] = useState(false)
  const [endpointName, setEndpointName] = useState('Stripe -> Make (production)')
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [stepTwoError, setStepTwoError] = useState<string | null>(null)
  const [isCreatingEndpoint, setIsCreatingEndpoint] = useState(false)
  const [createdEndpoint, setCreatedEndpoint] = useState<CreatedEndpoint | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  const [inlineSecret, setInlineSecret] = useState('')
  const [saveSecretError, setSaveSecretError] = useState<string | null>(null)
  const [isSavingSecret, setIsSavingSecret] = useState(false)
  const [secretSaved, setSecretSaved] = useState(false)

  const [containerHeight, setContainerHeight] = useState(0)
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({
    1: null,
    2: null,
    3: null,
  })

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedDestination(destination.trim())
    }, 500)

    return () => window.clearTimeout(timeout)
  }, [destination])

  useEffect(() => {
    async function guardExistingEndpoints() {
      try {
        const token = await getAccessToken()
        const endpoints = await apiFetch<Array<{ id: string }>>('/endpoints', token)
        if (endpoints.length > 0) {
          router.replace('/dashboard')
        }
      } catch {
        // Keep onboarding accessible if this guard fails.
      }
    }

    void guardExistingEndpoints()
  }, [router])

  useEffect(() => {
    const active = stepRefs.current[step]
    if (!active) return

    const observer = new ResizeObserver((entries) => {
      const nextHeight = entries[0]?.contentRect.height ?? 0
      setContainerHeight(nextHeight)
    })

    observer.observe(active)
    setContainerHeight(active.getBoundingClientRect().height)

    return () => observer.disconnect()
  }, [step, isMobile, createdEndpoint])

  const destinationResult = useMemo(() => {
    if (!destinationTouched) return null
    return destinationSchema.safeParse(debouncedDestination)
  }, [debouncedDestination, destinationTouched])

  const destinationError =
    destinationResult && !destinationResult.success
      ? destinationResult.error.issues[0]?.message ?? 'Please enter a valid URL starting with https://'
      : null

  const hasValidDestination = !!destinationResult?.success

  function transitionTo(next: StepNumber) {
    if (next === step) return
    setDirection(next > step ? 'forward' : 'back')
    setPrevStep(step)
    setStep(next)
    setIsAnimating(true)

    window.setTimeout(() => {
      setIsAnimating(false)
      setPrevStep(null)
    }, 200)
  }

  function getStepStyle(targetStep: StepNumber): CSSProperties {
    const enteringFrom = direction === 'forward' ? '100%' : '-100%'
    const leavingTo = direction === 'forward' ? '-100%' : '100%'

    if (!isAnimating) {
      if (targetStep !== step) {
        return {
          position: 'absolute',
          width: '100%',
          opacity: 0,
          pointerEvents: 'none',
          transform: 'translateX(0%)',
        }
      }

      return {
        position: 'absolute',
        width: '100%',
        opacity: 1,
        transform: 'translateX(0%)',
      }
    }

    if (targetStep === step) {
      return {
        position: 'absolute',
        width: '100%',
        opacity: 1,
        transform: 'translateX(0%)',
        transition: 'transform 200ms ease, opacity 200ms ease',
      }
    }

    if (targetStep === prevStep) {
      return {
        position: 'absolute',
        width: '100%',
        opacity: 0,
        transform: `translateX(${leavingTo})`,
        transition: 'transform 200ms ease, opacity 200ms ease',
      }
    }

    return {
      position: 'absolute',
      width: '100%',
      opacity: 0,
      transform: `translateX(${enteringFrom})`,
      pointerEvents: 'none',
    }
  }

  const setStepRef = useCallback(
    (targetStep: StepNumber) => (node: HTMLDivElement | null) => {
      stepRefs.current[targetStep] = node
    },
    []
  )

  async function handleContinueStepOne() {
    setDestinationTouched(true)
    const parsed = destinationSchema.safeParse(destination.trim())
    if (!parsed.success) return
    transitionTo(2)
  }

  async function handleCreateEndpoint() {
    setStepTwoError(null)

    const parsed = stepTwoSchema.safeParse({
      name: endpointName,
      destination,
      secret,
    })

    if (!parsed.success) {
      setStepTwoError(parsed.error.issues[0]?.message ?? 'Please check your values and try again.')
      return
    }

    setIsCreatingEndpoint(true)
    try {
      const token = await getAccessToken()
      const response = await apiFetch<{ id: string; tokenHash: string }>('/endpoints', token, {
        method: 'POST',
        body: JSON.stringify({
          name: parsed.data.name,
          destination: parsed.data.destination,
          secret: parsed.data.secret || undefined,
        }),
      })

      setCreatedEndpoint({
        id: response.id,
        tokenHash: response.tokenHash,
        webhookUrl: `${getApiBaseUrl()}/webhook/${response.tokenHash}`,
      })
      setSecretSaved(Boolean(parsed.data.secret))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong creating your endpoint.'
      if (message.toLowerCase().includes('plan endpoint limit')) {
        setStepTwoError(
          "You've reached the endpoint limit for the Free plan (1 endpoint). Go to your endpoints page to manage existing ones."
        )
      } else {
        setStepTwoError('Something went wrong creating your endpoint.')
      }
    } finally {
      setIsCreatingEndpoint(false)
    }
  }

  async function handleSaveSecret() {
    if (!createdEndpoint) return

    setSaveSecretError(null)
    const parsed = saveSecretSchema.safeParse(inlineSecret)
    if (!parsed.success) {
      setSaveSecretError(
        parsed.error.issues[0]?.message ??
          "Couldn't save the secret. You can add it later from your endpoints page."
      )
      return
    }

    setIsSavingSecret(true)
    try {
      const token = await getAccessToken()
      await apiFetch(`/endpoints/${createdEndpoint.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          secret: parsed.data,
        }),
      })
      setSecretSaved(true)
      setInlineSecret('')
    } catch {
      setSaveSecretError(
        "Couldn't save the secret. You can add it later from your endpoints page."
      )
    } finally {
      setIsSavingSecret(false)
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text)
    setIsCopied(true)
    window.setTimeout(() => setIsCopied(false), 2000)
  }

  const showInlineSecretStep = createdEndpoint && !secretSaved

  return (
    <div
      className="min-h-dvh bg-[#090909]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <header className="h-16 px-6">
        <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-between">
          <Link className="inline-flex items-center gap-2.5" href="/">
            <span className="h-2 w-2 rounded-full bg-[#22c55e] shadow-[0_0_10px_rgba(34,197,94,0.6)]" />
            <span className="font-display text-lg font-bold tracking-[-0.4px] text-white">Perspectify</span>
          </Link>
          <Link className="text-sm text-zinc-500 transition hover:text-white" href="/dashboard">
            Already set up? Go to dashboard →
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[560px] px-6 pb-24 pt-6 md:pt-10">
        <div className={`${isMobile ? '' : 'rounded-2xl border border-white/10 bg-[#111111] p-10'}`}>
          <ProgressDots step={step} />

          <div
            className="relative overflow-hidden"
            style={{
              height: containerHeight ? `${containerHeight}px` : 'auto',
              transition: 'height 200ms ease-in-out',
            }}
          >
            <div ref={setStepRef(1)} style={getStepStyle(1)}>
              <StepOne
                destination={destination}
                destinationError={destinationError}
                destinationFocused={destinationFocused}
                destinationTouched={destinationTouched}
                hasValidDestination={hasValidDestination}
                isMobile={isMobile}
                onBlurInput={() => setDestinationFocused(false)}
                onChangeDestination={(next) => {
                  setDestination(next)
                  if (!destinationTouched) setDestinationTouched(true)
                }}
                onFocusInput={() => {
                  setDestinationFocused(true)
                  if (!destinationTouched) setDestinationTouched(true)
                }}
                onToggleAccordion={(index) => setExpandedInstruction(index)}
                onToggleTool={setTool}
                tool={tool}
                expandedInstruction={expandedInstruction}
              />
            </div>

            <div ref={setStepRef(2)} style={getStepStyle(2)}>
              <StepTwo
                createdEndpoint={createdEndpoint}
                destination={destination}
                endpointName={endpointName}
                isCreatingEndpoint={isCreatingEndpoint}
                isDestinationEditable={isDestinationEditable}
                isMobile={isMobile}
                isSubmittingDisabled={!hasValidDestination || endpointName.trim().length < 2 || isCreatingEndpoint}
                isCopied={isCopied}
                onChangeEndpointName={setEndpointName}
                onChangeSecret={setSecret}
                onCopyUrl={handleCopy}
                onCreate={handleCreateEndpoint}
                onDestinationEditToggle={() => setIsDestinationEditable((value) => !value)}
                onDestinationSave={(next) => {
                  setDestination(next)
                  setIsDestinationEditable(false)
                  setDestinationTouched(true)
                }}
                onSuggestion={(value) => setEndpointName(value)}
                onTransitionNext={() => transitionTo(3)}
                secret={secret}
                showSecret={showSecret}
                stepTwoError={stepTwoError}
                setShowSecret={setShowSecret}
              />
            </div>

            <div ref={setStepRef(3)} style={getStepStyle(3)}>
              <StepThree
                createdEndpoint={createdEndpoint}
                isMobile={isMobile}
                isSavingSecret={isSavingSecret}
                onCopy={handleCopy}
                onSaveSecret={handleSaveSecret}
                saveSecretError={saveSecretError}
                secretSaved={secretSaved}
                setInlineSecret={setInlineSecret}
                inlineSecret={inlineSecret}
                showInlineSecretStep={Boolean(showInlineSecretStep)}
              />
            </div>
          </div>

          {isMobile ? (
            <div className="fixed inset-x-0 bottom-0 z-20 bg-[linear-gradient(transparent,#090909_40%)] px-6 pb-[max(env(safe-area-inset-bottom),16px)] pt-4">
              {step === 1 ? (
                <button
                  className={`h-12 w-full rounded-xl font-display text-sm font-bold ${
                    hasValidDestination
                      ? 'bg-[#22c55e] text-black'
                      : 'cursor-not-allowed bg-zinc-800 text-zinc-600'
                  }`}
                  disabled={!hasValidDestination}
                  onClick={() => {
                    void handleContinueStepOne()
                  }}
                  type="button"
                >
                  Continue →
                </button>
              ) : null}

              {step === 2 && !createdEndpoint ? (
                <button
                  className={`h-12 w-full rounded-xl font-display text-sm font-bold ${
                    hasValidDestination && endpointName.trim().length >= 2 && !isCreatingEndpoint
                      ? 'bg-[#22c55e] text-black'
                      : 'cursor-not-allowed bg-zinc-800 text-zinc-600'
                  }`}
                  disabled={!hasValidDestination || endpointName.trim().length < 2 || isCreatingEndpoint}
                  onClick={() => {
                    void handleCreateEndpoint()
                  }}
                  type="button"
                >
                  {isCreatingEndpoint ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    'Continue →'
                  )}
                </button>
              ) : null}
            </div>
          ) : null}

          {!isMobile ? (
            <div className="mt-8 flex items-center justify-between">
              <button
                className={`text-sm ${step === 1 ? 'invisible' : 'text-zinc-500 hover:text-white'}`}
                onClick={() => transitionTo((Math.max(1, step - 1) as StepNumber))}
                type="button"
              >
                ← Back
              </button>

              {step === 1 ? (
                <button
                  className={`rounded-xl px-6 py-3 font-display text-sm font-bold ${
                    hasValidDestination
                      ? 'bg-[#22c55e] text-black hover:-translate-y-px hover:opacity-90'
                      : 'cursor-not-allowed bg-zinc-800 text-zinc-600'
                  }`}
                  disabled={!hasValidDestination}
                  onClick={() => {
                    void handleContinueStepOne()
                  }}
                  type="button"
                >
                  Continue →
                </button>
              ) : null}

              {step > 1 ? <div /> : null}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function ProgressDots({ step }: { step: StepNumber }) {
  return (
    <div className="mb-10 flex items-center gap-2">
      {[1, 2, 3].map((index) => {
        const isComplete = index < step
        const isCurrent = index === step
        return (
          <div className="flex flex-1 items-center gap-2" key={index}>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 font-display text-xs font-bold ${
                isComplete
                  ? 'border-[#22c55e] bg-[#22c55e] text-black'
                  : isCurrent
                    ? 'border-[#22c55e] bg-transparent text-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.4)]'
                    : 'border-white/15 bg-transparent text-zinc-600'
              }`}
            >
              {index}
            </div>
            {index < 3 ? (
              <span
                className={`h-0.5 flex-1 ${index < step ? 'bg-[#22c55e]' : 'bg-white/10'}`}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function StepOne({
  tool,
  expandedInstruction,
  isMobile,
  destination,
  destinationError,
  destinationTouched,
  destinationFocused,
  hasValidDestination,
  onToggleTool,
  onToggleAccordion,
  onChangeDestination,
  onFocusInput,
  onBlurInput,
}: {
  tool: ToolName
  expandedInstruction: number
  isMobile: boolean
  destination: string
  destinationError: string | null
  destinationTouched: boolean
  destinationFocused: boolean
  hasValidDestination: boolean
  onToggleTool: (tool: ToolName) => void
  onToggleAccordion: (index: number) => void
  onChangeDestination: (value: string) => void
  onFocusInput: () => void
  onBlurInput: () => void
}) {
  const steps =
    tool === 'zapier'
      ? [
          'Go to zapier.com and click "Create Zap"',
          'In the Trigger step, search for "Webhooks by Zapier" and select it.',
          'Choose "Catch Hook" as the trigger event, then click "Continue".',
          'Zapier will show you a webhook URL like hooks.zapier.com/hooks/catch/... Copy it - you\'ll paste it below.',
        ]
      : [
          'Go to make.com and click "Create a new scenario"',
          'Click the "+" to add a module and search for "Webhooks". Select "Custom webhook".',
          'Click "Add" to create a new webhook. Give it a name like "Stripe via Perspectify".',
          'Make will show you a webhook URL like hook.eu1.make.com/... Copy it - you\'ll paste it below.',
        ]

  const callout =
    tool === 'zapier'
      ? "Don't click 'Test trigger' in Zapier yet. Come back here first."
      : 'Save your scenario before leaving Make - otherwise the webhook URL may not activate.'

  const hideInstructions = isMobile && (destinationFocused || hasValidDestination)

  return (
    <section>
      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Step 1 of 3</p>
      <h1 className="mt-2 font-display text-[22px] font-bold tracking-[-0.5px] text-white md:text-[28px]">
        Create a webhook in Zapier or Make
      </h1>
      <p className="mt-3 text-[15px] leading-[1.6] text-zinc-400">
        This is where your Stripe payments will be delivered.
        Perspectify will send every captured event here.
      </p>

      <div className="mt-8 grid grid-cols-2 border-b border-white/10">
        <button
          className={`pb-3 text-sm ${tool === 'zapier' ? 'border-b-2 border-[#22c55e] font-display font-medium text-white' : 'border-b-2 border-transparent text-zinc-500 hover:text-zinc-300'}`}
          onClick={() => onToggleTool('zapier')}
          type="button"
        >
          Zapier
        </button>
        <button
          className={`pb-3 text-sm ${tool === 'make' ? 'border-b-2 border-[#22c55e] font-display font-medium text-white' : 'border-b-2 border-transparent text-zinc-500 hover:text-zinc-300'}`}
          onClick={() => onToggleTool('make')}
          type="button"
        >
          Make
        </button>
      </div>

      <div
        className={`mt-6 overflow-hidden transition-[max-height,opacity] duration-200 ${
          hideInstructions ? 'max-h-0 opacity-0' : 'max-h-[720px] opacity-100'
        }`}
      >
        {isMobile ? (
          <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#1a1a1a]">
            {steps.map((line, index) => {
              const item = index + 1
              const isOpen = expandedInstruction === item
              return (
                <div key={line}>
                  <button
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                    onClick={() => onToggleAccordion(item)}
                    type="button"
                  >
                    <span className="inline-flex items-start gap-3 text-sm text-zinc-300">
                      <span className="font-display text-[13px] font-bold text-[#22c55e]">{item.toString().padStart(2, '0')}</span>
                      <span>{line}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 text-zinc-500 transition ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`px-4 transition-all ${isOpen ? 'max-h-40 pb-3 opacity-100' : 'max-h-0 overflow-hidden opacity-0'}`}>
                    <p className="pl-9 text-xs text-zinc-500">Follow this step in {tool === 'zapier' ? 'Zapier' : 'Make'} and return here.</p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-[#1a1a1a] p-6">
            <div className="space-y-4">
              {steps.map((line, index) => (
                <div className="flex items-start gap-4" key={line}>
                  <span className="w-6 shrink-0 font-display text-[13px] font-bold text-[#22c55e]">
                    {(index + 1).toString().padStart(2, '0')}
                  </span>
                  <p className="text-sm leading-[1.5] text-zinc-300">{line}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/[0.06] p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#22c55e]" />
              <p className="text-[13px] text-zinc-300">{callout}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8">
        <label className="mb-2 block text-[13px] text-zinc-400">Your Zapier or Make webhook URL</label>
        <input
          className={`w-full rounded-xl border bg-[#1a1a1a] px-4 py-3 text-sm text-white outline-none ${
            destinationError
              ? 'border-[#ef4444]'
              : hasValidDestination && destinationTouched
                ? 'border-[#22c55e]/30'
                : 'border-white/10'
          }`}
          onBlur={onBlurInput}
          onChange={(event) => onChangeDestination(event.target.value)}
          onFocus={onFocusInput}
          placeholder="https://hooks.zapier.com/hooks/catch/..."
          value={destination}
        />
        {destinationError ? (
          <p className="mt-2 text-xs text-[#ef4444]">{destinationError}</p>
        ) : null}
        <p className="mt-2 text-xs text-zinc-600">This is the URL from Zapier or Make - not a Stripe URL.</p>
      </div>
    </section>
  )
}

function StepTwo({
  destination,
  endpointName,
  secret,
  showSecret,
  isDestinationEditable,
  isSubmittingDisabled,
  isCreatingEndpoint,
  isMobile,
  stepTwoError,
  createdEndpoint,
  isCopied,
  onDestinationEditToggle,
  onDestinationSave,
  onChangeEndpointName,
  onChangeSecret,
  onSuggestion,
  onCreate,
  onTransitionNext,
  onCopyUrl,
  setShowSecret,
}: {
  destination: string
  endpointName: string
  secret: string
  showSecret: boolean
  isDestinationEditable: boolean
  isSubmittingDisabled: boolean
  isCreatingEndpoint: boolean
  isMobile: boolean
  stepTwoError: string | null
  createdEndpoint: CreatedEndpoint | null
  isCopied: boolean
  onDestinationEditToggle: () => void
  onDestinationSave: (value: string) => void
  onChangeEndpointName: (value: string) => void
  onChangeSecret: (value: string) => void
  onSuggestion: (value: string) => void
  onCreate: () => Promise<void>
  onTransitionNext: () => void
  onCopyUrl: (value: string) => Promise<void>
  setShowSecret: (value: boolean) => void
}) {
  const [draftDestination, setDraftDestination] = useState(destination)

  useEffect(() => {
    setDraftDestination(destination)
  }, [destination])

  const secretError =
    secret.trim() && !secret.trim().startsWith('whsec_')
      ? 'Stripe secrets start with whsec_ - double-check this value.'
      : null

  if (createdEndpoint) {
    return (
      <section className="text-center">
        <div className="relative mx-auto h-10 w-28 overflow-hidden">
          {[...Array.from({ length: 6 })].map((_, index) => (
            <span
              className="absolute h-2 w-1 rounded bg-[#22c55e]"
              key={index}
              style={{
                left: `${index * 16 + 6}px`,
                animation: `confetti-drop 900ms ease ${index * 80}ms infinite`,
              }}
            />
          ))}
        </div>

        <h2 className="mt-3 font-display text-[20px] font-bold text-white">Your endpoint is ready</h2>
        <p className="mt-2 text-sm text-zinc-500">Your unique Perspectify URL:</p>

        <div className="mt-4 rounded-xl border border-[#22c55e]/30 bg-[#1a1a1a] p-4 text-left">
          <p className="break-all font-mono text-sm text-[#22c55e]">{createdEndpoint.webhookUrl}</p>
          <button
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/10 px-4 py-2 font-display text-[13px] font-bold text-[#22c55e]"
            onClick={() => {
              void onCopyUrl(createdEndpoint.webhookUrl)
            }}
            type="button"
          >
            {isCopied ? 'Copied ✓' : 'Copy URL'}
          </button>
        </div>

        <p className="mt-4 text-center text-sm text-zinc-500">
          This is the URL you&apos;ll add to Stripe in the next step.
        </p>

        <button
          className="mt-6 inline-flex rounded-xl bg-[#22c55e] px-6 py-3 font-display text-sm font-bold text-black transition hover:-translate-y-px hover:opacity-90"
          onClick={onTransitionNext}
          type="button"
        >
          Continue to Stripe setup →
        </button>
      </section>
    )
  }

  return (
    <section>
      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Step 2 of 3</p>
      <h1 className="mt-2 font-display text-[22px] font-bold tracking-[-0.5px] text-white md:text-[28px]">
        Set up your Perspectify endpoint
      </h1>
      <p className="mt-3 text-[15px] leading-[1.6] text-zinc-400">
        Give it a name, confirm your destination, and paste your Stripe webhook secret.
        You&apos;ll get the secret in the next step.
      </p>

      <div className="mt-8 space-y-5">
        <div>
          <label className="mb-2 block text-[13px] text-zinc-400">Where to deliver your events</label>
          <div className="relative">
            <CheckCircle2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#22c55e]" />
            <input
              className="w-full rounded-xl border border-[#22c55e]/20 bg-[#1a1a1a] py-3 pl-9 pr-16 text-sm text-zinc-300 outline-none"
              onChange={(event) => setDraftDestination(event.target.value)}
              readOnly={!isDestinationEditable}
              value={draftDestination}
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300"
              onClick={() => {
                if (isDestinationEditable) {
                  onDestinationSave(draftDestination)
                } else {
                  onDestinationEditToggle()
                }
              }}
              type="button"
            >
              {isDestinationEditable ? 'Save' : 'Edit'}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[13px] text-zinc-400">Give this endpoint a name</label>
          <p className="mb-2 text-xs text-zinc-600">Something that helps you identify it later.</p>
          <input
            className="w-full rounded-xl border border-white/10 bg-[#1a1a1a] px-4 py-3 text-sm text-white outline-none focus:border-white/20"
            onChange={(event) => onChangeEndpointName(event.target.value)}
            placeholder="Stripe -> Make (production)"
            value={endpointName}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {endpointSuggestions.map((value) => (
              <button
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400 transition hover:border-white/15 hover:text-zinc-300"
                key={value}
                onClick={() => onSuggestion(value)}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center gap-2">
            <label className="text-[13px] text-zinc-400">Stripe webhook secret</label>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-500">Optional</span>
          </div>
          <p className="mb-2 text-xs leading-[1.5] text-zinc-600">
            You&apos;ll get this from Stripe in the next step.
            You can skip this for now and add it from your endpoints page.
          </p>
          <div className="relative">
            <input
              className="w-full rounded-xl border border-white/10 bg-[#1a1a1a] px-4 py-3 pr-20 text-sm text-white outline-none focus:border-white/20"
              onChange={(event) => onChangeSecret(event.target.value)}
              placeholder="whsec_..."
              type={showSecret ? 'text' : 'password'}
              value={secret}
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              onClick={() => setShowSecret(!showSecret)}
              type="button"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {secret.trim() && secret.trim().startsWith('whsec_') ? (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-[#22c55e]">
              <Check className="h-3.5 w-3.5" />
              Secret format looks good.
            </p>
          ) : null}
          {secretError ? <p className="mt-2 text-xs text-[#ef4444]">{secretError}</p> : null}
        </div>
      </div>

      {stepTwoError ? (
        <div className="mt-4 rounded-lg border border-[#ef4444]/25 bg-[#ef4444]/[0.08] p-4">
          <p className="text-[13px] text-zinc-300">{stepTwoError}</p>
          {stepTwoError.includes('endpoint limit') ? (
            <Link className="mt-2 inline-block text-sm text-zinc-400 underline" href="/dashboard/endpoints">
              Go to endpoints
            </Link>
          ) : null}
        </div>
      ) : null}

      {!isMobile ? (
        <div className="mt-8 flex justify-end">
          <button
            className={`rounded-xl px-6 py-3 font-display text-sm font-bold ${
              isSubmittingDisabled
                ? 'cursor-not-allowed bg-zinc-800 text-zinc-600'
                : 'bg-[#22c55e] text-black hover:-translate-y-px hover:opacity-90'
            }`}
            disabled={isSubmittingDisabled}
            onClick={() => {
              void onCreate()
            }}
            type="button"
          >
            {isCreatingEndpoint ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </span>
            ) : (
              'Continue →'
            )}
          </button>
        </div>
      ) : null}
    </section>
  )
}

function StepThree({
  createdEndpoint,
  isMobile,
  showInlineSecretStep,
  inlineSecret,
  isSavingSecret,
  saveSecretError,
  secretSaved,
  setInlineSecret,
  onSaveSecret,
  onCopy,
}: {
  createdEndpoint: CreatedEndpoint | null
  isMobile: boolean
  showInlineSecretStep: boolean
  inlineSecret: string
  isSavingSecret: boolean
  saveSecretError: string | null
  secretSaved: boolean
  setInlineSecret: (value: string) => void
  onSaveSecret: () => Promise<void>
  onCopy: (value: string) => Promise<void>
}) {
  const webhookUrl = createdEndpoint?.webhookUrl ?? `${getApiBaseUrl()}/webhook/psp_live_...`

  return (
    <section>
      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Step 3 of 3</p>
      <h1 className="mt-2 font-display text-[22px] font-bold tracking-[-0.5px] text-white md:text-[28px]">
        Add Perspectify to Stripe
      </h1>
      <p className="mt-3 text-[15px] leading-[1.6] text-zinc-400">
        Paste your Perspectify URL into Stripe.
        This is the final step - takes about 2 minutes.
      </p>

      <div className="mt-6 rounded-xl border border-[#22c55e]/25 bg-[#22c55e]/[0.06] p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-[#22c55e]">Your Perspectify URL</p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <p className="min-w-0 truncate font-mono text-sm text-white">{webhookUrl}</p>
          <button
            className="rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/10 px-3 py-1 text-xs font-bold text-[#22c55e]"
            onClick={() => {
              void onCopy(webhookUrl)
            }}
            type="button"
          >
            Copy URL
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] p-4">
        <a
          className="inline-flex items-center gap-2 text-sm text-blue-300 hover:underline"
          href="https://dashboard.stripe.com/webhooks"
          rel="noreferrer"
          target="_blank"
        >
          Opening Stripe Webhooks →
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="mt-6 space-y-5">
        <InstructionNumber title="In Stripe, click 'Add endpoint'">
          {!isMobile ? (
            <div className="mt-2 rounded-lg border border-white/10 bg-[#1a1a1a] p-3 text-xs text-zinc-500">
              <p>stripe.com/webhooks</p>
              <p className="mt-1 border-t border-white/10 pt-2">Endpoints <span className="rounded bg-[#22c55e]/10 px-2 py-0.5 text-[#22c55e]">+ Add endpoint</span></p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">Open Stripe Webhooks and tap + Add endpoint.</p>
          )}
        </InstructionNumber>

        <InstructionNumber number={2} title="In the URL field, paste your Perspectify URL">
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#22c55e]/20 bg-[#1a1a1a] px-3 py-2">
            <p className="min-w-0 flex-1 truncate font-mono text-[13px] text-[#22c55e]">{webhookUrl}</p>
            <button
              className="rounded bg-[#22c55e]/10 px-2 py-0.5 text-xs text-[#22c55e]"
              onClick={() => {
                void onCopy(webhookUrl)
              }}
              type="button"
            >
              Copy
            </button>
          </div>
        </InstructionNumber>

        <InstructionNumber number={3} title="Select which events to listen to">
          <p className="mt-1 text-xs text-zinc-500">We recommend starting with these:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <EventTag label="payment_intent.succeeded" />
            <EventTag label="charge.failed" />
            <EventTag label="payment_intent.payment_failed" />
          </div>
          <p className="mt-2 text-xs text-zinc-600">(Or select 'All events' - Perspectify handles all of them)</p>
        </InstructionNumber>

        <InstructionNumber number={4} title="Click 'Add endpoint' - Stripe will show your webhook secret">
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-[13px] text-zinc-300">
              Copy the secret that starts with whsec_
              You&apos;ll only see it once.
            </p>
          </div>
        </InstructionNumber>

        {showInlineSecretStep ? (
          <InstructionNumber number={5} title="Paste your webhook secret in Perspectify">
            <div className="mt-2 flex flex-col gap-2 md:flex-row">
              <input
                className="w-full rounded-xl border border-white/10 bg-[#1a1a1a] px-4 py-3 font-mono text-sm text-white outline-none"
                onChange={(event) => setInlineSecret(event.target.value)}
                placeholder="whsec_..."
                value={inlineSecret}
              />
              <button
                className={`rounded-xl px-4 py-3 font-display text-sm font-bold ${
                  isSavingSecret
                    ? 'cursor-wait bg-[#22c55e]/70 text-black'
                    : 'bg-[#22c55e] text-black hover:opacity-90'
                }`}
                disabled={isSavingSecret}
                onClick={() => {
                  void onSaveSecret()
                }}
                type="button"
              >
                {isSavingSecret ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  'Save secret'
                )}
              </button>
            </div>
            {saveSecretError ? (
              <p className="mt-2 text-xs text-[#ef4444]">
                {saveSecretError}{' '}
                <Link className="text-zinc-400 underline" href="/dashboard/endpoints">
                  Go to endpoints
                </Link>
              </p>
            ) : null}
          </InstructionNumber>
        ) : null}

        {secretSaved ? (
          <p className="inline-flex items-center gap-2 text-sm text-[#22c55e]">
            <Check className="h-4 w-4" />
            Secret already saved ✓
          </p>
        ) : null}
      </div>

      <div className="mt-8">
        <a
          className="inline-flex w-full items-center justify-center rounded-xl bg-[#22c55e] py-4 font-display text-base font-bold text-black"
          href="/dashboard"
        >
          Go to dashboard →
        </a>
        <Link className="mt-3 block text-center text-[13px] text-zinc-600 hover:text-zinc-400" href="/dashboard">
          Skip for now →
        </Link>
      </div>
    </section>
  )
}

function InstructionNumber({
  number = 1,
  title,
  children,
}: {
  number?: number
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 font-display text-xs text-zinc-400">
        {number}
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-6 text-zinc-300">{title}</p>
        {children}
      </div>
    </div>
  )
}

function EventTag({ label }: { label: string }) {
  return (
    <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-zinc-300">
      {label}
    </span>
  )
}
