import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#111111] p-6 text-center">
      <h2 className="font-display text-xl text-[#ffffff]">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-[#a1a1aa]">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  )
}
