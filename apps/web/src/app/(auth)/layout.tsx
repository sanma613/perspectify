import type { ReactNode } from 'react'
import Image from 'next/image'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#090909] px-6 pb-8 pt-16 text-white md:px-4 md:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full flex-col items-center justify-center gap-5 md:min-h-[calc(100vh-5rem)]">
        <p className="inline-flex items-center gap-2 font-display text-[11px] uppercase tracking-[0.24em] text-[#a1a1aa] md:text-[12px]">
          <Image alt="Perspectify" className="h-6 w-6 md:h-3.5 md:w-3.5" height={24} src="/favicon.svg" width={24} />
          Perspectify
        </p>

        <div className="w-full max-w-none md:max-w-[400px]">{children}</div>
      </div>
    </main>
  )
}
