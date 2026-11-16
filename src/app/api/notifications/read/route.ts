import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { markAllRead } from "@/lib/materials";

// POST /api/notifications/read → segna come letti tutti gli avvisi.
export const POST = route(async () => {
  const user = await requireUser();
  await markAllRead(user.id);
});
