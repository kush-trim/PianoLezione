import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { storage } from "@/lib/materials";

// GET /api/material-folders/storage → spazio occupato dai file di PianoStudio sul mio Drive
// e spazio del Drive intero (usato e totale).
export const GET = route(async () => {
  const user = await requireUser();
  return storage(user.id);
});
