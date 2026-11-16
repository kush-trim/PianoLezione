import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasDriveScope } from "@/lib/google-oauth";
import { route } from "@/lib/http";

// GET /api/auth/me → l'utente collegato e lo stato del suo account Google.
export const GET = route(async () => {
  const user = await requireUser();
  const g = await db.googleAccount.findUnique({ where: { userId: user.id }, select: { email: true, scopes: true, refreshTokenEnc: true } });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    google: g ? { email: g.email, driveAuthorized: !!g.refreshTokenEnc && hasDriveScope(g.scopes) } : null,
  };
});
