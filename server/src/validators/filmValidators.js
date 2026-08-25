import { z } from 'zod';

export const createFilmSchema = z.object({
  title: z.string().trim().min(1, 'Film title is required'),
  synopsis: z.string().trim().min(1, 'Synopsis is required'),
  certificate: z.enum(['U', 'PG', '12A', '15', '18'], { message: 'Invalid certificate rating' }),
  runtimeMinutes: z.coerce.number().int().positive('Runtime must be a positive integer'),
  genre: z.array(z.string().trim().min(1)).min(1, 'At least one genre is required'),
  posterUrl: z.string().trim().url('posterUrl must be a valid URL').optional(),
  releaseDate: z.coerce.date({ message: 'Invalid date format' }),
});

export const updateFilmSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    synopsis: z.string().trim().min(1).optional(),
    certificate: z.enum(['U', 'PG', '12A', '15', '18'], { message: 'Invalid certificate rating' }).optional(),
    runtimeMinutes: z.coerce.number().int().positive().optional(),
    genre: z.array(z.string().trim().min(1)).min(1).optional(),
    posterUrl: z.string().trim().url('posterUrl must be a valid URL').optional(),
    releaseDate: z.coerce.date({ message: 'Invalid date format' }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });
