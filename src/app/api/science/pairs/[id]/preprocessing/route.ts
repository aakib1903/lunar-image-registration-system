import { createPreprocessingPlan, getPreprocessingPlan } from "@/science/service";
import { requireOwner, requestJson, scienceError, scientificJson, privateHeaders } from "@/science/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const owner = await requireOwner(id);
    const body = await requestJson(request, 8192);
    if (!body || typeof body !== "object") throw new (await import("@/science/types")).ScienceError("INVALID_INPUT", "Request body must be a JSON object.");
    const input = { ...(body as Record<string, unknown>), pairId: id };
    const { plan, markdown } = await createPreprocessingPlan(owner, input);
    return scientificJson({ pairId: id, plan, markdown });
  } catch (error) { return scienceError(error); }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const owner = await requireOwner(id);
    const plan = await getPreprocessingPlan(owner, id);
    if (!plan) return scientificJson({ pairId: id, plan: null, state: "NOT_EVALUATED", needed: ["Explicitly request preprocessing for this pair."] }, 409);
    if (new URL(_request.url).searchParams.get("download") === "1") {
      return new Response(JSON.stringify(plan, null, 2), { headers: { ...privateHeaders, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="lunaris-preprocessing-${id}.json"` } });
    }
    return scientificJson({ pairId: id, plan });
  } catch (error) { return scienceError(error); }
}
