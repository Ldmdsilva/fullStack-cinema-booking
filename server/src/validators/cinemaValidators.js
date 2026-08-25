import { z } from 'zod';
import { MAX_SEATS_PER_SCREEN } from '../config/seatTiers.js';

const seatLayoutEntrySchema = z.object({
  id: z.string().trim().min(1),
  section: z.string().trim().min(1),
  row: z.string().trim().min(1),
  number: z.coerce.number().int().positive(),
});

const screenSchema = z.object({
  screenId: z.string().trim().min(1, 'Screen ID is required'),
  name: z.string().trim().min(1, 'Screen name is required'),
  seatLayout: z
    .array(seatLayoutEntrySchema)
    .min(1)
    .max(MAX_SEATS_PER_SCREEN, `Screen seat layout cannot exceed ${MAX_SEATS_PER_SCREEN} seats (§C6.2)`),
});

function hasUniqueScreenIds(screens) {
  const ids = screens.map((s) => s.screenId);
  return new Set(ids).size === ids.length;
}

export const createCinemaSchema = z
  .object({
    name: z.string().trim().min(1, 'Cinema name is required'),
    address: z.string().trim().min(1, 'Cinema address is required'),
    city: z.string().trim().min(1, 'Cinema city is required'),
    screens: z.array(screenSchema).min(1, 'At least one screen is required'),
  })
  .refine((data) => hasUniqueScreenIds(data.screens), {
    message: 'Screen IDs must be unique within a cinema',
    path: ['screens'],
  });

export const updateCinemaSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    screens: z.array(screenSchema).min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' })
  .refine((data) => !data.screens || hasUniqueScreenIds(data.screens), {
    message: 'Screen IDs must be unique within a cinema',
    path: ['screens'],
  });
