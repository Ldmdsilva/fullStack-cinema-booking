import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Ticket, LogOut, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

function Header() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'text-[14px] transition-colors hover:text-foreground',
      isActive ? 'text-foreground' : 'text-text-secondary',
    )

  return (
    <header className="sticky top-0 z-40 border-b-[0.5px] border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-5">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-[6px] bg-ink text-marquee-gold">
            <Ticket className="size-4" />
          </span>
          <span className="font-voice text-[24px] font-medium leading-none tracking-[-0.01em]">
            Encore
          </span>
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          <NavLink to="/films" className={navClass}>
            Films
          </NavLink>
          <NavLink to="/bookings" className={navClass}>
            My tickets
          </NavLink>
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 text-[14px] transition-colors hover:text-foreground',
                  isActive ? 'text-foreground' : 'text-text-secondary',
                )
              }
            >
              <LayoutDashboard className="size-3.5" />
              Admin
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  cn(
                    'hidden text-[13px] transition-colors md:inline',
                    isActive ? 'text-foreground' : 'text-text-secondary hover:text-foreground',
                  )
                }
              >
                {user.name}
              </NavLink>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  logout()
                  navigate('/')
                }}
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => navigate('/login')}>
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="mt-20 border-t-[0.5px] border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-[13px] text-text-muted sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono">ENCORE · CINEMA TICKETING</p>
        <p>A ticket you can almost tear.</p>
      </div>
    </footer>
  )
}

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius)] focus:bg-ink focus:px-4 focus:py-2 focus:text-text-on-ink"
      >
        Skip to main content
      </a>
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
