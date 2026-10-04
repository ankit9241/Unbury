// Use Node's native require to bypass Webpack bundling of pdf-parse / pdfjs-dist
// which fails in Next.js Server Components with "TypeError: Object.defineProperty called on non-object"
function getPDFParseClass() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeRequire = eval("require");
  const pdfParseModule = nodeRequire("pdf-parse");
  return pdfParseModule.PDFParse || pdfParseModule.default || pdfParseModule;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const PDFParseClass = getPDFParseClass();
  const parser = new PDFParseClass({ data: buffer });
  try {
    const result = await parser.getText();
    const text = (result?.text || "").replace(/-- \d+ of \d+ --/g, "").trim();
    return text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}
