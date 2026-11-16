import { requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { createFolder, listFolders } from "@/lib/materials";
import { materialFolderCreateSchema } from "@/lib/validation";

// GET /api/material-folders → le cartelle di esercizi (con le sottocartelle): le mie e quelle condivise con me.
export const GET = route(async () => {
  const user = await requireUser();
  return listFolders(user.id);
});

// POST /api/material-folders { name, parentId? } → nuova cartella sul mio Google Drive,
// oppure sottocartella di parentId (sul Drive del proprietario della cartella principale).
export const POST = route(async (req) => {
  const user = await requireUser();
  const { name, parentId } = materialFolderCreateSchema.parse(await readJson(req));
  const f = await createFolder(user.id, name, parentId);
  return { id: f.id, name: f.name, parentId: f.parentId };
});
