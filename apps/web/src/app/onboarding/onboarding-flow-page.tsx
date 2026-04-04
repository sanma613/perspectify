'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  Loader2,
} from 'lucide-react'
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { z } from 'zod'
import { getAccessToken } from '../../lib/access-token'
import { handleEnterAdvance } from '../../lib/forms/enter-navigation'
import { usePasswordVisibility } from '../../hooks/use-password-visibility'
import { useMobile } from '../../lib/hooks/use-mobile'
import { ApiError, apiFetch, getApiBaseUrl } from '../../lib/http'
import type { MeResponse } from '../../lib/api-types'

type ToolName = 'zapier' | 'make' | 'bubble'
type StepNumber = 1 | 2 | 3
type Direction = 'forward' | 'back'

const destinationSchema = z
  .string()
  .trim()
  .url('Enter a valid https:// destination URL')
  .startsWith('https://', 'Enter a valid https:// destination URL')

const stepTwoSchema = z.object({
  name: z.string().trim().min(1, 'Name must be between 1 and 60 characters').max(60, 'Name must be between 1 and 60 characters'),
  destination: destinationSchema,
})

const saveSecretSchema = z
  .string()
  .trim()
  .min(1, 'Please enter your Stripe webhook secret.')
  .startsWith('whsec_', 'Stripe secrets start with whsec_')
  .refine((value) => value.slice('whsec_'.length).length >= 13, {
    message: 'After whsec_, include at least 13 characters',
  })

const endpointSuggestions = ['Stripe -> Zapier', 'Stripe -> Make', 'Stripe -> Bubble']

type EndpointSummary = {
  id: string
  name: string
  destination: string
}

