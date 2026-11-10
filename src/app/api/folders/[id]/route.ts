import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiError, notFound, readJson, route } from "@/lib/http";
import { folderUpdateSchema } from "@/lib/validation";

type P = { id: string };

export const PATCH = route<P>(async (req, { id }) => {
  const user = await requireUser();
  const data = folderUpdateSchema.parse(await readJson(req));
  const all = await db.folder.findMany({
    where: { userId: user.id },
    select: { id: true, parentId: true },
  });
  if (!all.some((f) => f.id === id)) throw notFound();

  if (data.parentId) {
    // Una cartella non può finire dentro sé stessa o dentro una sua sottocartella.
    const parentOf = new Map(all.map((f) => [f.id, f.parentId]));
    if (!parentOf.has(data.parentId)) throw new ApiError(400, "Cartella di destinazione non valida");
    for (let cur: string | null | undefined = data.parentId; cur; cur = parentOf.get(cur)) {
      if (cur === id) throw new ApiError(400, "Non puoi spostare una cartella dentro sé stessa");
    }
  }

  await db.folder.update({
    where: { id },
    data: {
      name: data.name,
      color: data.color,
      ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
    },
  });
});

export const DELETE = route<P>(async (_req, { id }) => {
  const user = await requireUser();
  // Le sottocartelle vengono eliminate; i piani restano, senza cartella.
  const { count } = await db.folder.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw notFound();
});
