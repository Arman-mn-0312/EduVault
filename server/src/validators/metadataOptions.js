import { z } from 'zod';

export const METADATA_OPTION_FIELDS = Object.freeze([
  'field_discipline',
  'course_program',
  'semester_study_year',
  'subject',
  'document_type',
  'academic_year',
  'college_university',
]);

const field = z.enum(METADATA_OPTION_FIELDS);

export const metadataOptionCreateSchema = z.strictObject({
  fieldKey: field,
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
});

export const metadataOptionUpdateSchema = z.strictObject({
  label: z.string().trim().min(1).max(200).optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});

export const metadataOptionListSchema = z.object({
  fieldKey: field.optional(),
  q: z.string().trim().max(200).optional().or(z.literal('')),
  includeInactive: z.coerce.boolean().default(false),
});
