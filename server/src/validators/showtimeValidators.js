import { z } from 'zod';

const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ObjectId');

export const createShowtimeSchema = z.object({
  filmRef: objectIdSchema,
  cinemaRef: objectIdSchema,
  screenId: z.string().trim().min(1, 'screenId is required'),
  startsAt: z.coerce.date({ message: 'Invalid startsAt date format' }),
  basePrice: z.coerce.number().positive('basePrice must be a positive number'),
});
