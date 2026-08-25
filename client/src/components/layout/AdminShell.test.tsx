import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AdminShell } from './AdminShell'
import { AuthProvider } from '@/context/AuthContext'
import { setToken } from '@/lib/tokenStore'
import { adminUser } from '@/test/fixtures'

function Page() {
  return <p>admin-page-content</p>
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AuthProvider>
        <Routes>
          <Route element={<AdminShell />}>
            <Route path="/admin" element={<Page />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('AdminShell', () => {
  it('renders the sidebar navigation, the signed-in admin, and the routed page', async () => {
    setToken('admin-token')
    renderShell()

    expect(await screen.findByText('admin-page-content')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
    expect(await screen.findByText(adminUser.name)).toBeInTheDocument()
  })

  it('signs out via the sidebar', async () => {
    setToken('admin-token')
    renderShell()
    await screen.findByText(adminUser.name)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(screen.queryByText(adminUser.name)).not.toBeInTheDocument())
  })
})
