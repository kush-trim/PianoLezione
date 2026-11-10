import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { getPlan, type Snapshot } from "@/lib/plans";
import type { VersionDTO } from "@/lib/types";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  await getPlan(user.id, id); // controllo di proprietà
  const versions = await db.planVersion.findMany({
    where: { planId: id },
    orderBy: { createdAt: "desc" },
  });
  return versions.map((v): VersionDTO => {
    const s = JSON.parse(v.snapshot) as Snapshot;
    return {
      id: v.id,
      createdAt: v.createdAt.toISOString(),
      title: s.title,
      phaseCount: s.phases.length,
      totalMin: s.phases.reduce((sum, p) => sum + p.durationMin, 0),
    };
  });
});
