import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { AdminDashboard } from './AdminDashboard'
import { renderPage } from '@/test/utils'
import { adminStats } from '@/test/fixtures'

describe('AdminDashboard', () => {
  it('renders KPI totals, recent bookings and top events', async () => {
    renderPage(<AdminDashboard />, '/admin')
    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
    expect(await screen.findByText(String(adminStats.totalBookings))).toBeInTheDocument()
    expect(await screen.findByText(/recent bookings/i)).toBeInTheDocument()
    expect(await screen.findByText(/top showtimes/i)).toBeInTheDocument()
  })
})
