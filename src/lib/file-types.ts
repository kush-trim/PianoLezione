// Tipi di file ammessi per gli esercizi. Condiviso tra client (campo "accept") e server.
// Solo formati di documento e immagine: mai HTML, SVG o script, che il browser potrebbe eseguire.

export type FileKind = "pdf" | "word" | "excel" | "powerpoint" | "immagine" | "testo" | "altro";

const TYPES: Record<string, { mime: string; kind: FileKind; inline: boolean }> = {
  pdf: { mime: "application/pdf", kind: "pdf", inline: true },
  doc: { mime: "application/msword", kind: "word", inline: false },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "word", inline: false },
  odt: { mime: "application/vnd.oasis.opendocument.text", kind: "word", inline: false },
  rtf: { mime: "application/rtf", kind: "word", inline: false },
  pages: { mime: "application/vnd.apple.pages", kind: "word", inline: false },
  xls: { mime: "application/vnd.ms-excel", kind: "excel", inline: false },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "excel", inline: false },
  ods: { mime: "application/vnd.oasis.opendocument.spreadsheet", kind: "excel", inline: false },
  csv: { mime: "text/csv", kind: "excel", inline: false },
  numbers: { mime: "application/vnd.apple.numbers", kind: "excel", inline: false },
  ppt: { mime: "application/vnd.ms-powerpoint", kind: "powerpoint", inline: false },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "powerpoint", inline: false },
  odp: { mime: "application/vnd.oasis.opendocument.presentation", kind: "powerpoint", inline: false },
  key: { mime: "application/vnd.apple.keynote", kind: "powerpoint", inline: false },
  png: { mime: "image/png", kind: "immagine", inline: true },
  jpg: { mime: "image/jpeg", kind: "immagine", inline: true },
  jpeg: { mime: "image/jpeg", kind: "immagine", inline: true },
  gif: { mime: "image/gif", kind: "immagine", inline: true },
  webp: { mime: "image/webp", kind: "immagine", inline: true },
  heic: { mime: "image/heic", kind: "immagine", inline: false },
  txt: { mime: "text/plain; charset=utf-8", kind: "testo", inline: true },
  md: { mime: "text/plain; charset=utf-8", kind: "testo", inline: true },
  ggb: { mime: "application/vnd.geogebra.file", kind: "altro", inline: false },
  zip: { mime: "application/zip", kind: "altro", inline: false },
};

export const EXERCISE_EXTENSIONS = Object.keys(TYPES);
/** Per il campo <input type="file" accept="…">. */
export const EXERCISE_ACCEPT = EXERCISE_EXTENSIONS.map((e) => `.${e}`).join(",");

export const extensionOf = (fileName: string) => /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? "";

/** Tipo del file dal nome; null se non è ammesso. Il tipo dichiarato dal browser non conta. */
export function fileTypeOf(fileName: string) {
  return TYPES[extensionOf(fileName)] ?? null;
}

export const kindOf = (fileName: string): FileKind => fileTypeOf(fileName)?.kind ?? "altro";
