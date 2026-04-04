'use client'

import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function SlideOver({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  return (
    <>
      <button
        aria-hidden={!open}
        aria-label="Close panel"
        className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ease-in-out ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        type="button"
      />
      <aside
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-[480px] border-l border-white/10 bg-[#111111] transition-transform duration-200 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex h-14 items-center justify-between border-b border-white/10 px-4">
          <h2 className="font-display text-sm uppercase tracking-wider text-[#ffffff]">{title}</h2>
          <button
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#ffffff] transition-colors duration-200 ease-in-out hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="h-[calc(100%-56px)] overflow-y-auto p-4">{children}</div>
      </aside>
    </>
  )
}
