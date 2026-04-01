import Link from 'next/link'
import { AuthPanel } from '../_components/auth-panel'
import { ResetPasswordForm } from './reset-password-form'

export default function ResetPasswordPage() {
  return (
    <AuthPanel
      title="Reset password"
      subtitle="Set your new password and sign back in."
    >
      <ResetPasswordForm />
      <div className="text-sm text-[#a1a1aa]">
        <Link className="hover:text-white" href="/login">
          Back to login
        </Link>
      </div>
    </AuthPanel>
  )
}
