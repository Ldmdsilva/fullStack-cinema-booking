import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Ticket, LayoutDashboard, CalendarDays, BookOpen, MapPin, Film, LogOut, ChevronRight } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

function AdminSidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const navItem = ({ isActive }: { isActive: boolean }) =>
    cn(
      'group flex items-center gap-3 rounded-[6px] px-3 py-2.5 text-[14px] font-medium transition-all',
      isActive
        ? 'bg-marquee-gold/15 text-marquee-gold'
        : 'text-ticket-paper/60 hover:bg-white/5 hover:text-ticket-paper',
    )

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col bg-ink">
      {/* Wordmark */}
      <div className="flex items-center gap-2.5 px-4 py-5">
        <span className="flex size-7 items-center justify-center rounded-[6px] bg-marquee-gold/20">
          <Ticket className="size-4 text-marquee-gold" />
        </span>
        <div className="flex flex-col leading-none">
          <span className="font-voice text-[18px] font-medium text-ticket-paper">
            Encore
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-marquee-gold/70">
            Backstage
          </span>
        </div>
      </div>

      {/* Tear-line separator */}
      <div className="mx-4 mb-4 border-t border-dashed border-marquee-gold/20" />

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-2">
        <NavLink to="/admin" end className={navItem}>
          <LayoutDashboard className="size-4 shrink-0" />
          Dashboard
        </NavLink>
        <NavLink to="/admin/films" className={navItem}>
          <Film className="size-4 shrink-0" />
          Films
        </NavLink>
        <NavLink to="/admin/showtimes" className={navItem}>
          <CalendarDays className="size-4 shrink-0" />
          Showtimes
        </NavLink>
        <NavLink to="/admin/bookings" className={navItem}>
          <BookOpen className="size-4 shrink-0" />
          Bookings
        </NavLink>
        <NavLink to="/admin/cinemas" className={navItem}>
          <MapPin className="size-4 shrink-0" />
          Cinemas
        </NavLink>
      </nav>

      {/* Tear-line before front-of-house link */}
      <div className="mx-4 mt-6 border-t border-dashed border-marquee-gold/20" />

      <Link
        to="/"
        className="mx-2 mt-4 flex items-center gap-2 rounded-[6px] px-3 py-2 text-[13px] text-ticket-paper/40 transition-colors hover:text-ticket-paper/70"
      >
        <ChevronRight className="size-3.5 rotate-180" />
        Front of house
      </Link>

      {/* Bottom: user */}
      <div className="mt-auto border-t border-dashed border-marquee-gold/20 mx-4 pt-4 pb-4">
        <div className="px-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-marquee-gold/60 mb-1">
            Signed in as
          </p>
          <p className="text-[13px] font-medium text-ticket-paper truncate">{user?.name}</p>
          <p className="font-mono text-[11px] text-ticket-paper/40 truncate">{user?.email}</p>
        </div>
        <button
          onClick={() => {
            logout()
            navigate('/login')
          }}
          className="mt-3 flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-[13px] text-ticket-paper/50 transition-colors hover:bg-white/5 hover:text-ticket-paper"
        >
          <LogOut className="size-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  )
}

export function AdminShell() {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 overflow-auto bg-background">
        <Outlet />
      </main>
    </div>
  )
}
