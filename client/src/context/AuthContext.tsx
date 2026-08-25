import * as React from 'react'
import * as authApi from '@/lib/api/auth'
import { getToken, setToken } from '@/lib/tokenStore'
import type { LoginPayload, RegisterPayload, RegisterResponse, UpdateProfilePayload, User } from '@/lib/types'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  user: User | null
  token: string | null
  status: AuthStatus
  isAdmin: boolean
  login: (payload: LoginPayload) => Promise<void>
  // D14 — register never issues a token/user, only a status message; it
  // never touches auth state. `login` remains the only thing that
  // transitions status to 'authenticated'.
  register: (payload: RegisterPayload) => Promise<RegisterResponse>
  logout: () => void
  updateProfile: (payload: UpdateProfilePayload) => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [token, setTokenState] = React.useState<string | null>(() => getToken())
  const [status, setStatus] = React.useState<AuthStatus>('loading')

  // `status` starts at 'loading' so a page refresh never bounces a
  // signed-in user to /login while we confirm the token server-side.
  React.useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const existingToken = getToken()
      if (!existingToken) {
        if (!cancelled) setStatus('anonymous')
        return
      }

      try {
        const { user: me } = await authApi.getMe()
        if (!cancelled) {
          setUser(me)
          setStatus('authenticated')
        }
      } catch {
        if (!cancelled) {
          setToken(null)
          setUser(null)
          setStatus('anonymous')
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const login = React.useCallback(async (payload: LoginPayload) => {
    const { user: loggedInUser, token: newToken } = await authApi.login(payload)
    setToken(newToken)
    setTokenState(newToken)
    setUser(loggedInUser)
    setStatus('authenticated')
  }, [])

  const register = React.useCallback(async (payload: RegisterPayload) => {
    // No token/user comes back (D14) — registration only ever reports
    // status; the account still needs email verification, then a separate
    // `login` call, before `status` can become 'authenticated'.
    return authApi.register(payload)
  }, [])

  const logout = React.useCallback(() => {
    setToken(null)
    setTokenState(null)
    setUser(null)
    setStatus('anonymous')
  }, [])

  const updateProfile = React.useCallback(async (payload: UpdateProfilePayload) => {
    const { user: updated } = await authApi.updateMe(payload)
    setUser(updated)
  }, [])

  const value: AuthContextValue = {
    user,
    token,
    status,
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout,
    updateProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
