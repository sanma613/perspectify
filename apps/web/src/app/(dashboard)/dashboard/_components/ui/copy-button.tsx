'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-[#ffffff] transition-colors duration-200 ease-in-out hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
      onClick={handleCopy}
      type="button"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  )
}
