import { requireUser } from "@/lib/auth";
import { listExercises, uploadExercises } from "@/lib/exercises";
import { ApiError, route } from "@/lib/http";

// GET /api/exercises?folderId=&q= → gli esercizi che l'utente può vedere (sue cartelle e
// cartelle condivise con lui), dal più recente.
export const GET = route(async (req) => {
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  return listExercises(user.id, { q: sp.get("q")?.trim() || undefined, folderId: sp.get("folderId") || undefined });
});

// POST /api/exercises → modulo con uno o più "file", "folderId" facoltativo (predefinita:
// "I miei esercizi"), "title" facoltativo (solo con un file) e "planId" per collegarli subito.
// I file vanno su Google Drive, nella cartella scelta.
export const POST = route(async (req) => {
  const user = await requireUser();
  if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
    throw new ApiError(400, "Invia i file come modulo (multipart/form-data)");
  }
  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new ApiError(400, "Scegli almeno un file");
  if (files.length > 20) throw new ApiError(400, "Al massimo 20 file alla volta");
  return uploadExercises(user.id, files, {
    folderId: (form.get("folderId") as string | null) || null,
    title: String(form.get("title") ?? ""),
    planId: (form.get("planId") as string | null) || null,
  });
});
