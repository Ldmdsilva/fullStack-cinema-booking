import type { ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

function ForbiddenPage() {
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-xl px-5 py-28 text-center">
      <p className="eyebrow text-stamp-red">403</p>
      <h1 className="mt-3 font-voice text-[40px] font-medium tracking-[-0.02em]">
        Backstage only.
      </h1>
      <p className="mt-2 text-text-secondary">
        Your account doesn't have admin access to this area.
      </p>
      <Button className="mt-6" onClick={() => navigate('/')}>
        Back to Encore
      </Button>
    </div>
  )
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { status, isAdmin } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <Spinner label="Checking your session…" />
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  if (!isAdmin) {
    return <ForbiddenPage />
  }
  return <>{children}</>
}
