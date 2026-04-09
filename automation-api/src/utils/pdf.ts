import { PDFDocument } from 'pdf-lib';
import logger from './logger';

/**
 * Extracts the first page from a PDF buffer (Vollmacht from Sachverständigenvertrag).
 * Validates the PDF and requires at least 2 pages.
 */
export async function extractFirstPage(pdfBuffer: Buffer): Promise<Buffer> {
  let srcDoc: PDFDocument;

  try {
    srcDoc = await PDFDocument.load(pdfBuffer);
  } catch (error) {
    logger.error({ error }, 'Failed to load PDF for Vollmacht split');
    throw new Error('Invalid PDF file — cannot extract Vollmacht');
  }

  const pageCount = srcDoc.getPageCount();
  if (pageCount < 2) {
    logger.warn({ pageCount }, 'PDF has fewer than 2 pages, cannot split Vollmacht');
    throw new Error(`PDF has only ${pageCount} page(s) — need at least 2 for Vollmacht split`);
  }

  const newDoc = await PDFDocument.create();
  const [copiedPage] = await newDoc.copyPages(srcDoc, [0]);
  newDoc.addPage(copiedPage);

  const pdfBytes = await newDoc.save();
  return Buffer.from(pdfBytes);
}
