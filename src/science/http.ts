import { randomUUID } from "node:crypto";
import { checkPlanOrigin, getPlanSession, UUID_PATTERN } from "@/lib/plan-session";
import { PlanInputError } from "@/lib/plan-validation";
import { readBoundedBody } from "./acquisition";
import { ScienceError } from "./types";

export const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export const scientificJson = (body: unknown, status = 200) => Response.json(body, { status, headers: privateHeaders });
export async function requestJson(request: Request, limit = 360_000): Promise<unknown> {
  checkPlanOrigin(request);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ScienceError("CONTENT_TYPE", "Use application/json; raster and archive uploads are not accepted.", 415);
  // Read the request stream incrementally. Content-Length is not trusted on its own.
  const response = new Response(request.body, { headers: request.headers });
  const bytes = await readBoundedBody(response, limit);
  try { return JSON.parse(bytes.toString("utf8")); } catch { throw new ScienceError("INVALID_JSON", "The request does not contain valid JSON.", 400); }
}
export async function requireOwner(id?: string) {
  const owner = await getPlanSession();
  if (!owner || (id && !UUID_PATTERN.test(id))) throw new ScienceError("NOT_FOUND", "This scientific record was not found in the current private session.", 404);
  return owner;
}
export function scienceError(error: unknown) {
  const traceId = randomUUID();
  if (error instanceof ScienceError) return scientificJson({ error: { code: error.code, message: error.message, needed: error.needed, traceId, registration: "NOT_IMPLEMENTED" } }, error.status);
  if (error instanceof PlanInputError) return scientificJson({ error: { code: "REQUEST_REJECTED", message: error.message, needed: [], traceId, registration: "NOT_IMPLEMENTED" } }, error.status);
  console.error("Phase 1 request failed", { traceId, error: error instanceof Error ? error.message : "Unknown error" });
  return scientificJson({ error: { code: "SERVICE_UNAVAILABLE", message: "Metadata storage or validation is temporarily unavailable. No registration was attempted.", needed: [], traceId, registration: "NOT_IMPLEMENTED" } }, 503);
}
