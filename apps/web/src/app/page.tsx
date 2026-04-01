import Link from 'next/link'
import { Check, Link2, Lock, RefreshCw } from 'lucide-react'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { LandingNav } from './landing-nav'
import { PLANS } from '../lib/plans'
import { createClient } from '../lib/supabase/server'

export const metadata: Metadata = {
  alternates: { canonical: 'https://perspectify.com' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Perspectify',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  offers: [
    {
      '@type': 'Offer',
      price: String(PLANS.free.priceMonthly),
      priceCurrency: 'USD',
      name: 'Free plan',
    },
    {
      '@type': 'Offer',
      price: String(PLANS.starter.priceMonthly),
      priceCurrency: 'USD',
      name: 'Starter plan',
      billingIncrement: 'P1M',
    },
  ],
  description: 'Webhook reliability layer for Stripe + Zapier/Make users.',
  url: 'https://perspectify.com',
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isAuthenticated = Boolean(user)

  const primaryHref = isAuthenticated ? '/dashboard' : '/signup'
  const primaryCta = isAuthenticated ? 'Go to dashboard →' : 'Protect my revenue →'
  const secondaryCta = isAuthenticated ? 'Go to dashboard →' : 'Start free →'

  return (
    <>
      <script
        id="landing-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="scroll-smooth bg-[#090909] text-white">
        <LandingNav isAuthenticated={isAuthenticated} />
        <main>
          <section
            className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 pb-24 pt-28 text-center"
            id="hero"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-[33%] h-[380px] w-[600px] -translate-x-1/2 rounded-full"
              style={{
                background:
                  'radial-gradient(ellipse, rgba(34,197,94,0.07) 0%, transparent 70%)',
              }}
            />

            <div className="relative z-10 mx-auto max-w-[820px]">
              <p className="animate-[fade-up_450ms_ease_0.05s_both] text-sm font-medium tracking-[0.01em] text-[#ff6b6b]">
                Right now, someone just lost a payment they&apos;ll never recover.
              </p>
              <div className="mt-4 inline-flex animate-[fade-up_450ms_ease_0.1s_both] items-center gap-2 rounded-full border border-[#22c55e]/[0.22] bg-[#22c55e]/[0.08] px-3.5 py-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22c55e]" />
                <span className="text-xs text-[#22c55e]">
                  Built for Zapier + Make users - not DevOps teams
                </span>
              </div>

              <h1 className="mt-8 animate-[fade-up_500ms_ease_0.22s_both] font-display text-[clamp(38px,7.5vw,80px)] font-extrabold leading-[1.04] tracking-[-2px] text-white">
                Your Stripe payments fire.
                <br />
                <span className="text-[#22c55e]">Zapier and Make drop them.</span>
              </h1>

              <p className="mx-auto mt-6 animate-[fade-up_500ms_ease_0.38s_both] text-[clamp(15px,2vw,19px)] font-light leading-[1.65] text-[#a1a1aa]">
                A customer pays. Zapier times out. Make hits its limit.
                <br />
                The event disappears - no alert, no retry, no trace.
                <br />
                You find out three days later when they file a chargeback.
              </p>

              <div className="mt-10 flex animate-[fade-up_500ms_ease_0.52s_both] flex-col items-center gap-3">
                <Link
                  className="rounded-xl bg-[#22c55e] px-8 py-4 font-display text-base font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-[0_8px_28px_rgba(34,197,94,0.35)]"
                  href={primaryHref}
                >
                  {primaryCta}
                </Link>
                <p className="text-xs text-zinc-500">
                  No credit card. Free forever on the base plan.
                </p>
              </div>

              <div className="mt-14 animate-[fade-up_500ms_ease_0.66s_both]">
                <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                  Works with
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <span className="rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/10 px-3 py-1 font-display text-sm font-bold text-[#22c55e]">Stripe</span>
                  <span className="rounded-lg px-3 py-1 font-display text-sm font-bold text-zinc-500">Shopify</span>
                  <span className="text-sm text-zinc-500">→</span>
                  <span className="rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/10 px-3 py-1 font-display text-sm font-bold text-[#22c55e]">Zapier</span>
                  <span className="rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/10 px-3 py-1 font-display text-sm font-bold text-[#22c55e]">Make</span>
                  <span className="rounded-lg px-3 py-1 font-display text-sm font-bold text-zinc-500">Bubble</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-[1024px] px-6 py-24" id="problem">
            <p className="text-center text-[11px] uppercase tracking-[0.22em] text-zinc-500">
              THE PROBLEM
            </p>
            <h2 className="mt-3 text-center font-display text-[clamp(26px,4vw,44px)] font-bold leading-[1.1] tracking-[-1px]">
              Zapier failed. Make hit its limit.
              <br />
              Your Stripe payment is gone.
            </h2>
            <p className="mx-auto mt-4 max-w-[480px] text-center text-base font-light leading-[1.65] text-zinc-400">
              A customer paid. You never knew. They never got access.
              Three days later they filed a chargeback.
              That&apos;s what a silent webhook failure looks like - and you wouldn&apos;t know it happened until it&apos;s too late.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <TerminalPanel
                lines={[
                  ['14:32:01', 'TRIGGER', 'payment_intent.succeeded', 'amber'],
                  ['14:32:02', '$149.00 · carlos@acme.com', '', 'zinc'],
                  ['14:32:03', '→ Running Make scenario...', '', 'zinc'],
                  ['14:32:13', 'ERROR', 'Operations limit reached', 'red'],
                  ['14:32:13', 'Workflow failed - no retry', '', 'red'],
                  ['14:32:13', 'Event data: lost forever.', '', 'muted'],
                ]}
                title="Zapier - Workflow History"
                tone="red"
              />
              <TerminalPanel
                lines={[
                  ['14:32:01', 'CAPTURED', '$149.00 · Carlos Mendoza', 'green'],
                  ['14:32:02', 'Saved to vault - before Make', '', 'zinc'],
                  ['14:32:13', 'RETRY 1/7', 'in 5s...', 'amber'],
                  ['14:32:18', 'RETRY 2/7', 'in 10s...', 'amber'],
                  ['14:32:28', 'DELIVERED', 'Make responded 200 OK', 'green'],
                  ['14:32:28', '$149.00 recovered.', '', 'green'],
                ]}
                title="Perspectify - Events"
                tone="green"
              />
            </div>
          </section>

          <section className="border-y border-white/10 bg-[#111111] px-6 py-24" id="how">
            <div className="mx-auto max-w-[1024px]">
              <p className="text-center text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                SETUP
              </p>
              <h2 className="mt-3 text-center font-display text-[clamp(26px,4vw,44px)] font-bold leading-[1.1] tracking-[-1px]">
                Replace one URL in Stripe.
                <br />
                That&apos;s it.
              </h2>
              <p className="mx-auto mt-4 max-w-[420px] text-center text-base font-light leading-[1.65] text-zinc-400">
                No code. No Zapier zap to update. No Make scenario to touch.
                Just swap the endpoint.
              </p>

              <div className="mt-10 grid overflow-hidden rounded-2xl border border-white/10 md:grid-cols-3">
                <StepCard
                  description="Replace your Zapier or Make webhook URL in Stripe with your Perspectify endpoint. One field, one change."
                  icon={<Link2 className="h-5 w-5 text-[#22c55e]" />}
                  iconBg="bg-[#22c55e]/10"
                  number="01"
                  title="Swap your Stripe webhook URL"
                />
                <StepCard
                  description="Think of it as a safety deposit box for your Stripe events. Even if Zapier or Make goes down, your data is waiting safely - not lost somewhere on the internet."
                  icon={<Lock className="h-5 w-5 text-blue-400" />}
                  iconBg="bg-blue-500/10"
                  number="02"
                  title="Your payments land safely first"
                />
                <StepCard
                  description="We retry up to 7 times with exponential backoff. If Zapier is still down, rescue it manually when you're ready."
                  icon={<RefreshCw className="h-5 w-5 text-[#22c55e]" />}
                  iconBg="bg-[#22c55e]/10"
                  number="03"
                  title="Automatic retries - or one click"
                  withoutBorder
                />
              </div>
            </div>
          </section>

          <section className="px-6 py-24" id="pricing">
            <div className="mx-auto max-w-[800px]">
              <p className="text-center text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                PRICING
              </p>
              <h2 className="mt-3 text-center font-display text-[clamp(26px,4vw,44px)] font-bold leading-[1.1] tracking-[-1px]">
                Simple, honest pricing.
              </h2>
              <p className="mt-4 text-center text-base font-light leading-[1.65] text-zinc-400">
                Start free. Upgrade when you need more. No surprise bills.
              </p>

              <div className="mt-10 grid gap-4 md:grid-cols-2">
                <PricingCardFree isAuthenticated={isAuthenticated} />
                <PricingCardStarter isAuthenticated={isAuthenticated} />
              </div>
            </div>
          </section>

          <section className="px-6 pb-24" id="survey">
            <div className="mx-auto max-w-[800px] rounded-2xl border border-[#22c55e]/20 bg-[#111111] p-8 text-center md:p-10">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#22c55e]">FINAL STEP</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.8px]">
                Protect your next payment now.
              </h2>
              <p className="mx-auto mt-3 max-w-[460px] text-zinc-400">
                Join no-code builders who refuse to lose revenue to silent webhook failures.
              </p>
              <Link
                className="mt-7 inline-flex rounded-xl bg-[#22c55e] px-8 py-4 font-display text-base font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90"
                href={primaryHref}
              >
                {secondaryCta}
              </Link>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10 bg-[#090909] px-8 py-7 md:px-10">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="inline-flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-[#22c55e] shadow-[0_0_10px_rgba(34,197,94,0.6)]" />
              <span className="font-display text-[18px] font-bold tracking-[-0.4px] text-white">Perspectify</span>
            </div>
            <p className="text-sm text-zinc-500">Revenue insurance for no-code builders</p>
            <p className="text-sm text-zinc-500">© 2025 Perspectify</p>
          </div>
        </footer>
      </div>
    </>
  )
}

function TerminalPanel({
  title,
  tone,
  lines,
}: {
  title: string
  tone: 'red' | 'green'
  lines: [string, string, string, 'red' | 'green' | 'amber' | 'zinc' | 'muted'][]
}) {
  const border = tone === 'red' ? 'border-[rgba(239,68,68,0.18)]' : 'border-[rgba(34,197,94,0.18)]'

  return (
    <article className={`overflow-hidden rounded-2xl border bg-[#111111] ${border}`}>
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#1a1a1a] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <p className="font-mono text-xs text-zinc-500">{title}</p>
      </div>
      <div className="space-y-1 p-5 font-mono text-xs leading-8">
        {lines.map(([time, status, tail, level]) => (
          <p className="text-zinc-400" key={`${time}-${status}-${tail}`}>
            <span className="text-zinc-500">{time} </span>
            <span
              className={
                level === 'green'
                  ? 'text-[#22c55e]'
                  : level === 'red'
                    ? 'text-[#ff6b6b]'
                    : level === 'amber'
                      ? 'text-amber-400'
                      : level === 'muted'
                        ? 'text-zinc-500'
                        : 'text-zinc-400'
              }
            >
              {status}
            </span>
            {tail ? ` ${tail}` : ''}
          </p>
        ))}
      </div>
    </article>
  )
}

function StepCard({
  number,
  title,
  description,
  icon,
  iconBg,
  withoutBorder = false,
}: {
  number: string
  title: string
  description: string
  icon: ReactNode
  iconBg: string
  withoutBorder?: boolean
}) {
  return (
    <article
      className={`border-white/10 p-9 transition hover:bg-white/[0.02] ${withoutBorder ? '' : 'border-b md:border-b-0 md:border-r'}`}
    >
      <p className="mb-6 font-display text-5xl font-black tracking-[-2px] text-white/10">{number}</p>
      <div className={`mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
        {icon}
      </div>
      <h3 className="mb-3 font-display text-lg font-bold tracking-[-0.3px] text-white">{title}</h3>
      <p className="text-sm font-light leading-relaxed text-zinc-400">{description}</p>
    </article>
  )
}

function PricingCardFree({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#111111] p-8">
      <p className="font-display text-sm font-bold text-zinc-400">Free</p>
      <p className="mt-1 font-display text-5xl font-bold text-white">${PLANS.free.priceMonthly}</p>
      <p className="text-sm text-zinc-500">forever</p>
      <div className="my-6 h-px bg-white/10" />
      <ul className="space-y-3 text-sm text-zinc-400">
        <FeatureItem enabled label={`${PLANS.free.maxEventsPerMonth.toLocaleString()} events / month`} />
        <FeatureItem enabled label={`${PLANS.free.maxEndpoints} endpoint`} />
        <FeatureItem enabled label="48h event history" />
        <FeatureItem enabled label={`${PLANS.free.maxReplays} replays per event`} />
        <FeatureItem enabled={false} label="Email failure alerts" />
        <FeatureItem enabled={false} label="Retention warnings" />
      </ul>
      <Link
        className="mt-7 inline-flex w-full justify-center rounded-xl border border-white/10 py-3 font-display text-sm font-bold text-white transition hover:bg-white/5"
        href={isAuthenticated ? '/dashboard' : '/signup'}
      >
        {isAuthenticated ? 'Go to dashboard' : 'Get started free'}
      </Link>
    </article>
  )
}

function PricingCardStarter({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <article className="relative rounded-2xl border border-[#22c55e]/30 bg-[#111111] p-8">
      <div className="absolute left-1/2 top-[-12px] -translate-x-1/2 rounded-full bg-[#22c55e] px-3 py-1 font-display text-xs font-bold text-black">
        Most popular
      </div>
      <p className="font-display text-sm font-bold text-[#22c55e]">Starter</p>
      <p className="mt-1 font-display text-5xl font-bold text-white">${PLANS.starter.priceMonthly}</p>
      <p className="text-sm text-zinc-500">per month</p>
      <div className="my-6 h-px bg-[#22c55e]/15" />
      <ul className="space-y-3 text-sm text-zinc-300">
        <FeatureItem enabled label={`${PLANS.starter.maxEventsPerMonth.toLocaleString()} events / month`} />
        <FeatureItem enabled label={`${PLANS.starter.maxEndpoints} endpoints`} />
        <FeatureItem enabled label={`${PLANS.starter.retentionDays} days history`} />
        <FeatureItem enabled label="Unlimited replays" />
        <FeatureItem enabled highlight label="Email alerts on failure" />
        <FeatureItem enabled highlight label="Retention warnings 2 days before deletion" />
      </ul>
      <Link
        className="mt-7 inline-flex w-full justify-center rounded-xl bg-[#22c55e] py-3 font-display text-sm font-bold text-black transition-all hover:-translate-y-px hover:opacity-90 hover:shadow-[0_8px_24px_rgba(34,197,94,0.35)]"
        href={isAuthenticated ? '/dashboard' : '/signup'}
      >
        {isAuthenticated ? 'Go to dashboard →' : 'Start free trial →'}
      </Link>
    </article>
  )
}

function FeatureItem({
  label,
  enabled,
  highlight = false,
}: {
  label: string
  enabled: boolean
  highlight?: boolean
}) {
  return (
    <li className={`flex items-center gap-3 ${enabled ? (highlight ? 'text-[#86efac]' : 'text-zinc-300') : 'text-zinc-600'}`}>
      <span className={enabled ? 'text-[#22c55e]' : 'text-zinc-600'}>
        {enabled ? <Check className="h-4 w-4" /> : <span className="text-base">✕</span>}
      </span>
      <span>{label}</span>
    </li>
  )
}
