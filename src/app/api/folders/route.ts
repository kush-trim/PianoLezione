import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJson, route } from "@/lib/http";
import { assertOwned } from "@/lib/plans";
import type { FolderDTO } from "@/lib/types";
import { folderCreateSchema } from "@/lib/validation";

export const GET = route(async () => {
  const user = await requireUser();
  const folders = await db.folder.findMany({
    where: { userId: user.id },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { plans: { where: { isTemplate: false } } } } },
  });
  return folders.map(
    (f): FolderDTO => ({
      id: f.id,
      parentId: f.parentId,
      name: f.name,
      color: f.color,
      order: f.order,
      planCount: f._count.plans,
    }),
  );
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = folderCreateSchema.parse(await readJson(req));
  await assertOwned(user.id, { folderId: data.parentId });
  const order = await db.folder.count({ where: { userId: user.id, parentId: data.parentId ?? null } });
  const f = await db.folder.create({
    data: {
      userId: user.id,
      name: data.name,
      parentId: data.parentId ?? null,
      color: data.color ?? "slate",
      order,
    },
  });
  return { id: f.id, parentId: f.parentId, name: f.name, color: f.color, order: f.order, planCount: 0 };
});
