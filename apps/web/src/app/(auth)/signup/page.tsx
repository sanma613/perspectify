import Link from 'next/link'
import type { Metadata } from 'next'
import { redirectAuthenticatedUsers } from '../../../lib/session'
import { AuthPanel } from '../_components/auth-panel'
import { SignupForm } from './signup-form'

export const metadata: Metadata = {
  title: 'Start free - No credit card required',
  description:
    'Create your free Perspectify account and start capturing Stripe webhooks in under 5 minutes.',
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://perspectify.com/signup' },
}

export default async function SignupPage() {
  await redirectAuthenticatedUsers()

  return (
    <AuthPanel
      title="Create account"
      subtitle="Set up Perspectify and continue to email confirmation."
    >
      <SignupForm />
      <div className="border-t border-white/10 pt-4 text-sm text-[#a1a1aa]">
        <p>
          Already have an account?{' '}
          <Link className="text-white hover:text-green-300" href="/login">
            Sign in
          </Link>
        </p>
      </div>
    </AuthPanel>
  )
}
