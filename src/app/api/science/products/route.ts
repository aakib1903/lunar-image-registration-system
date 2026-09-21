import { createPlanSession, getPlanSession } from "@/lib/plan-session";
import { requestJson, scienceError, scientificJson } from "@/science/http";
import { createScientificProduct, listScientificProducts } from "@/science/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const input=await requestJson(request);
    const owner=await createPlanSession(request);
    return scientificJson({product:await createScientificProduct(owner,input)},201);
  } catch(error) { return scienceError(error); }
}
export async function GET() {
  try {
    const owner=await getPlanSession();
    return scientificJson({products:owner?await listScientificProducts(owner):[]});
  } catch(error) { return scienceError(error); }
}
