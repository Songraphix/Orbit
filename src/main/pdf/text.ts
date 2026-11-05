import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
// @ts-expect-error -- the worker module has no type declarations; it's only handed to PDF.js.
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

// PDF.js runs its "worker" in this process (no separate file to find in the app bundle).
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfWorker;

/** The most of a PDF Orbit reads (bytes, pages, characters). */
export const PDF_LIMITS = { bytes: 30_000_000, pages: 300, chars: 200_000 } as const;

export type PdfText = {
  /** Each page's text, in order (paragraphs separated by blank lines). */
  pages: string[];
  numPages: number;
  title: string | null;
  /** Only the first part was read (very long, or many pages). */
  truncated: boolean;
};

/**
 * A PDF's text, for Orbit AI (roadmap R2 M4: only when you ask). PDF.js, text only: no fonts,
 * no images, no scripts, no rendering. Scanned PDFs (pictures of text) have none.
 */
export async function pdfText(bytes: Uint8Array): Promise<PdfText> {
  if (bytes.byteLength > PDF_LIMITS.bytes) throw new Error('This PDF is too large to read');
  const task = getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    verbosity: 0,
  });
  const doc = await task.promise;
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const info = meta?.info as { Title?: unknown } | undefined;
    const pages: string[] = [];
    let chars = 0;
    let truncated = doc.numPages > PDF_LIMITS.pages;
    for (let n = 1; n <= Math.min(doc.numPages, PDF_LIMITS.pages); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        text += item.str;
        text += item.hasEOL ? '\n' : item.str.endsWith(' ') ? '' : ' ';
      }
      text = text
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
      page.cleanup();
      if (chars + text.length > PDF_LIMITS.chars) {
        pages.push(text.slice(0, PDF_LIMITS.chars - chars));
        truncated = true;
        break;
      }
      chars += text.length;
      pages.push(text);
    }
    const title = typeof info?.Title === 'string' && info.Title.trim() ? info.Title.trim() : null;
    return { pages, numPages: doc.numPages, title, truncated };
  } finally {
    await task.destroy();
  }
}
