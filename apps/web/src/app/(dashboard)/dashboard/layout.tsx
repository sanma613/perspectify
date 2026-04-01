import type { ReactNode } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function DashboardSegmentLayout({ children }: { children: ReactNode }) {
  return <section className="mx-auto w-full max-w-[1500px]">{children}</section>
}
