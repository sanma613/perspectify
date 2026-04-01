'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'

type FlashTone = 'error' | 'success' | 'info'

export function FlashMessage({
  message,
  tone,
  onDone,
  durationMs = 3200,
}: {
  message: string | null
  tone: FlashTone
  onDone?: () => void
  durationMs?: number
}) {
  const [visible, setVisible] = useState(false)
  const [activeMessage, setActiveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!message) {
      setVisible(false)
      return
    }

    setActiveMessage(message)

    const enterTimer = setTimeout(() => {
      setVisible(true)
    }, 16)

    const startExitAt = Math.max(700, durationMs - 420)

    const hideTimer = setTimeout(() => {
      setVisible(false)
    }, startExitAt)

    const clearTimer = setTimeout(() => {
      setActiveMessage(null)
      onDone?.()
    }, durationMs)

    return () => {
      clearTimeout(enterTimer)
      clearTimeout(hideTimer)
      clearTimeout(clearTimer)
    }
  }, [durationMs, message, onDone])

  const hasMessage = Boolean(activeMessage)

  const toneStyles: Record<FlashTone, string> = {
    error: 'border-red-400/35 bg-red-500/12 text-red-200',
    success: 'border-emerald-400/35 bg-emerald-500/12 text-emerald-200',
    info: 'border-cyan-400/35 bg-cyan-500/12 text-cyan-200',
  }

  const Icon =
    tone === 'error' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info

  return (
    <div
      aria-live="polite"
      className={`overflow-hidden transition-all duration-400 ease-out ${hasMessage ? 'mb-2 max-h-28' : 'mb-0 max-h-0'}`}
      role="status"
    >
      <div
        className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm transition-all duration-300 ${toneStyles[tone]} ${visible ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{activeMessage}</p>
      </div>
    </div>
  )
}