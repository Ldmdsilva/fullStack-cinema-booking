// Shared render helpers for page/component tests. Pages under test lean on
// real AuthProvider/SocketProvider/ToastProvider (SocketProvider's transport
// is swapped for the fake in src/test/mocks/socket.ts, registered globally
// in setupTests.ts) plus react-router's MemoryRouter so `useParams`,
// `useNavigate`, and `useSearchParams` all behave like they do in the app.
import * as React from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { SocketProvider } from '@/context/SocketContext'
import { ToastProvider } from '@/components/ui/toast'
import { setToken } from '@/lib/tokenStore'

export interface RouteSpec {
  path: string
  element: React.ReactElement
}

export interface RenderRoutesOptions {
  /**
   * Initial history entry, e.g. '/checkout/event-1' or '/events?genre=Folk'.
   * Pass `{ pathname, state }` (react-router's InitialEntry shape) to seed
   * `location.state`, e.g. the `from` a ProtectedRoute-style redirect leaves
   * behind.
   */
  route?: InitialEntry
  /** A pre-authenticated request token ('test-token' / 'admin-token' in the MSW fixtures), seeded before mount so AuthProvider's bootstrap `GET /users/me` resolves to a signed-in user. */
  token?: string
}

/** Render one or more routed pages behind the app's real context providers. */
export function renderRoutes(routes: RouteSpec[], options: RenderRoutesOptions = {}) {
  const { route = routes[0]?.path ?? '/', token } = options
  if (token) setToken(token)

  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <SocketProvider>
          <ToastProvider>
            <Routes>
              {routes.map((r) => (
                <Route key={r.path} path={r.path} element={r.element} />
              ))}
            </Routes>
          </ToastProvider>
        </SocketProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

/** Convenience for the common case of a single routed page. */
export function renderPage(element: React.ReactElement, path: string, options: RenderRoutesOptions = {}) {
  return renderRoutes([{ path, element }], { route: options.route ?? path, ...options })
}

export function ProvidersWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SocketProvider>
        <ToastProvider>{children}</ToastProvider>
      </SocketProvider>
    </AuthProvider>
  )
}
