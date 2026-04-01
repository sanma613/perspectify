import type { EventResponse } from '../../../../../lib/api-types'

type DotStatus = EventResponse['status']

const STATUS_CLASSES: Record<DotStatus, string> = {
  DELIVERED: 'bg-[#22c55e] shadow-[0_0_0_4px_rgba(34,197,94,0.2)]',
  FAILED: 'bg-[#ef4444] shadow-[0_0_0_4px_rgba(239,68,68,0.2)]',
  PENDING: 'bg-[#f59e0b] shadow-[0_0_0_4px_rgba(245,158,11,0.2)]',
  DELIVERING: 'bg-[#f59e0b] shadow-[0_0_0_4px_rgba(245,158,11,0.2)]',
}

export function StatusDot({ status, size = 'md' }: { status: DotStatus; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'

  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-full ${sizeClass} ${STATUS_CLASSES[status]} transition-all duration-200 ease-in-out`}
    />
  )
}
