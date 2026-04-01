'use client'

import type { ReactNode } from 'react'

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  danger,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  children,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  danger?: boolean
  confirmLabel?: string
  cancelLabel?: string
  children?: ReactNode
}) {
  return (
    <>
      <button
        aria-hidden={!open}
        aria-label="Close modal"
        className={`fixed inset-0 z-40 bg-black/70 transition-opacity duration-200 ease-in-out ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        type="button"
      />
      <section
        aria-hidden={!open}
        className={`fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-[#111111] p-5 transition-all duration-200 ease-in-out ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <h2 className="font-display text-lg text-[#ffffff]">{title}</h2>
        <p className="mt-2 text-sm text-[#a1a1aa]">{description}</p>
        {children ? <div className="mt-3">{children}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="h-11 rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-[#ffffff] transition-colors duration-200 ease-in-out hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            onClick={onClose}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`h-11 rounded-lg px-4 text-sm font-medium transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${danger ? 'bg-[#ef4444] text-white hover:bg-red-500' : 'bg-[#22c55e] text-[#031108] hover:bg-green-400'}`}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </>
  )
}
