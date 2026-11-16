import { requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { createFolder, listFolders } from "@/lib/materials";
import { materialFolderSchema } from "@/lib/validation";

// GET /api/material-folders → le cartelle di esercizi: le mie e quelle condivise con me.
export const GET = route(async () => {
  const user = await requireUser();
  return listFolders(user.id);
});

// POST /api/material-folders { name } → nuova cartella, sul mio Google Drive.
export const POST = route(async (req) => {
  const user = await requireUser();
  const { name } = materialFolderSchema.parse(await readJson(req));
  const f = await createFolder(user.id, name);
  return { id: f.id, name: f.name };
});
