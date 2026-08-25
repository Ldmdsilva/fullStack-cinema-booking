import type { ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

function UnverifiedPage() {
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-xl px-5 py-28 text-center">
      <p className="eyebrow text-stamp-red">Verify your email</p>
      <h1 className="mt-3 font-voice text-[36px] font-medium tracking-[-0.02em]">
        One quick step before you book.
      </h1>
      <p className="mt-2 text-text-secondary">
        Verify your email address to continue — you can resend the verification link from your
        profile.
      </p>
      <Button className="mt-6" onClick={() => navigate('/profile')}>
        Go to my profile
      </Button>
    </div>
  )
}

// Same authentication gate as ProtectedRoute, plus an email-verification
// check (FR-6). This is UX-only, same caveat as ProtectedRoute/AdminRoute —
// the server enforces EMAIL_NOT_VERIFIED (403) on every gated write
// regardless of what this guard decides.
export function VerifiedRoute({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <Spinner label="Checking your session…" />
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  if (!user?.emailVerified) {
    return <UnverifiedPage />
  }
  return <>{children}</>
}
