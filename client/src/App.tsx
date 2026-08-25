import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AdminShell } from '@/components/layout/AdminShell'
import { ToastProvider } from '@/components/ui/toast'
import { AuthProvider } from '@/context/AuthContext'
import { SocketProvider } from '@/context/SocketContext'
import { Button } from '@/components/ui/button'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { AdminRoute } from '@/routes/AdminRoute'
import { VerifiedRoute } from '@/routes/VerifiedRoute'
import { HomePage } from '@/pages/HomePage'
import { FilmListPage } from '@/pages/FilmListPage'
import { FilmDetailPage } from '@/pages/FilmDetailPage'
import { ShowtimePage } from '@/pages/ShowtimePage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { ConfirmationPage } from '@/pages/ConfirmationPage'
import { MyBookingsPage } from '@/pages/MyBookingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { VerifyEmailPage } from '@/pages/VerifyEmailPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { AdminDashboard } from '@/pages/admin/AdminDashboard'
import { AdminFilmsPage } from '@/pages/admin/AdminFilmsPage'
import { AdminFilmFormPage } from '@/pages/admin/AdminFilmFormPage'
import { AdminShowtimesPage } from '@/pages/admin/AdminShowtimesPage'
import { AdminShowtimeFormPage } from '@/pages/admin/AdminShowtimeFormPage'
import { AdminBookingsPage } from '@/pages/admin/AdminBookingsPage'
import { AdminCinemasPage } from '@/pages/admin/AdminCinemasPage'
import { AdminCinemaFormPage } from '@/pages/admin/AdminCinemaFormPage'
import { ProfilePage } from '@/pages/ProfilePage'

function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-xl px-5 py-28 text-center">
      <p className="eyebrow text-stamp-red">404</p>
      <h1 className="mt-3 font-voice text-[40px] font-medium tracking-[-0.02em]">
        This page isn't on the bill.
      </h1>
      <p className="mt-2 text-text-secondary">
        The link may have expired or the screening has moved on.
      </p>
      <Button className="mt-6" onClick={() => navigate('/films')}>
        Back to films
      </Button>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <ToastProvider>
            <Routes>
              {/* Public / customer shell */}
              <Route element={<AppShell />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/films" element={<FilmListPage />} />
                <Route path="/films/:id" element={<FilmDetailPage />} />
                {/* Browsing and seat selection are open to anonymous visitors
                    (FR-19-21) — ShowtimePage itself handles the 401/403 that
                    creating a hold returns for an anonymous or unverified
                    customer, prompting sign-in/verification inline rather
                    than gating the whole page. */}
                <Route path="/showtimes/:id" element={<ShowtimePage />} />
                <Route
                  path="/checkout/:holdId"
                  element={
                    <VerifiedRoute>
                      <CheckoutPage />
                    </VerifiedRoute>
                  }
                />
                <Route
                  path="/confirmation"
                  element={
                    <ProtectedRoute>
                      <ConfirmationPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/confirmation/:bookingId"
                  element={
                    <ProtectedRoute>
                      <ConfirmationPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/bookings"
                  element={
                    <ProtectedRoute>
                      <MyBookingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<LoginPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              {/* Admin shell — ink sidebar, no footer */}
              <Route
                element={
                  <AdminRoute>
                    <AdminShell />
                  </AdminRoute>
                }
              >
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/films" element={<AdminFilmsPage />} />
                <Route path="/admin/films/new" element={<AdminFilmFormPage />} />
                <Route path="/admin/films/:id/edit" element={<AdminFilmFormPage />} />
                <Route path="/admin/showtimes" element={<AdminShowtimesPage />} />
                <Route path="/admin/showtimes/new" element={<AdminShowtimeFormPage />} />
                <Route path="/admin/bookings" element={<AdminBookingsPage />} />
                <Route path="/admin/cinemas" element={<AdminCinemasPage />} />
                <Route path="/admin/cinemas/new" element={<AdminCinemaFormPage />} />
                <Route path="/admin/cinemas/:id/edit" element={<AdminCinemaFormPage />} />
              </Route>
            </Routes>
          </ToastProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
