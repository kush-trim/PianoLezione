import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { renderPlanPdf } from "@/lib/pdf/PianoLezionePdf";
import { getPlan } from "@/lib/plans";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();
  const plan = await getPlan(user.id, id);
  const pdf = await renderPlanPdf(plan);

  const name = (plan.title.trim() || "senza titolo").replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 80);
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(`Piano lezione ${name}.pdf`)}`,
      "Cache-Control": "no-store",
    },
  });
});
