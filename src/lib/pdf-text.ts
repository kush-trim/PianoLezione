// Testo di un PDF, lato server.

import { extractText, getDocumentProxy } from "unpdf";

export async function pdfText(data: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(data);
  // "%PDF" all'inizio del file.
  if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
    throw new Error("Il file non è un PDF");
  }
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
