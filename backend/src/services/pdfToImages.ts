import { logger } from '../utils/logger';

/**
 * Convert a PDF file to an array of base64-encoded PNG images (one per page).
 * Used because Ollama/Gemma4 supports images but NOT PDFs directly.
 */
export async function pdfToBase64Images(pdfPath: string): Promise<string[]> {
  try {
    // Dynamic import since pdf-to-img is ESM-only
    const { pdf } = await import('pdf-to-img');

    const document = await pdf(pdfPath, { scale: 2.0 });
    const images: string[] = [];

    for await (const page of document) {
      images.push(Buffer.from(page).toString('base64'));
    }

    logger.info(`Converted PDF to ${images.length} page image(s): ${pdfPath}`);
    return images;
  } catch (error) {
    logger.error(`PDF to image conversion failed for ${pdfPath}:`, error);
    throw new Error(`Failed to convert PDF to images: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
