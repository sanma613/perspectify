import Link from 'next/link'
import { redirectAuthenticatedUsers } from '../../../lib/session'
import { AuthPanel } from '../_components/auth-panel'
import { ForgotPasswordForm } from './reset-request-form'

export default async function ForgotPasswordPage() {
  await redirectAuthenticatedUsers()

  return (
    <AuthPanel
      title="Forgot password"
      subtitle="Enter your email and we will send a reset link."
    >
      <ForgotPasswordForm />
      <div className="text-sm text-[#a1a1aa]">
        <Link className="hover:text-white" href="/login">
          Back to login
        </Link>
      </div>
    </AuthPanel>
  )
}
