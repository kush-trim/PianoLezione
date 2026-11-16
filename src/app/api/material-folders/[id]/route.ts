import { requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { deleteFolder, moveFolder, renameFolder } from "@/lib/materials";
import { materialFolderUpdateSchema } from "@/lib/validation";

type P = { id: string };

// Rinomina e/o sposta (anche su Drive): il proprietario, o chi ha creato la sottocartella.
// parentId: la cartella in cui metterla (dello stesso Drive); null = tra le cartelle principali.
export const PATCH = route<P>(async (req, { id }) => {
  const user = await requireUser();
  const { name, parentId } = materialFolderUpdateSchema.parse(await readJson(req));
  if (parentId !== undefined) await moveFolder(user.id, id, parentId);
  if (name !== undefined) await renameFolder(user.id, id, name);
});

// Elimina la cartella per tutti, con sottocartelle e file: su Drive va nel cestino.
// Il proprietario, o chi ha creato la sottocartella.
export const DELETE = route<P>(async (_req, { id }) => {
  const user = await requireUser();
  await deleteFolder(user.id, id);
});
