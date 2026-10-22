import JSZip from 'jszip';
import mammoth from 'mammoth';
import { XMLParser } from 'fast-xml-parser';

const XML_PARSER = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });

function deadline(start, limitMs) {
  if (Date.now() - start > limitMs) throw new Error('document extraction time limit exceeded');
}

function withDeadline(promise, start, limitMs) {
  const remaining = Math.max(1, limitMs - (Date.now() - start));
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('document extraction time limit exceeded')), remaining);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function collectText(value, output, start, limitMs) {
  deadline(start, limitMs);
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) output.push(text);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, output, start, limitMs));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectText(item, output, start, limitMs));
  }
}

function inspectZip(zip, { maxEntries, maxExpandedBytes, maxCompressionRatio }) {
  const entries = Object.values(zip.files);
  if (entries.length > maxEntries) throw new Error('document archive contains too many entries');
  let expandedBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const compressed = entry._data?.compressedSize || 0;
    const expanded = entry._data?.uncompressedSize || 0;
    expandedBytes += expanded;
    if (expandedBytes > maxExpandedBytes) throw new Error('document archive expands beyond the extraction limit');
    if (compressed > 0 && expanded / compressed > maxCompressionRatio) {
      throw new Error('document archive compression ratio exceeds the extraction limit');
    }
  }
  return entries;
}

async function extractPptx(buffer, limits) {
  const start = Date.now();
  const zip = await withDeadline(JSZip.loadAsync(buffer, { checkCRC32: true }), start, limits.maxProcessingMs);
  const entries = inspectZip(zip, limits);
  const output = [];
  for (const entry of entries) {
    if (!/^ppt\/(slides|notesSlides)\/.*\.xml$/i.test(entry.name)) continue;
    deadline(start, limits.maxProcessingMs);
    const xml = await withDeadline(entry.async('string'), start, limits.maxProcessingMs);
    collectText(XML_PARSER.parse(xml), output, start, limits.maxProcessingMs);
  }
  return output.join('\n').slice(0, limits.maxExtractedCharacters);
}

async function extractDocx(buffer, limits) {
  const start = Date.now();
  const zip = await withDeadline(JSZip.loadAsync(buffer, { checkCRC32: true }), start, limits.maxProcessingMs);
  inspectZip(zip, limits);
  deadline(start, limits.maxProcessingMs);
  const result = await withDeadline(mammoth.extractRawText({ buffer }), start, limits.maxProcessingMs);
  deadline(start, limits.maxProcessingMs);
  return String(result.value || '').replace(/\s+/g, ' ').trim().slice(0, limits.maxExtractedCharacters);
}

export async function extractDocumentText({ buffer, extension, limits }) {
  if (extension === 'doc' || extension === 'ppt') return { status: 'unsupported', text: null };
  if (extension !== 'docx' && extension !== 'pptx') return { status: 'unsupported', text: null };
  const text = extension === 'docx' ? await extractDocx(buffer, limits) : await extractPptx(buffer, limits);
  return { status: 'done', text };
}

export { inspectZip };
