import { requireUser } from "@/lib/auth";
import { createExercise, listExercises } from "@/lib/exercises";
import { ApiError, route } from "@/lib/http";

// GET /api/exercises?q= → gli esercizi, dal più recente, con i piani a cui sono collegati.
export const GET = route(async (req) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams.get("q")?.trim();
  return listExercises(user.id, q || undefined);
});

// POST /api/exercises → modulo con uno o più "file" (PDF, Word, Excel, PowerPoint, immagini…),
// "title" facoltativo (solo con un file)
// e "planId" facoltativo per collegarli subito a un piano.
export const POST = route(async (req) => {
  const user = await requireUser();
  if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
    throw new ApiError(400, "Invia i file come modulo (multipart/form-data)");
  }
  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new ApiError(400, "Scegli almeno un file");
  if (files.length > 20) throw new ApiError(400, "Al massimo 20 file alla volta");
  const title = files.length === 1 ? String(form.get("title") ?? "") : "";
  const planId = (form.get("planId") as string | null) || null;
  const out = [];
  for (const file of files) out.push(await createExercise(user.id, file, title, planId));
  return out;
});
