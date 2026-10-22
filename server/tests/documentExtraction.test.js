import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { extractDocumentText, inspectZip } from '../src/services/documentExtraction.js';

const limits = {
  maxEntries: 20,
  maxExpandedBytes: 1024 * 1024,
  maxCompressionRatio: 100,
  maxProcessingMs: 1000,
  maxExtractedCharacters: 200000,
};

async function zip(entries) {
  const archive = new JSZip();
  Object.entries(entries).forEach(([name, content]) => archive.file(name, content));
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('trusted Office text extraction', () => {
  it('extracts text from PPTX slides', async () => {
    const buffer = await zip({ 'ppt/slides/slide1.xml': '<p:sld><a:t>Quantum mechanics</a:t><a:t>lecture</a:t></p:sld>' });
    const result = await extractDocumentText({ buffer, extension: 'pptx', limits });
    expect(result).toEqual({ status: 'done', text: expect.stringContaining('Quantum mechanics') });
  });

  it('extracts text from DOCX documents', async () => {
    const buffer = await zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Thermodynamics</w:t></w:r></w:p></w:body></w:document>' });
    const result = await extractDocumentText({ buffer, extension: 'docx', limits });
    expect(result).toEqual({ status: 'done', text: expect.stringContaining('Thermodynamics') });
  });

  it('handles empty documents and unsupported legacy formats explicitly', async () => {
    const empty = await extractDocumentText({ buffer: await zip({}), extension: 'pptx', limits });
    expect(empty).toEqual({ status: 'done', text: '' });
    await expect(extractDocumentText({ buffer: Buffer.from('legacy'), extension: 'doc', limits })).resolves.toEqual({ status: 'unsupported', text: null });
  });

  it('rejects malformed archives and zip bombs before extraction', async () => {
    await expect(extractDocumentText({ buffer: Buffer.from('not a zip'), extension: 'docx', limits })).rejects.toThrow();
    const bomb = await zip({ 'word/document.xml': 'x'.repeat(5000) });
    expect(() => inspectZip({ files: { one: { dir: false, name: 'one', _data: { compressedSize: 1, uncompressedSize: 5001 } } } }, { ...limits, maxExpandedBytes: 10000, maxCompressionRatio: 10 })).toThrow(/compression ratio/);
    await expect(extractDocumentText({ buffer: bomb, extension: 'docx', limits: { ...limits, maxExpandedBytes: 10 } })).rejects.toThrow(/extraction limit|compression ratio/);
  });

  it('enforces entry limits', async () => {
    const buffer = await zip({ one: 'a', two: 'b', three: 'c' });
    await expect(extractDocumentText({ buffer, extension: 'docx', limits: { ...limits, maxEntries: 2 } })).rejects.toThrow(/too many entries/);
  });
});
