import { z } from 'zod';

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(25);

export const adminListSchema = z.object({
  q: z.string().trim().max(200).optional().or(z.literal('')),
  status: z.string().trim().max(30).optional().or(z.literal('')),
  role: z.enum(['student', 'admin']).optional(),
  sort: z.string().trim().max(40).optional().or(z.literal('')),
  page,
  limit,
});

export const adminDocumentListSchema = adminListSchema.extend({
  fileType: z.enum(['ppt', 'pptx', 'doc', 'docx']).optional(),
  fieldDiscipline: z.string().trim().max(100).optional().or(z.literal('')),
  courseProgram: z.string().trim().max(150).optional().or(z.literal('')),
  semesterStudyYear: z.string().trim().max(80).optional().or(z.literal('')),
  documentType: z.string().trim().max(60).optional().or(z.literal('')),
  academicYear: z.string().trim().max(20).optional().or(z.literal('')),
  collegeUniversity: z.string().trim().max(200).optional().or(z.literal('')),
});

export const accountStatusSchema = z.strictObject({ status: z.enum(['active', 'suspended']) });

export const moderationSchema = z.strictObject({
  status: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const reportStatusSchema = z.strictObject({
  status: z.enum(['resolved', 'dismissed', 'open']),
});
