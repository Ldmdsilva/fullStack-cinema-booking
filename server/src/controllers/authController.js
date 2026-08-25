import * as authService from '../services/authService.js';
import { serializeUser } from '../serializers/userSerializer.js';

export async function register(req, res, next) {
  try {
    const { name, email, password, phone } = req.body;
    const result = await authService.register({ name, email, password, phone });
    // 202: account created (or already existed) but unverified — no token
    // is ever issued here (D14/FR-7).
    return res.status(202).json(result);
  } catch (error) {
    next(error);
  }
}

export async function verifyEmail(req, res, next) {
  try {
    const { token } = req.body;
    const result = await authService.verifyEmail({ token });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function resendVerification(req, res, next) {
  try {
    const result = await authService.resendVerification({ userId: req.user.id });
    return res.status(202).json(result);
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { user, token } = await authService.login({ email, password });
    return res.status(200).json({ user: serializeUser(user), token });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword({ email });
    return res.status(202).json(result);
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    const result = await authService.resetPassword({ token, newPassword: password });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
