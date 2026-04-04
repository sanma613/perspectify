export function MetricCard({
  label,
  value,
  subtext,
  colorVariant = 'default',
}: {
  label: string
  value: string
  subtext?: string
  colorVariant?: 'default' | 'danger' | 'warning' | 'success'
}) {
  const valueClass =
    colorVariant === 'danger'
      ? 'text-[#ef4444]'
      : colorVariant === 'warning'
        ? 'text-[#f59e0b]'
        : colorVariant === 'success'
          ? 'text-[#22c55e]'
          : 'text-[#ffffff]'

  return (
    <article className="rounded-xl border border-white/10 bg-[#111111] p-4">
      <p className="font-display text-xs uppercase tracking-wider text-[#a1a1aa]">{label}</p>
      <p className={`mt-2 font-display text-3xl leading-none ${valueClass}`}>{value}</p>
      {subtext ? <p className="mt-2 text-xs text-[#a1a1aa]">{subtext}</p> : null}
    </article>
  )
}
