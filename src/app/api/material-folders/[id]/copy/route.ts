import { requireUser } from "@/lib/auth";
import { copyFolderToMyDrive } from "@/lib/folder-copy";
import { route } from "@/lib/http";

// POST /api/material-folders/:id/copy → copia la cartella (sottocartelle e file compresi)
// sul mio Google Drive, come nuova cartella tra le mie. Anche una cartella condivisa con me.
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  return copyFolderToMyDrive(user.id, id);
});
