import { requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { deleteFolder, renameFolder } from "@/lib/materials";
import { materialFolderSchema } from "@/lib/validation";

type P = { id: string };

// Rinomina (anche su Drive): solo il proprietario.
export const PATCH = route<P>(async (req, { id }) => {
  const user = await requireUser();
  const { name } = materialFolderSchema.parse(await readJson(req));
  await renameFolder(user.id, id, name);
});

// Elimina la cartella per tutti: su Drive va nel cestino con i suoi file. Solo il proprietario.
export const DELETE = route<P>(async (_req, { id }) => {
  const user = await requireUser();
  await deleteFolder(user.id, id);
});
