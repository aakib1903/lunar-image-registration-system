import { getPreprocessingPlan } from "@/science/service";
import { formatPhase2Report } from "@/science/preprocessing";
import { requireOwner, privateHeaders } from "@/science/http";
import { ScienceError } from "@/science/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string; artifact: string }> }) {
  try {
    const { id, artifact } = await context.params;
    const owner = await requireOwner(id);
    const plan = await getPreprocessingPlan(owner, id);
    if (!plan) throw new ScienceError("NOT_EVALUATED", "Preprocessing has not been computed for this pair.", 409, ["Compute preprocessing with POST /api/science/pairs/{id}/preprocessing"]);
    if (artifact === "phase2_preprocessing.json") return new Response(JSON.stringify(plan, null, 2), { headers: { ...privateHeaders, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="phase2_preprocessing.json"` } });
    if (artifact === "phase2_report.md") return new Response(formatPhase2Report(plan), { headers: { ...privateHeaders, "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="phase2_report.md"` } });
    throw new ScienceError("NOT_FOUND", "Only phase2_preprocessing.json and phase2_report.md artifacts are available.", 404);
  } catch (error) {
    if (error instanceof ScienceError) return Response.json({ error: { code: error.code, message: error.message, needed: error.needed, registration: "NOT_IMPLEMENTED" } }, { status: error.status, headers: privateHeaders });
    console.error("Phase 2 artifact request failed", error);
    return Response.json({ error: { code: "SERVICE_UNAVAILABLE", message: "Artifact service unavailable.", registration: "NOT_IMPLEMENTED" } }, { status: 503, headers: privateHeaders });
  }
}
