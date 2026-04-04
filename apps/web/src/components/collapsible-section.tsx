'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export function CollapsibleSection({
  label,
  defaultOpen,
  children,
}: {
  label: string
  defaultOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setOpen((value) => !value)}
        className="mt-3 flex w-full items-center gap-2 text-left text-xs text-zinc-600 transition-colors hover:text-zinc-400"
        type="button"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label}
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  )
}
