import { describe, expect, it } from 'vitest'
import { setToken } from '../tokenStore'
import * as authApi from './auth'

describe('auth api', () => {
  it('registers a new account and receives only a status message (no token/user, D14)', async () => {
    const result = await authApi.register({
      name: 'New User',
      email: 'newuser@example.com',
      password: 'password123',
      phone: '0771234567',
    })
    expect(result.message).toBeTruthy()
    expect(result).not.toHaveProperty('user')
    expect(result).not.toHaveProperty('token')
  })

  it('rejects a duplicate email on register', async () => {
    await expect(
      authApi.register({ name: 'Dup', email: 'taken@example.com', password: 'password123', phone: '0771234567' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_EMAIL' })
  })

  it('verifies an email with a token', async () => {
    const result = await authApi.verifyEmail({ token: 'good-token' })
    expect(result.verified).toBe(true)
  })

  it('resends the verification email for the authenticated caller, with no request body', async () => {
    setToken('test-token')
    const result = await authApi.resendVerification()
    expect(result.message).toBeTruthy()
  })

  it('logs in with valid credentials', async () => {
    const { user, token } = await authApi.login({ email: 'alex@example.com', password: 'Password123' })
    expect(user.email).toBe('alex@example.com')
    expect(token).toBeTruthy()
  })

  it('requests a password reset email', async () => {
    const result = await authApi.forgotPassword({ email: 'alex@example.com' })
    expect(result.message).toBeTruthy()
  })

  it('resets a password with a token', async () => {
    const result = await authApi.resetPassword({ token: 'good-token', password: 'newPassword123' })
    expect(result.message).toBeTruthy()
  })

  it('updates the current user profile', async () => {
    setToken('test-token')
    const { user } = await authApi.updateMe({ name: 'Updated Name' })
    expect(user.name).toBe('Updated Name')
  })

  it('deletes the current user account', async () => {
    setToken('test-token')
    await expect(authApi.deleteMe()).resolves.toBeUndefined()
  })
})
