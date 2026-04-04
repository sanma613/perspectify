'use client'

import Link from 'next/link'
import { LogIn } from 'lucide-react'
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
          <span className="font-display text-lg font-bold tracking-tight text-white">Perspectify</span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          <a className="text-sm text-zinc-400 transition hover:text-white" href="#how">
            How it works
          </a>
          <a className="text-sm text-zinc-400 transition hover:text-white" href="#pricing">
            Pricing
          </a>
        </div>

        {isAuthenticated ? (
          <div className="flex items-center">
            <Link
              className="rounded-lg bg-[#22c55e] px-3 py-1.5 text-sm font-bold text-black transition duration-150 hover:-translate-y-px hover:opacity-90 md:px-4 md:py-2"
              href="/dashboard"
            >
              Go to dashboard →
            </Link>
          </div>
        ) : (
          <>
            <div className="hidden items-center gap-4 md:flex">
              <Link className="text-sm text-zinc-400 transition-colors hover:text-white" href="/login">
                Sign in
              </Link>
              <Link
                className="font-display rounded-lg bg-green-500 px-4 py-2 text-sm font-bold text-black transition-all hover:-translate-y-[1px] hover:opacity-90"
                href="/signup"
              >
                Start free →
              </Link>
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <Link
                className="hidden min-h-[44px] items-center px-3 text-sm text-zinc-400 [@media(min-width:360px)]:flex"
                href="/login"
              >
                Sign in
              </Link>
              <Link
                aria-label="Sign in"
                className="flex min-h-[44px] items-center px-2 [@media(min-width:360px)]:hidden"
                href="/login"
              >
                <LogIn className="text-zinc-400" size={20} />
              </Link>
              <Link
                className="font-display flex min-h-[44px] items-center rounded-lg bg-green-500 px-3 py-2 text-xs font-bold text-black"
                href="/signup"
              >
                Start free →
              </Link>
            </div>
          </>
        )}
      </div>
    </nav>
  )
}
