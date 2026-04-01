import type { ReactNode } from 'react'
import { requireDashboardAccess } from '../../lib/session'
import { DashboardShell } from './_components/dashboard-shell'

export default async function DashboardRootLayout({ children }: { children: ReactNode }) {
  const { user } = await requireDashboardAccess()

  const displayName =
    typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : ''
  const email = user.email ?? ''
  const plan =
    typeof user.user_metadata?.plan === 'string' && user.user_metadata.plan.length > 0
      ? user.user_metadata.plan
      : 'free'

  return (
    <DashboardShell displayName={displayName} email={email} plan={plan}>
      {children}
    </DashboardShell>
  )
}
