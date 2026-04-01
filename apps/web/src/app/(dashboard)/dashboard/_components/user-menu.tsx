'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, LogOut } from 'lucide-react'
import { createClient } from '../../../../lib/supabase/client'

export function UserMenu({
  displayName,
  email,
}: {
  displayName: string
  email: string
}) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const label = displayName?.trim() || email.split('@')[0] || 'User'

  async function logout() {
    setIsLoggingOut(true)
    await supabase.auth.signOut()
    setIsLoggingOut(false)
    router.replace('/login')
    router.refresh()
  }

  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!open) return
      const target = event.target as Node | null
      if (target && menuRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  return (
    <div className="relative z-50" ref={menuRef}>
      <button
        className="relative z-50 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm text-zinc-200 transition hover:bg-white/10"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-200">
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-left">
          <span className="block text-sm font-medium text-zinc-100">{label}</span>
          <span className="block text-[11px] text-zinc-500">Workspace owner</span>
        </span>
        <ChevronUp className={`ml-auto h-4 w-4 text-zinc-500 transition ${open ? '' : 'rotate-180'}`} />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-2xl border border-white/10 bg-black/85 p-2.5 shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur">
          <button
            className="w-full rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-left text-sm text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
            disabled={isLoggingOut}
            onClick={logout}
            type="button"
          >
            <span className="inline-flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
