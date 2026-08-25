import { apiClient } from './client'
import type {
  ForgotPasswordPayload,
  ForgotPasswordResponse,
  LoginPayload,
  LoginResponse,
  RegisterPayload,
  RegisterResponse,
  ResendVerificationResponse,
  ResetPasswordPayload,
  ResetPasswordResponse,
  UpdateProfilePayload,
  User,
  VerifyEmailPayload,
  VerifyEmailResponse,
} from '../types'

// D14 — registration never issues a token/user, only a status message; the
// account still needs email verification before it can sign in.
export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  const { data } = await apiClient.post('/auth/register', payload)
  return data
}

export async function verifyEmail(payload: VerifyEmailPayload): Promise<VerifyEmailResponse> {
  const { data } = await apiClient.post('/auth/verify-email', payload)
  return data
}

// Authenticated endpoint, no request body — acts on the caller's own
// account (authController.resendVerification reads only `req.user.id`).
export async function resendVerification(): Promise<ResendVerificationResponse> {
  const { data } = await apiClient.post('/auth/resend-verification')
  return data
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await apiClient.post('/auth/login', payload)
  return data
}

export async function forgotPassword(payload: ForgotPasswordPayload): Promise<ForgotPasswordResponse> {
  const { data } = await apiClient.post('/auth/forgot-password', payload)
  return data
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<ResetPasswordResponse> {
  const { data } = await apiClient.post('/auth/reset-password', payload)
  return data
}

export async function getMe(): Promise<{ user: User }> {
  // Direct GET, not getWithRetry: a 401 (invalid/expired/revoked token) is
  // not a transient network failure — retrying it adds 900 ms of backoff
  // and fires the 401 interceptor's setToken(null) + redirect three times.
  const { data } = await apiClient.get<{ user: User }>('/users/me')
  return data
}

export async function updateMe(payload: UpdateProfilePayload): Promise<{ user: User }> {
  const { data } = await apiClient.patch('/users/me', payload)
  return data
}

export async function deleteMe(): Promise<void> {
  await apiClient.delete('/users/me')
}
