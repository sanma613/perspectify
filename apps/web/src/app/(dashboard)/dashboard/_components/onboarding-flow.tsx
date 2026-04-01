import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export function OnboardingFlow() {
  return (
    <section className="space-y-5 rounded-2xl border border-white/10 bg-black/25 p-5">
      <header className="space-y-1">
        <h2 className="font-display text-2xl text-zinc-100 sm:text-3xl">Get started</h2>
        <p className="text-sm text-zinc-400">
          Launch your first endpoint with the guided Zapier or Make setup flow.
        </p>
      </header>

      <Link
        className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400"
        href="/onboarding"
      >
        Start onboarding <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  )
}
