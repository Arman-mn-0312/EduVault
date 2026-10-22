import { describe, expect, it } from 'vitest';
import { documentMetadataSchema, mapMetadataAliases } from '../src/validators/documents.js';
import { metadataOptionCreateSchema, METADATA_OPTION_FIELDS } from '../src/validators/metadataOptions.js';

describe('academic metadata contract', () => {
  it('maps the fixed public names onto existing document columns', () => {
    const body = mapMetadataAliases({
      document_name: 'Calculus notes',
      unit_topic: 'Limits',
      tags_keywords: ['calculus'],
      subject: 'Mathematics',
    });
    expect(body).toMatchObject({ title: 'Calculus notes', topic: 'Limits', tags: ['calculus'] });
    expect(body).not.toHaveProperty('document_name');
    expect(body).not.toHaveProperty('unit_topic');
    expect(body).not.toHaveProperty('tags_keywords');
  });

  it('validates optional academic fields and rejects invalid years', () => {
    expect(documentMetadataSchema.parse({ title: 'Notes', subject: 'Math', academic_year: '2025/2026' }).academic_year).toBe('2025/2026');
    expect(() => documentMetadataSchema.parse({ title: 'Notes', subject: 'Math', academic_year: 'not-a-year' })).toThrow();
    expect(documentMetadataSchema.parse({ title: 'Legacy', subject: 'Math' })).toMatchObject({ title: 'Legacy' });
  });

  it('keeps the managed field list fixed and validates option creation', () => {
    expect(METADATA_OPTION_FIELDS).toHaveLength(7);
    expect(metadataOptionCreateSchema.parse({
      fieldKey: 'course_program', value: 'BCA', label: 'BCA', sortOrder: 1,
    })).toMatchObject({ fieldKey: 'course_program', value: 'BCA' });
    expect(() => metadataOptionCreateSchema.parse({ fieldKey: 'extra_field', value: 'x', label: 'X' })).toThrow();
  });
});
