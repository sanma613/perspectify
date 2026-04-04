import type { PlanId } from '../../../../../lib/capabilities'

export function PlanBadge({ plan }: { plan: PlanId }) {
  const label = plan === 'starter' ? 'Starter' : 'Free'
  const tone =
    plan === 'starter'
      ? 'border-[#22c55e]/60 bg-[#22c55e]/15 text-[#dcfce7]'
      : 'border-white/15 bg-white/5 text-[#a1a1aa]'

  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-display uppercase tracking-wider ${tone}`}
    >
      {label}
    </span>
  )
}
