import { requireDashboardAccess } from '../../lib/session'
import type { Metadata } from 'next'
import { OnboardingFlowPage } from './onboarding-flow-page'

export const metadata: Metadata = {
  title: 'Setup your webhook',
  robots: { index: false, follow: false },
}

export default async function OnboardingPage() {
  await requireDashboardAccess()
  return <OnboardingFlowPage />
}
