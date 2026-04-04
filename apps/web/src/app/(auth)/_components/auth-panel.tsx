import type { ReactNode } from 'react'

export function AuthPanel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section className="w-full space-y-5 rounded-none border-0 bg-transparent p-0 md:rounded-2xl md:border md:border-white/10 md:bg-[#111111] md:p-8">
      <header className="space-y-2">
        <h1 className="font-display text-2xl leading-tight text-white">{title}</h1>
        <p className="text-sm leading-relaxed text-[#a1a1aa]">{subtitle}</p>
      </header>

      <div>{children}</div>
    </section>
  )
}
