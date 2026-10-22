import { z } from 'zod';

// strictObject: unknown keys (role, status, id, email...) are rejected, not silently dropped,
// so privilege-escalation attempts surface as 400 instead of looking like they worked.
export const updateProfileSchema = z.strictObject({
  fullName: z
    .string({ error: 'Full name is required' })
    .trim()
    .min(1, 'Full name is required')
    .max(100, 'Full name must be 100 characters or fewer'),
});
