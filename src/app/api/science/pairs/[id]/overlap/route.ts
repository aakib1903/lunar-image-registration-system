import { z } from "zod";
import { parseInput } from "@/science/input";
import { evaluateScientificPair } from "@/science/service";
import { requestJson, requireOwner, scienceError, scientificJson } from "@/science/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request:Request, context:{params:Promise<{id:string}>}) {
  try {
    parseInput(z.object({}).strict(),await requestJson(request,512));
    const {id}=await context.params; const owner=await requireOwner(id);
    return scientificJson({report:await evaluateScientificPair(owner,id)});
  } catch(error) { return scienceError(error); }
}
