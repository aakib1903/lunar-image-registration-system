import { createPlanSession, getPlanSession } from "@/lib/plan-session";
import { requestJson, scienceError, scientificJson } from "@/science/http";
import { createScientificPair, listScientificPairs } from "@/science/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { const input=await requestJson(request,4096); const owner=await createPlanSession(request); return scientificJson({pair:await createScientificPair(owner,input)},201); }
  catch(error) { return scienceError(error); }
}
export async function GET() {
  try { const owner=await getPlanSession(); return scientificJson({pairs:owner?await listScientificPairs(owner):[]}); }
  catch(error) { return scienceError(error); }
}
