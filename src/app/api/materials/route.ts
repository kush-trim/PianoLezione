import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { splitMaterials } from "@/lib/plan-utils";

// Materiali già usati dall'utente, dal più frequente: servono come suggerimenti.
export const GET = route(async () => {
  const user = await requireUser();
  const rows = await db.phase.findMany({
    where: { plan: { userId: user.id }, materiale: { not: "" } },
    select: { materiale: true },
  });
  const count = new Map<string, { label: string; n: number }>();
  for (const r of rows) {
    for (const m of splitMaterials(r.materiale)) {
      const key = m.toLowerCase();
      const cur = count.get(key);
      if (cur) cur.n++;
      else count.set(key, { label: m, n: 1 });
    }
  }
  return [...count.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 40)
    .map((c) => c.label);
});
