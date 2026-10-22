import { describe, expect, it } from 'vitest';
import { escapePostgrestPattern } from '../src/repositories/adminRepository.js';

describe('admin query filters', () => {
  it('escapes PostgREST filter syntax characters in admin search text', () => {
    expect(escapePostgrestPattern('a,b(c).*\\d')).toBe('a\\,b\\(c\\)\\.\\*\\\\d');
  });
});
