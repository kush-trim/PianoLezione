import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { notifications } from "@/lib/materials";

// GET /api/notifications → inviti in attesa e avvisi.
export const GET = route(async () => {
  const user = await requireUser();
  return notifications(user.id);
});
