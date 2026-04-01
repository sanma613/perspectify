'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export function ActionModal({
  open,
  title,
  message,
  cancelLabel = 'Cancel',
  confirmLabel,
  confirmTone = 'primary',
  onClose,
  onConfirm,
  children,
  showCloseIcon = true,
}: {
  open: boolean
  title: string
  message: string
  cancelLabel?: string
  confirmLabel?: string
  confirmTone?: 'primary' | 'danger'
  onClose: () => void
  onConfirm?: () => void
  children?: ReactNode
  showCloseIcon?: boolean
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0a120f] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              Attention
            </p>
            <h3 className="mt-2 text-lg font-semibold text-zinc-100">{title}</h3>
          </div>
          {showCloseIcon ? (
            <button
              className="rounded-lg border border-white/15 p-1.5 text-zinc-300 transition hover:bg-white/10"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <p className="mt-3 text-sm leading-relaxed text-zinc-300">{message}</p>
        {children ? <div className="mt-4">{children}</div> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-zinc-200 transition hover:bg-black/60"
            onClick={onClose}
            type="button"
          >
            {cancelLabel}
          </button>
          {onConfirm ? (
            <button
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${confirmTone === 'danger' ? 'bg-red-500/85 text-white hover:bg-red-500' : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'}`}
              onClick={onConfirm}
              type="button"
            >
              {confirmLabel ?? 'Confirm'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
