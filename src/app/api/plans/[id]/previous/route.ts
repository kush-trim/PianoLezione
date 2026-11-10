import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { getPlan } from "@/lib/plans";

// GET /api/plans/:id/previous → la lezione precedente della stessa classe e materia
// che ha una nota "dopo la lezione" (cosa riprendere). null se non c'è.
export const GET = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  const plan = await getPlan(user.id, id);
  const first = plan.slots[0];
  if (!plan.date || !first) return null;

  const prev = await db.lessonPlan.findFirst({
    where: {
      userId: user.id,
      isTemplate: false,
      id: { not: id },
      date: { lt: plan.date },
      notaPost: { not: "" },
      slots: { some: { slot: { subject: first.subject, className: first.className } } },
    },
    orderBy: { date: "desc" },
    select: { id: true, title: true, date: true, notaPost: true },
  });
  return prev;
});
