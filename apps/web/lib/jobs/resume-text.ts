import { unzipSync, strFromU8 } from 'fflate';
import { extractResume } from '@/lib/jobs/resume-extract';

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MAX_CHARS = 12_000;
/** Refuse DOCX parts that would inflate beyond this (zip-bomb guard). */
const MAX_UNZIPPED = 8 * 1024 * 1024;

export type ResumeKind = { mime: string; ext: 'pdf' | 'docx' };

/** Detects the real file type from its bytes (never trust the extension or the browser's MIME type). */
export function sniffResume(bytes: Uint8Array): ResumeKind | null {
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  if (isPdf) return { mime: 'application/pdf', ext: 'pdf' };
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04; // PK..
  if (isZip) {
    try {
      const files = unzipSync(bytes, { filter: (f) => (f.name === '[Content_Types].xml' || f.name === 'word/document.xml') && f.originalSize <= MAX_UNZIPPED });
      if (files['word/document.xml']) return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
    } catch { /* not a valid zip */ }
  }
  return null;
}

/**
 * Plain text of a resume in reading order, capped (autofill and the current AI review). Built on the full extractor
 * (all pages, two-column aware, headers/footers dropped); see lib/jobs/resume-extract.ts.
 */
export async function resumeText(bytes: Uint8Array, kind: ResumeKind): Promise<string> {
  const r = await extractResume(bytes, kind);
  return r.lines.join('\n').slice(0, MAX_CHARS);
}

const XML_ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };

/**
 * Plain text of a DOCX body: walks the XML once, keeping text between tags and turning paragraph ends and tabs
 * into line breaks and spaces. Entities are decoded in a single pass, so nothing is unescaped twice.
 */
export function docxText(xml: string): string {
  let out = '';
  for (const part of xml.split(/(<[^>]*>)/)) {
    if (!part) continue;
    if (part[0] === '<') {
      if (part === '</w:p>') out += '\n';
      else if (part === '<w:tab/>') out += ' ';
      continue;
    }
    out += part.replace(/&(?:lt|gt|amp|quot|apos);/g, (e) => XML_ENTITIES[e]);
  }
  return out;
}