type DraftEndpoint = {
  id: string
  tokenHash: string
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
  const [destinationServerError, setDestinationServerError] = useState<string | null>(null)
  const [destinationTouched, setDestinationTouched] = useState(false)
  const [destinationFocused, setDestinationFocused] = useState(false)
  const [debouncedDestination, setDebouncedDestination] = useState('')

  const [isDestinationEditable, setIsDestinationEditable] = useState(false)
  const [endpointName, setEndpointName] = useState('Stripe -> Make (production)')
  const [stepTwoError, setStepTwoError] = useState<string | null>(null)

  const [secret, setSecret] = useState('')
  const secretVisibility = usePasswordVisibility()
  const [stepThreeError, setStepThreeError] = useState<string | null>(null)
  const [isPreparingEndpoint, setIsPreparingEndpoint] = useState(false)
  const [isCompletingSetup, setIsCompletingSetup] = useState(false)
  const [isSkippingOnboarding, setIsSkippingOnboarding] = useState(false)
  const [existingEndpoints, setExistingEndpoints] = useState<EndpointSummary[]>([])
  const [draftEndpointId, setDraftEndpointId] = useState<string | null>(null)
  const [draftTokenHash, setDraftTokenHash] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftDestination, setDraftDestination] = useState('')

  const [containerHeight, setContainerHeight] = useState(0)
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({
    1: null,
    2: null,
    3: null,
  })
  const completedRef = useRef(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedDestination(destination.trim())
    }, 500)

    return () => window.clearTimeout(timeout)
  }, [destination])

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
    async function loadOnboardingContext() {
      try {
        const token = await getAccessToken()
        const [me, endpoints] = await Promise.all([
          apiFetch<MeResponse>('/me', token),
          apiFetch<EndpointSummary[]>('/endpoints', token),
        ])

        setExistingEndpoints(endpoints)

        if (me.onboardingCompleted) {
          router.replace('/dashboard')
        }
      } catch {
        // Keep onboarding accessible if this guard fails.
      }
    }

    void loadOnboardingContext()
  }, [router])

  const existingEndpointNames = useMemo(
    () =>
      new Set(
        existingEndpoints
          .filter((endpoint) => endpoint.id !== draftEndpointId)
          .map((endpoint) => endpoint.name.trim().toLowerCase())
      ),
    [existingEndpoints, draftEndpointId]
  )

  const existingEndpointDestinations = useMemo(
    () =>
      new Set(
        existingEndpoints
          .filter((endpoint) => endpoint.id !== draftEndpointId)
          .map((endpoint) => endpoint.destination.trim().toLowerCase())
      ),
    [existingEndpoints, draftEndpointId]
  )

  const webhookUrl = draftTokenHash ? `${getApiBaseUrl()}/webhook/${draftTokenHash}` : ''

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
  }, [step, isMobile])

  const destinationResult = useMemo(() => {
    if (!destinationTouched) return null
    return destinationSchema.safeParse(debouncedDestination)
  }, [debouncedDestination, destinationTouched])

  const destinationValidationError =
    destinationResult && !destinationResult.success
      ? destinationResult.error.issues[0]?.message ?? 'Enter a valid https:// destination URL'
      : null

  const destinationError = destinationServerError ?? destinationValidationError

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

  async function ensureDraftEndpoint(name: string, destination: string): Promise<DraftEndpoint> {
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
      }
    }

    if (draftEndpointId) {
      const token = await getAccessToken()
      const payload: { name?: string; destination?: string } = {}

      if (draftName.trim() !== normalizedName) payload.name = normalizedName
      if (draftDestination.trim() !== normalizedDestination) payload.destination = normalizedDestination

      if (Object.keys(payload).length > 0) {
        await apiFetch(`/endpoints/${draftEndpointId}`, token, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      }

      setDraftName(normalizedName)
      setDraftDestination(normalizedDestination)

      return {
        id: draftEndpointId,
        tokenHash: draftTokenHash,
      }
    }

    const token = await getAccessToken()
    const draft = await apiFetch<{ id: string; tokenHash: string }>('/endpoints', token, {
      method: 'POST',
      body: JSON.stringify({
        name: normalizedName,
        destination: normalizedDestination,
      }),
    })

    setDraftEndpointId(draft.id)
    setDraftTokenHash(draft.tokenHash)
    setDraftName(normalizedName)
    setDraftDestination(normalizedDestination)

    return draft
  }

  async function handleContinueStepOne() {
    setDestinationTouched(true)
    setDestinationServerError(null)
    const parsed = destinationSchema.safeParse(destination.trim())
    if (!parsed.success) return
    transitionTo(2)
  }

  async function handleContinueStepTwo() {
    setStepTwoError(null)
    setDestinationServerError(null)

    const parsed = stepTwoSchema.safeParse({
      name: endpointName,
      destination,
    })

    if (!parsed.success) {
      setStepTwoError(parsed.error.issues[0]?.message ?? 'Please check your values and try again.')
      return
    }

    const normalizedName = parsed.data.name.toLowerCase()
    if (existingEndpointNames.has(normalizedName)) {
      setStepTwoError('You already have an endpoint with this name')
      return
    }

    const normalizedDestination = parsed.data.destination.toLowerCase()
    if (existingEndpointDestinations.has(normalizedDestination)) {
      setDestinationTouched(true)
      setDestinationServerError('You already have an endpoint with this destination')
      transitionTo(1)
      return
    }

    setIsPreparingEndpoint(true)
    try {
      await ensureDraftEndpoint(parsed.data.name, parsed.data.destination)
      setSecret('')
      setStepThreeError(null)
      transitionTo(3)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'conflict') {
        if (error.field === 'name') {
          setStepTwoError('You already have an endpoint with this name')
          return
        }

        if (error.field === 'destination') {
          setDestinationTouched(true)
          setDestinationServerError('You already have an endpoint with this destination')
          transitionTo(1)
          return
        }
      }

      setStepTwoError(error instanceof Error ? error.message : 'Could not prepare endpoint.')
    } finally {
      setIsPreparingEndpoint(false)
    }
  }

  async function handleCompleteSetup() {
    const trimmedName = endpointName.trim()
    if (!trimmedName) {
      setStepTwoError('Name must be between 1 and 60 characters')
      setStepThreeError(null)
      transitionTo(2)
      return
    }

    const trimmedDestination = destination.trim()
    if (existingEndpointNames.has(trimmedName.toLowerCase())) {
      setStepTwoError('You already have an endpoint with this name')
      setStepThreeError(null)
      transitionTo(2)
      return
    }

    try {
      const parsedUrl = new URL(trimmedDestination)
      if (parsedUrl.protocol !== 'https:') {
        throw new Error('invalid protocol')
      }
    } catch {
      setDestinationTouched(true)
      setDestinationServerError('Enter a valid https:// destination URL')
      setStepThreeError(null)
      transitionTo(1)
      return
    }

    if (existingEndpointDestinations.has(trimmedDestination.toLowerCase())) {
      setDestinationTouched(true)
      setDestinationServerError('You already have an endpoint with this destination')
      setStepThreeError(null)
      transitionTo(1)
      return
    }

    const trimmedSecret = secret.trim()
    if (!trimmedSecret) {
      setStepThreeError('Stripe webhook secret is required')
      return
    }

    const parsed = saveSecretSchema.safeParse(trimmedSecret)
    if (!parsed.success) {
      setStepThreeError(parsed.error.issues[0]?.message ?? 'Invalid secret format')
      return
    }

    setStepThreeError(null)
    setIsCompletingSetup(true)
    try {
      const draft = await ensureDraftEndpoint(trimmedName, trimmedDestination)
      const token = await getAccessToken()
      await apiFetch(`/endpoints/${draft.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          secret: parsed.data,
        }),
      })

      // Redundant/idempotent safeguard for completion state sync.
      // If this fails, endpoint PATCH already marked onboarding as completed.
      try {
        await apiFetch('/me', token, {
          method: 'PATCH',
          body: JSON.stringify({ onboardingCompleted: true }),
        })
      } catch {
        // Keep navigation non-blocking once endpoint setup succeeded.
      }

      completedRef.current = true
      router.push('/dashboard')
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409 && error.field === 'name') {
          setStepTwoError('You already have an endpoint with this name')
          setStepThreeError(null)
          transitionTo(2)
          return
        }

        if (error.status === 409 && error.field === 'destination') {
          setDestinationTouched(true)
          setDestinationServerError('You already have an endpoint with this destination')
          setStepThreeError(null)
          transitionTo(1)
          return
        }

        if (error.status === 400) {
          setStepThreeError('Invalid secret format')
          return
        }
      }

      setStepThreeError('Something went wrong. Please try again.')
    } finally {
      setIsCompletingSetup(false)
    }
  }

  function handleStepOneKeyDown(event: KeyboardEvent<HTMLElement>) {
    handleEnterAdvance(event, {
      onComplete: () => {
        void handleContinueStepOne()
      },
    })
  }

  function handleStepTwoKeyDown(event: KeyboardEvent<HTMLElement>) {
    handleEnterAdvance(event, {
      onComplete: () => {
        void handleContinueStepTwo()
      },
    })
  }

  function handleStepThreeKeyDown(event: KeyboardEvent<HTMLElement>) {
    handleEnterAdvance(event, {
      onComplete: () => {
        void handleCompleteSetup()
      },
    })
  }

  async function handleSkipOnboarding() {
    if (isSkippingOnboarding) return

    setIsSkippingOnboarding(true)

    try {
      const token = await getAccessToken()
      await apiFetch('/me', token, {
        method: 'PATCH',
        body: JSON.stringify({ onboardingCompleted: true }),
      })
    } catch {
      // Proxy also persists this via skipOnboarding query param.
    } finally {
      router.push('/dashboard?skipOnboarding=1')
    }
  }

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
            <span className="font-display text-lg font-bold tracking-tight text-white">Perspectify</span>
          </Link>
          <div className="text-sm text-zinc-500">
            <button
              className="hidden md:inline transition hover:text-white disabled:opacity-60"
              disabled={isSkippingOnboarding}
              onClick={() => {
                void handleSkipOnboarding()
              }}
              type="button"
            >
              Go to dashboard →
            </button>
            <button
              className="md:hidden text-sm text-zinc-500 disabled:opacity-60"
              disabled={isSkippingOnboarding}
              onClick={() => {
                void handleSkipOnboarding()
              }}
              type="button"
            >
              Go to dashboard →
            </button>
          </div>
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
                onEnterContinue={handleStepOneKeyDown}
                onBlurInput={() => setDestinationFocused(false)}
                onChangeDestination={(next) => {
                  setDestination(next)
                  setDestinationServerError(null)
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
                destination={destination}
                endpointName={endpointName}
                isPreparingEndpoint={isPreparingEndpoint}
                isDestinationEditable={isDestinationEditable}
                isMobile={isMobile}
                isSubmittingDisabled={!hasValidDestination || endpointName.trim().length < 1 || isPreparingEndpoint}
                onEnterContinue={handleStepTwoKeyDown}
                onChangeEndpointName={(value) => {
                  setEndpointName(value)
                  if (stepTwoError) setStepTwoError(null)
                }}
                onContinue={handleContinueStepTwo}
                onDestinationEditToggle={() => setIsDestinationEditable((value) => !value)}
                onDestinationSave={(next) => {
                  setDestination(next)
                  setDestinationServerError(null)
                  setIsDestinationEditable(false)
                  setDestinationTouched(true)
                }}
                onSuggestion={(value) => setEndpointName(value)}
                stepTwoError={stepTwoError}
              />
            </div>

            <div ref={setStepRef(3)} style={getStepStyle(3)}>
              <StepThree
                isCompletingSetup={isCompletingSetup}
                onCompleteSetup={handleCompleteSetup}
                onEnterSubmit={handleStepThreeKeyDown}
                secret={secret}
                secretInputType={secretVisibility.inputType}
                secretVisible={secretVisibility.visible}
                setSecret={setSecret}
                toggleSecretVisible={secretVisibility.toggle}
                stepThreeError={stepThreeError}
                webhookUrl={webhookUrl}
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

              {step === 2 ? (
                <button
                  className={`h-12 w-full rounded-xl font-display text-sm font-bold ${
                    hasValidDestination && endpointName.trim().length >= 1 && !isPreparingEndpoint
                      ? 'bg-[#22c55e] text-black'
                      : 'cursor-not-allowed bg-zinc-800 text-zinc-600'
                  }`}
                  disabled={!hasValidDestination || endpointName.trim().length < 1 || isPreparingEndpoint}
                  onClick={() => {
                    void handleContinueStepTwo()
                  }}
                  type="button"
                >
                  {isPreparingEndpoint ? 'Preparing...' : 'Continue →'}
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
  onEnterContinue,
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
  onEnterContinue: (event: KeyboardEvent<HTMLElement>) => void
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

  const bubbleSteps = [
    'Go to your Bubble app editor and open the "Plugins" tab in the left sidebar.',
    'Search for "API Connector" and install it if you haven\'t already.',
    'Go to "Backend Workflows" in your Bubble app (enable in Settings → Collaboration if hidden).',
    'Create a new API Workflow. Set trigger to "Webhook" — Bubble generates a unique URL. Copy it.',
  ]

  const stepsForTool = tool === 'bubble' ? bubbleSteps : steps

  const callout =
    tool === 'zapier'
      ? "Don't click 'Test trigger' in Zapier yet. Come back here first."
      : tool === 'make'
        ? 'Save your scenario before leaving Make - otherwise the webhook URL may not activate.'
        : "Make sure 'Expose as a public API endpoint' is enabled in your workflow settings, otherwise Perspectify won't be able to deliver events to it."

  const hideInstructions = isMobile && (destinationFocused || hasValidDestination)

  return (
    <section onKeyDown={onEnterContinue}>
      <p className="text-xs uppercase tracking-wider text-zinc-500">Step 1 of 3</p>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
        Create a webhook in Zapier or Make
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        This is where your Stripe payments will be delivered.
        Perspectify will send every captured event here.
      </p>

      <div className="mt-8 grid grid-cols-3 border-b border-white/10">
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
        <button
          className={`pb-3 text-sm ${tool === 'bubble' ? 'border-b-2 border-[#22c55e] font-display font-medium text-white' : 'border-b-2 border-transparent text-zinc-500 hover:text-zinc-300'}`}
          onClick={() => onToggleTool('bubble')}
          type="button"
        >
          Bubble
        </button>
      </div>

      <div
        className={`mt-6 overflow-hidden transition-[max-height,opacity] duration-200 ${
          hideInstructions ? 'max-h-0 opacity-0' : 'max-h-[720px] opacity-100'
        }`}
      >
        {isMobile ? (
          <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#1a1a1a]">
            {stepsForTool.map((line, index) => {
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
                      <span className="font-display text-xs font-bold text-[#22c55e]">{item.toString().padStart(2, '0')}</span>
                      <span>{line}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 text-zinc-500 transition ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`px-4 transition-all ${isOpen ? 'max-h-40 pb-3 opacity-100' : 'max-h-0 overflow-hidden opacity-0'}`}>
                    <p className="pl-9 text-xs text-zinc-500">Follow this step in {tool === 'zapier' ? 'Zapier' : tool === 'make' ? 'Make' : 'Bubble'} and return here.</p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-[#1a1a1a] p-6">
            <div className="space-y-4">
              {stepsForTool.map((line, index) => (
                <div className="flex items-start gap-4" key={line}>
                  <span className="w-6 shrink-0 font-display text-xs font-bold text-[#22c55e]">
                    {(index + 1).toString().padStart(2, '0')}
                  </span>
                  <p className="text-sm leading-normal text-zinc-300">{line}</p>
                </div>
              ))}
            </div>
            <div className={`mt-4 flex items-start gap-2 rounded-lg p-4 ${tool === 'bubble' ? 'border border-amber-500/25 bg-amber-500/[0.08]' : 'border border-[#22c55e]/20 bg-[#22c55e]/[0.06]'}`}>
              <Info className={`mt-0.5 h-4 w-4 shrink-0 ${tool === 'bubble' ? 'text-amber-400' : 'text-[#22c55e]'}`} />
              <p className="text-xs text-zinc-300">{callout}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8">
        <label className="mb-2 block text-xs text-zinc-400">Your Zapier, Make, or Bubble webhook URL</label>
        <input
          className={`w-full rounded-xl border bg-[#1a1a1a] px-4 py-3 text-sm text-white outline-none ${
            destinationError
              ? 'border-[#ef4444]'
              : hasValidDestination && destinationTouched
                ? 'border-[#22c55e]/30'
                : 'border-white/10'
          }`}
          pattern="https://.*"
          onBlur={onBlurInput}
          onChange={(event) => onChangeDestination(event.target.value)}
          onFocus={onFocusInput}
          placeholder="https://hooks.zapier.com/hooks/catch/..."
          required
          type="url"
          value={destination}
        />
        {destinationError ? (
          <p className="mt-2 text-xs text-[#ef4444]">{destinationError}</p>
        ) : null}
        <p className="mt-2 text-xs text-zinc-600">This is the URL from Zapier, Make, or Bubble - not a Stripe URL.</p>
      </div>
    </section>
  )
}

function StepTwo({
  destination,
  endpointName,
  isPreparingEndpoint,
  isDestinationEditable,
  isSubmittingDisabled,
  isMobile,
  onEnterContinue,
  stepTwoError,
  onDestinationEditToggle,
  onDestinationSave,
  onChangeEndpointName,
  onSuggestion,
  onContinue,
}: {
  destination: string
  endpointName: string
  isPreparingEndpoint: boolean
  isDestinationEditable: boolean
  isSubmittingDisabled: boolean
  isMobile: boolean
  onEnterContinue: (event: KeyboardEvent<HTMLElement>) => void
  stepTwoError: string | null
  onDestinationEditToggle: () => void
  onDestinationSave: (value: string) => void
  onChangeEndpointName: (value: string) => void
  onSuggestion: (value: string) => void
  onContinue: () => Promise<void>
}) {
  const [draftDestination, setDraftDestination] = useState(destination)
  const destinationInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setDraftDestination(destination)
  }, [destination])

  useEffect(() => {
    if (!isDestinationEditable) return

    const input = destinationInputRef.current
    if (!input) return

    window.requestAnimationFrame(() => {
      const end = input.value.length
      input.focus()
      input.setSelectionRange(end, end)
      input.scrollLeft = input.scrollWidth
    })
  }, [isDestinationEditable])

  return (
    <section onKeyDown={onEnterContinue}>
      <p className="text-xs uppercase tracking-wider text-zinc-500">Step 2 of 3</p>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
        Set up your Perspectify endpoint
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        Give it a name and confirm your destination.
      </p>

      <div className="mt-8 space-y-5">
        <div>
          <label className="mb-2 block text-xs text-zinc-400">Where to deliver your events</label>
          <div className="relative">
            <CheckCircle2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#22c55e]" />
            {isDestinationEditable ? (
              <input
                className="w-full rounded-xl border border-[#22c55e]/20 bg-[#1a1a1a] py-3 pl-9 pr-24 text-sm text-zinc-300 outline-none cursor-text overflow-x-auto whitespace-nowrap"
                ref={destinationInputRef}
                onChange={(event) => setDraftDestination(event.target.value)}
                pattern="https://.*"
                required
                type="url"
                value={draftDestination}
              />
            ) : (
              <div className="w-full rounded-xl border border-[#22c55e]/20 bg-[#1a1a1a] py-3 pl-9 pr-24 text-sm text-zinc-300 cursor-default overflow-hidden text-ellipsis whitespace-nowrap">
                {draftDestination}
              </div>
            )}
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-[#1a1a1a] px-1 text-xs text-zinc-500 hover:text-zinc-300"
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
          <label className="mb-1 block text-xs text-zinc-400">Give this endpoint a name</label>
          <p className="mb-2 text-xs text-zinc-600">Something that helps you identify it later.</p>
          <input
            className="w-full rounded-xl border border-white/10 bg-[#1a1a1a] px-4 py-3 text-sm text-white outline-none focus:border-white/20"
            minLength={1}
            onChange={(event) => onChangeEndpointName(event.target.value)}
            placeholder="Stripe -> Make (production)"
            required
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

      </div>

      {stepTwoError ? (
        <div className="mt-4 rounded-lg border border-[#ef4444]/25 bg-[#ef4444]/[0.08] p-4">
          <p className="text-xs text-zinc-300">{stepTwoError}</p>
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
              void onContinue()
            }}
            type="button"
          >
            {isPreparingEndpoint ? 'Preparing...' : 'Continue →'}
          </button>
        </div>
      ) : null}
    </section>
  )
}

function StepThree({
  isCompletingSetup,
  onCompleteSetup,
  onEnterSubmit,
  secret,
  secretInputType,
  secretVisible,
  setSecret,
  toggleSecretVisible,
  stepThreeError,
  webhookUrl,
}: {
  isCompletingSetup: boolean
  onCompleteSetup: () => Promise<void>
  onEnterSubmit: (event: KeyboardEvent<HTMLElement>) => void
  secret: string
  secretInputType: 'text' | 'password'
  secretVisible: boolean
  setSecret: (value: string) => void
  toggleSecretVisible: () => void
  stepThreeError: string | null
  webhookUrl: string
}) {
  const [copied, setCopied] = useState(false)

  const secretError =
    secret.trim() && !secret.trim().startsWith('whsec_')
      ? 'Stripe secrets start with whsec_'
      : secret.trim() && secret.trim().startsWith('whsec_') && secret.trim().slice('whsec_'.length).length < 13
        ? 'After whsec_, include at least 13 characters'
        : null

  async function copyWebhookUrl() {
    if (!webhookUrl) return
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <section onKeyDown={onEnterSubmit}>
      <p className="text-xs uppercase tracking-wider text-zinc-500">Step 3 of 3</p>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
        Add Perspectify to Stripe
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        Paste your Perspectify URL into Stripe.
        This is the final step - takes about 2 minutes.
      </p>

      <div className="mt-1 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] p-4">
        <a
          className="inline-flex items-center gap-2 text-sm text-blue-300 hover:underline"
          href="https://dashboard.stripe.com/webhooks"
          rel="noopener noreferrer"
          target="_blank"
        >
          Opening Stripe Webhooks →
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="mt-6 space-y-5">
        <InstructionNumber title="In Stripe, click 'Add destination'" />

        <InstructionNumber number={2} title="Select which events to listen to">
          <p className="mt-1 text-xs text-zinc-500">We recommend starting with these:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <EventTag label="payment_intent.succeeded" />
            <EventTag label="charge.failed" />
            <EventTag label="payment_intent.payment_failed" />
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            You can select "All events", but it is usually better to choose a closed set. More events can consume
            your plan limit faster and add unnecessary load to your automations/app. If you know you need all events,
            go ahead.
          </p>
        </InstructionNumber>

        <InstructionNumber number={3} title="After selecting 'Webhook endpoint', paste your Perspectify endpoint URL">
          <p className="mt-2 text-xs text-zinc-500">This URL is already generated. Paste this exact value in Stripe.</p>
          <div className="mt-2 flex gap-2">
            <div className="flex h-11 flex-1 items-center truncate whitespace-nowrap overflow-hidden rounded-xl border border-green-500/30 bg-[#1a1a1a] px-3 font-mono text-xs leading-loose text-zinc-200 cursor-text select-text">
              {webhookUrl}
            </div>
            <button
              className="h-11 rounded-xl border border-white/15 px-3 text-xs text-zinc-300 hover:border-white/30 hover:text-white"
              onClick={() => {
                void copyWebhookUrl()
              }}
              type="button"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </InstructionNumber>

        <InstructionNumber number={4} title="Click 'Add endpoint' - Stripe will show your webhook secret">
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-xs text-zinc-300">
              Copy the secret that starts with whsec_
            </p>
          </div>
        </InstructionNumber>

      </div>

      <div className="mt-6">
        <InstructionNumber number={5} title="Paste your webhook secret in Perspectify">
        <div className="relative mt-2">
          <input
            className={`h-11 w-full rounded-xl border bg-[#1a1a1a] px-4 py-3 pr-12 font-mono text-sm text-white outline-none transition-colors ${
              secret && !secretError
                ? 'border-green-500/40'
                : secretError
                  ? 'border-red-400'
                  : 'border-white/10'
            } focus:border-green-500/40`}
            onChange={(event) => setSecret(event.target.value)}
            pattern="whsec_.*"
            placeholder="whsec_..."
            required
            type={secretInputType}
            value={secret}
          />
          <button
            aria-label={secretVisible ? 'Hide' : 'Show'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            onClick={toggleSecretVisible}
            tabIndex={-1}
            type="button"
          >
            {secretVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {secretError ? <p className="mt-2 text-xs text-[#ef4444]">{secretError}</p> : null}
        </InstructionNumber>
      </div>

      <div className="mt-8">
        <button
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#22c55e] px-6 font-display text-sm font-bold text-black disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
          disabled={isCompletingSetup}
          onClick={() => {
            void onCompleteSetup()
          }}
          type="button"
        >
          {isCompletingSetup ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating endpoint...
            </span>
          ) : (
            'Create endpoint'
          )}
        </button>
        {stepThreeError ? <p className="mt-3 text-sm text-[#ef4444]">{stepThreeError}</p> : null}
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
      <div className="min-w-0 flex-1">
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
