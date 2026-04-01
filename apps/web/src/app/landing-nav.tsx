'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export function LandingNav({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 48)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={`sticky top-0 z-50 h-16 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        isScrolled ? 'border-b border-white/10 bg-[#090909]/[0.92] backdrop-blur-md' : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-6 md:px-8">
        <Link className="inline-flex items-center gap-2.5" href="/">
          <span className="h-2 w-2 rounded-full bg-[#22c55e] shadow-[0_0_10px_rgba(34,197,94,0.6)]" />
          <span className="font-display text-[18px] font-bold tracking-[-0.4px] text-white">Perspectify</span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          <a className="text-sm text-zinc-400 transition hover:text-white" href="#how">
            How it works
          </a>
          <a className="text-sm text-zinc-400 transition hover:text-white" href="#pricing">
            Pricing
          </a>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          {!isAuthenticated ? (
            <Link className="hidden text-sm text-zinc-400 transition hover:text-white md:inline-flex" href="/login">
              Sign in
            </Link>
          ) : null}
          <Link
            className="rounded-lg bg-[#22c55e] px-3 py-1.5 text-sm font-bold text-black transition duration-150 hover:-translate-y-px hover:opacity-90 md:px-4 md:py-2"
            href={isAuthenticated ? '/dashboard' : '/signup'}
          >
            {isAuthenticated ? 'Go to dashboard →' : 'Start free →'}
          </Link>
        </div>
      </div>
    </nav>
  )
}
