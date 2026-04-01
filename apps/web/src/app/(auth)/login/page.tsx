import Link from 'next/link'
import type { Metadata } from 'next'
import { redirectAuthenticatedUsers } from '../../../lib/session'
import { AuthPanel } from '../_components/auth-panel'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Perspectify account.',
  robots: { index: false, follow: false },
}

export default async function LoginPage() {
  await redirectAuthenticatedUsers()

  return (
    <AuthPanel
      title="Sign in"
      subtitle="Access your dashboard and active webhook delivery triage."
    >
      <LoginForm />
      <div className="border-t border-white/10 pt-4 text-sm text-[#a1a1aa]">
        <p>
          Don&apos;t have an account?{' '}
          <Link className="text-white hover:text-green-300" href="/signup">
            Sign up
          </Link>
        </p>
      </div>
    </AuthPanel>
  )
}
