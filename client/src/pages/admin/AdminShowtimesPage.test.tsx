import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminShowtimesPage } from './AdminShowtimesPage'
import { renderPage } from '@/test/utils'
import { adminShowtimeA, adminShowtimeB } from '@/test/fixtures'

describe('AdminShowtimesPage', () => {
  it('lists showtimes with a search filter', async () => {
    const user = userEvent.setup()
    renderPage(<AdminShowtimesPage />, '/admin/showtimes')
    await screen.findByText(adminShowtimeA.film!.title!)
    expect(screen.getByText(adminShowtimeB.film!.title!)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/search showtimes/i), adminShowtimeA.film!.title!)
    expect(screen.getByText(adminShowtimeA.film!.title!)).toBeInTheDocument()
    expect(screen.queryByText(adminShowtimeB.film!.title!)).not.toBeInTheDocument()
  })

  it('opens and dismisses the cancel confirmation modal', async () => {
    const user = userEvent.setup()
    renderPage(<AdminShowtimesPage />, '/admin/showtimes')
    await screen.findByText(adminShowtimeA.film!.title!)

    await user.click(screen.getAllByTitle('Cancel showtime')[0])
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /keep showtime/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('cancels a showtime after confirming', async () => {
    const user = userEvent.setup()
    renderPage(<AdminShowtimesPage />, '/admin/showtimes')
    await screen.findByText(adminShowtimeA.film!.title!)

    await user.click(screen.getAllByTitle('Cancel showtime')[0])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^cancel showtime$/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
