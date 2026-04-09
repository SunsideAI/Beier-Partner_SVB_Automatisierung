import { PDFDocument } from 'pdf-lib';

/**
 * Extracts the first page from a PDF buffer (Vollmacht from Sachverständigenvertrag).
 */
export async function extractFirstPage(pdfBuffer: Buffer): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const newDoc = await PDFDocument.create();

  const [copiedPage] = await newDoc.copyPages(srcDoc, [0]);
  newDoc.addPage(copiedPage);

  const pdfBytes = await newDoc.save();
  return Buffer.from(pdfBytes);
}
