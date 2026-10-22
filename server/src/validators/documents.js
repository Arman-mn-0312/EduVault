import { z } from 'zod';

export const allowedDocuments = Object.freeze({
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

const optionalText = (max) => z.string().trim().max(max).optional().or(z.literal(''));

export const documentMetadataSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(100),
  topic: optionalText(100),
  subtopic: optionalText(100),
  description: optionalText(2000),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  field_discipline: optionalText(100),
  course_program: optionalText(150),
  semester_study_year: optionalText(80),
  document_type: optionalText(60),
  academic_year: optionalText(20).refine((value) => !value || /^(19|20)\d{2}([/-](19|20)\d{2})?$/.test(value), 'Use a valid academic year.'),
  college_university: optionalText(200),
});

export const documentUpdateSchema = documentMetadataSchema.partial();

export function mapMetadataAliases(body) {
  const mapped = { ...body };
  if (mapped.document_name !== undefined && mapped.title === undefined) mapped.title = mapped.document_name;
  if (mapped.unit_topic !== undefined && mapped.topic === undefined) mapped.topic = mapped.unit_topic;
  if (mapped.tags_keywords !== undefined && mapped.tags === undefined) mapped.tags = mapped.tags_keywords;
  delete mapped.document_name;
  delete mapped.unit_topic;
  delete mapped.tags_keywords;
  return mapped;
}

export function sanitizeOriginalFilename(name) {
  const sanitized = String(name || '')
    .replace(/[\\/\0-\x1f\x7f]/g, '')
    .trim()
    .slice(0, 255);
  return sanitized;
}

function hasBytes(buffer, text) {
  return buffer.includes(Buffer.from(text, 'utf8'));
}

export function validateDocumentFile(file, maxFileSizeBytes) {
  if (!file) return { field: 'file', message: 'A document file is required.' };
  if (file.size <= 0 || file.size > maxFileSizeBytes) {
    return { field: 'file', message: `File must be between 1 byte and ${maxFileSizeBytes} bytes.` };
  }

  const originalFilename = sanitizeOriginalFilename(file.originalname);
  const extension = originalFilename.toLowerCase().split('.').pop();
  if (!extension || !Object.hasOwn(allowedDocuments, extension)) {
    return { field: 'file', message: 'Only .ppt, .pptx, .doc, and .docx files are supported.' };
  }
  if (file.mimetype !== allowedDocuments[extension]) {
    return { field: 'file', message: 'The file MIME type does not match its extension.' };
  }

  const signature = file.buffer.subarray(0, 8);
  const ole = Buffer.from('d0cf11e0a1b11ae1', 'hex');
  if (extension === 'ppt' || extension === 'doc') {
    if (!signature.equals(ole)) return { field: 'file', message: 'The file signature does not match its extension.' };
  } else {
    const zip = Buffer.from('504b0304', 'hex');
    const expectedFolder = extension === 'pptx' ? 'ppt/' : 'word/';
    if (!signature.subarray(0, 4).equals(zip)
      || !hasBytes(file.buffer, '[Content_Types].xml')
      || !hasBytes(file.buffer, expectedFolder)) {
      return { field: 'file', message: 'The Office document signature is invalid.' };
    }
  }
  return null;
}
