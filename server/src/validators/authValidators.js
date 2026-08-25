import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters long').max(80),
  email: z.string().trim().email('Please provide a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  phone: z.string().trim().min(1, 'Phone number is required'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Please provide a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Please provide a valid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    email: z.string().trim().email('Please provide a valid email address').optional(),
    phone: z.string().trim().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });
