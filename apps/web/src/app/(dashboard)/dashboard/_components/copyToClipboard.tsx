'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

export interface CopyToClipboardProps {
  text: string
  label?: string
  copiedLabel?: string
  className?: string
  iconClassName?: string
  showIcon?: boolean
}

export function CopyToClipboard({
  text,
  label = 'Copy',
  copiedLabel = 'Copied!',
  className = 'inline-flex items-center gap-1 text-xs text-zinc-300 underline hover:text-zinc-100',
  iconClassName = 'h-3.5 w-3.5',
  showIcon = true,
}: CopyToClipboardProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore clipboard errors to avoid blocking the UI.
    }
  }

  return (
    <button className={className} onClick={handleCopy} type="button">
      <span className="inline-flex items-center gap-1">
        {showIcon ? (copied ? <Check className={iconClassName} /> : <Copy className={iconClassName} />) : null}
        {copied ? copiedLabel : label}
      </span>
    </button>
  )
}
