import { requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { deleteFolder, renameFolder } from "@/lib/materials";
import { materialFolderSchema } from "@/lib/validation";

type P = { id: string };

// Rinomina (anche su Drive): il proprietario, o chi ha creato la sottocartella.
export const PATCH = route<P>(async (req, { id }) => {
  const user = await requireUser();
  const { name } = materialFolderSchema.parse(await readJson(req));
  await renameFolder(user.id, id, name);
});

// Elimina la cartella per tutti, con sottocartelle e file: su Drive va nel cestino.
// Il proprietario, o chi ha creato la sottocartella.
export const DELETE = route<P>(async (_req, { id }) => {
  const user = await requireUser();
  await deleteFolder(user.id, id);
});
