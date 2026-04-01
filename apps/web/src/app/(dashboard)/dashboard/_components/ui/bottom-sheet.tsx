'use client'

import { X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxHeight?: string
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = '80vh',
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <>
      <button
        aria-hidden={!open}
        aria-label="Close sheet"
        className={`fixed inset-0 z-[59] bg-black/70 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        type="button"
      />

      <section
        aria-hidden={!open}
        className={`fixed bottom-0 left-0 right-0 z-[60] rounded-t-[20px] border-t border-white/10 bg-[#1a1a1a] transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight, paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-white/20" />

        <header className="flex items-center justify-between border-b border-white/10 px-6 py-3">
          <h2 className="font-display text-base text-white">{title ?? 'Details'}</h2>
          <button
            aria-label="Close"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#a1a1aa] hover:bg-white/5 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-4">{children}</div>
      </section>
    </>,
    document.body
  )
}
