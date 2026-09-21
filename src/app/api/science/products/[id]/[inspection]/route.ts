import { getScientificProduct } from "@/science/service";
import { requireOwner, scienceError, scientificJson } from "@/science/http";
import { ScienceError } from "@/science/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: {params:Promise<{id:string;inspection:string}>}) {
  try {
    const {id,inspection}=await context.params;
    if(!["metadata","footprint"].includes(inspection)) throw new ScienceError("NOT_FOUND","Only metadata and footprint inspection are available in Phase 1.",404);
    const owner=await requireOwner(id);
    const product=await getScientificProduct(owner,id);
    return scientificJson({productId:id,snapshot:product.snapshot,[inspection]:inspection==="metadata"?product.metadata:product.footprint,registration:"NOT_IMPLEMENTED"});
  } catch(error) { return scienceError(error); }
}
