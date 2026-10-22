import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional().or(z.literal(''));

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  subject: z.string().trim().max(100).optional().or(z.literal('')),
  topic: z.string().trim().max(100).optional().or(z.literal('')),
  fieldDiscipline: z.string().trim().max(100).optional().or(z.literal('')),
  courseProgram: z.string().trim().max(150).optional().or(z.literal('')),
  semesterStudyYear: z.string().trim().max(80).optional().or(z.literal('')),
  documentType: z.string().trim().max(60).optional().or(z.literal('')),
  academicYear: z.string().trim().max(20).optional().or(z.literal('')),
  collegeUniversity: z.string().trim().max(200).optional().or(z.literal('')),
  tagsKeyword: z.string().trim().max(100).optional().or(z.literal('')),
  fileType: z.enum(['ppt', 'pptx', 'doc', 'docx']).optional().or(z.literal('')),
  from: date,
  to: date,
  sort: z.enum(['relevance', 'newest', 'downloads']).default('relevance'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const suggestionQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(8).default(8),
});
