import { getScientificPair } from "@/science/service";
import { requireOwner, scienceError, scientificJson, privateHeaders } from "@/science/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request:Request, context:{params:Promise<{id:string}>}) {
  try {
    const {id}=await context.params; const owner=await requireOwner(id); const pair=await getScientificPair(owner,id);
    if(!pair.report) return scientificJson({state:"NOT_EVALUATED",report:null,needed:["Explicitly request overlap validation for this immutable pair."],registration:"NOT_IMPLEMENTED"},409);
    if(new URL(request.url).searchParams.get("download")==="1") return new Response(JSON.stringify(pair.report,null,2),{headers:{...privateHeaders,"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="lunaris-overlap-${id}.json"`}});
    return scientificJson({report:pair.report});
  } catch(error) { return scienceError(error); }
}
