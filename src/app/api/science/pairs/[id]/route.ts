import { getScientificPair } from "@/science/service";
import { requireOwner, scienceError, scientificJson } from "@/science/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request:Request, context:{params:Promise<{id:string}>}) {
  try { const {id}=await context.params; const owner=await requireOwner(id); return scientificJson({pair:await getScientificPair(owner,id)}); }
  catch(error) { return scienceError(error); }
}
