import { requireUser } from "@/lib/auth";
import { slotValidOn } from "@/lib/calendar";
import { db } from "@/lib/db";
import { ApiError, notFound, readJson, route } from "@/lib/http";
import { toExceptionDTO, toSlotDTO } from "@/lib/plans";
import { dateParam, exceptionSchema } from "@/lib/validation";

type P = { id: string; date: string };

// Modifica valida per un solo giorno: lezione spostata, in un'altra aula o annullata.
export const PUT = route<P>(async (req, { id, date: rawDate }) => {
  const user = await requireUser();
  const date = dateParam.parse(rawDate);
  const data = exceptionSchema.parse(await readJson(req));
  const slot = await db.timetableSlot.findFirst({ where: { id, userId: user.id } });
  if (!slot) throw notFound();
  if (!slotValidOn(toSlotDTO(slot), date)) throw new ApiError(400, "In quel giorno la lezione non c'è");

  const fields = {
    kind: data.kind,
    startTime: data.kind === "modificata" ? (data.startTime ?? null) : null,
    endTime: data.kind === "modificata" ? (data.endTime ?? null) : null,
    room: data.kind === "modificata" ? (data.room ?? null) : null,
    note: data.note,
  };
  const ex = await db.lessonException.upsert({
    where: { slotId_date: { slotId: id, date } },
    create: { slotId: id, date, ...fields },
    update: fields,
  });
  return toExceptionDTO(ex);
});

// Ripristina la lezione normale per quel giorno.
export const DELETE = route<P>(async (_req, { id, date }) => {
  const user = await requireUser();
  await db.lessonException.deleteMany({ where: { slotId: id, date, slot: { userId: user.id } } });
});
