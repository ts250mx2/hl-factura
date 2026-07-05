declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }
  function pdf(dataBuffer: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PdfParseResult>;
  export default pdf;
}

declare module "pdf-parse";
