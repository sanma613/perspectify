'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

export function CopyButton({
  value,
  label,
  disabled = false,
}: {
  value: string
  label: string
  disabled?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (disabled || !value) return

    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      className={`inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${
        disabled
          ? 'cursor-not-allowed border-white/10 bg-white/5 text-zinc-500 opacity-60'
          : 'border-white/10 bg-white/5 text-[#ffffff] hover:bg-white/10'
      }`}
      disabled={disabled}
      onClick={handleCopy}
      type="button"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  )
}
