import * as authService from '../services/authService.js';
import { serializeUser } from '../serializers/userSerializer.js';

export async function getMe(req, res, next) {
  try {
    const user = await authService.getUserProfile(req.user.id);
    return res.status(200).json({ user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req, res, next) {
  try {
    const { name, email, phone } = req.body;
    const user = await authService.updateUserProfile(req.user.id, { name, email, phone });
    return res.status(200).json({ user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
}

export async function deleteMe(req, res, next) {
  try {
    await authService.deleteUserAccount(req.user.id);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}
