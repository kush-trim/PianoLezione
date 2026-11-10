// Anni scolastici lato server.

import { db } from "./db";
import { yearFolderName } from "./school-calendar";

type Period = { name: string; startDate: string; endDate: string };

/**
 * Crea un anno scolastico e, se è nuovo, la sua cartella ("Anno 2027/2028").
 * Con updateOverlapping un anno che si sovrappone a quello indicato viene aggiornato invece di
 * crearne un secondo (è il caso di un calendario importato più volte).
 */
export async function createSchoolYear(
  userId: string,
  year: Period,
  { updateOverlapping = false } = {},
): Promise<{ yearId: string; created: boolean; folderId: string | null }> {
  if (updateOverlapping) {
    const overlapping = await db.schoolYear.findFirst({
      where: { userId, startDate: { lte: year.endDate }, endDate: { gte: year.startDate } },
      include: { folders: { select: { id: true }, take: 1 } },
    });
    if (overlapping) {
      await db.schoolYear.update({ where: { id: overlapping.id }, data: year });
      return { yearId: overlapping.id, created: false, folderId: overlapping.folders[0]?.id ?? null };
    }
  }

  return db.$transaction(async (tx) => {
    const created = await tx.schoolYear.create({ data: { ...year, userId } });
    const order = await tx.folder.count({ where: { userId, parentId: null } });
    const folder = await tx.folder.create({
      data: { userId, name: yearFolderName(year), color: "teal", order, schoolYearId: created.id },
    });
    return { yearId: created.id, created: true, folderId: folder.id };
  });
}
