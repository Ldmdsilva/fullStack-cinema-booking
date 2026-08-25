// A tiny module-level store for the auth token, so the axios interceptor
// (a plain module, not a component) can read it synchronously without
// depending on React context. AuthContext is the only other reader/writer.
const TOKEN_KEY = 'encore_token'

let currentToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
const listeners = new Set<(token: string | null) => void>()

export function getToken(): string | null {
  return currentToken
}

export function setToken(token: string | null): void {
  currentToken = token
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
  listeners.forEach((listener) => listener(token))
}

export function subscribeToken(listener: (token: string | null) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
