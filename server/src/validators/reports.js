import { z } from 'zod';

export const documentReportSchema = z.strictObject({
  reason: z.enum(['copyright', 'inappropriate', 'spam', 'wrong_content', 'other']),
  details: z.string().trim().max(1000).optional().or(z.literal('')),
});
