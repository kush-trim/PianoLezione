import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const user = await requireUser();
  return { id: user.id, name: user.name, email: user.email };
});
