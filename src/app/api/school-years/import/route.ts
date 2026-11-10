import { ZodError } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, readJson, route } from "@/lib/http";
import { fetchPublic } from "@/lib/ical";
import { pdfText } from "@/lib/pdf-text";
import { parseSchoolCalendar } from "@/lib/school-calendar";
import { calendarImportSchema } from "@/lib/validation";

const MAX_PDF = 10_000_000;

// POST /api/school-years/import → legge il calendario scolastico e restituisce cosa ha capito,
// senza salvare nulla: la conferma passa da /api/school-years/import/apply.
// Corpo: JSON { url } (PDF in rete) o { text } (testo incollato), oppure un modulo con il campo "file" (PDF).
export const POST = route(async (req) => {
  await requireUser();
  let text: string;
  try {
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) throw new ApiError(400, "Scegli un file PDF");
      if (file.size > MAX_PDF) throw new ApiError(400, "Il PDF è troppo grande");
      text = await pdfText(await file.arrayBuffer());
    } else {
      const { url, text: raw } = calendarImportSchema.parse(await readJson(req));
      if (raw?.trim()) text = raw;
      else if (url) {
        if (!url.startsWith("https://")) throw new ApiError(400, "L'indirizzo deve iniziare con https://");
        text = await pdfText(await fetchPublic(url, { accept: "application/pdf", maxBytes: MAX_PDF, what: "Il sito del calendario" }));
      } else throw new ApiError(400, "Indica un indirizzo, un file o il testo del calendario");
    }
  } catch (e) {
    if (e instanceof ApiError || e instanceof ZodError) throw e;
    throw new ApiError(400, e instanceof Error ? e.message : "Documento non leggibile");
  }

  const result = parseSchoolCalendar(text);
  if (!result.year && result.holidays.length === 0) {
    throw new ApiError(400, "Nel documento non ho trovato date di inizio, fine o vacanze. Puoi inserirle a mano.");
  }
  return result;
});
