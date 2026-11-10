import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { eventSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = eventSchema.parse(await readJson(req));
  return db.event.create({
    data: { ...data, startTime: data.startTime ?? null, endTime: data.endTime ?? null, userId: user.id },
    omit: { userId: true },
  });
});
