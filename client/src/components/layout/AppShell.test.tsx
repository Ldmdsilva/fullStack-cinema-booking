import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { AuthProvider } from '@/context/AuthContext'
import { setToken } from '@/lib/tokenStore'

function Page() {
  return <p>page-content</p>
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/events']}>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Page />} />
            <Route path="/events" element={<Page />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  it('renders the header, the routed page content, and the footer', async () => {
    renderShell()
    expect(await screen.findByText('page-content')).toBeInTheDocument()
    expect(screen.getByText('Encore')).toBeInTheDocument()
    expect(screen.getByText(/cinema ticketing/i)).toBeInTheDocument()
  })

  it('shows a "Sign in" link when signed out, and shows the user + sign out when signed in', async () => {
    setToken('test-token')
    renderShell()

    expect(await screen.findByText('Alex Rivera')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument())
  })
})
