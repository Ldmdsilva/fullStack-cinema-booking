import { describe, expect, it } from 'vitest'
import * as devApi from './dev'

describe('dev api', () => {
  it('fetches the last mail sent to an address', async () => {
    const mail = await devApi.getLastMail('someone@example.com')
    expect(mail.to).toBe('someone@example.com')
    expect(mail.subject).toBeTruthy()
    expect(mail.html).toBeTruthy()
    expect(mail.text).toBeTruthy()
    expect(mail.sentAt).toBeTruthy()
  })

  it('rejects with MAIL_NOT_FOUND when no mail was sent to that address', async () => {
    await expect(devApi.getLastMail('unknown@example.com')).rejects.toMatchObject({ code: 'MAIL_NOT_FOUND' })
  })
})
