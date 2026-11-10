import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fileTypeOf } from "@/lib/file-types";
import { notFound, route } from "@/lib/http";

// GET /api/exercises/:id/file → il file. PDF, immagini e testo si aprono nel browser,
// gli altri (Word, Excel…) si scaricano; ?download=1 lo scarica sempre.
export const GET = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();
  const ex = await db.exercise.findFirst({ where: { id, userId: user.id }, include: { file: true } });
  if (!ex?.file) throw notFound();
  const type = fileTypeOf(ex.fileName);
  const download = new URL(req.url).searchParams.get("download") === "1" || !type?.inline;
  const name = encodeURIComponent(ex.fileName);
  return new Response(new Uint8Array(ex.file.data), {
    headers: {
      "Content-Type": type?.mime ?? "application/octet-stream",
      "Content-Length": String(ex.file.data.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // Il file è un contenuto caricato: niente script, niente risorse esterne.
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
});
