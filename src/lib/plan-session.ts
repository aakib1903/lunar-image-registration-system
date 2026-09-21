import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { missionPlans } from "@/db/schema";
import { PlanInputError, validatePlan } from "./plan-validation";

const COOKIE = "lunaris_planning_session";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getPlanSession() {
  const value = (await cookies()).get(COOKIE)?.value;
  return value && UUID_PATTERN.test(value) ? value : null;
}

export async function createPlanSession(request: Request) {
  const existing = await getPlanSession();
  if (existing) return existing;
  const sessionId = randomUUID();
  const store = await cookies();
  store.set(COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return sessionId;
}

export function checkPlanOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new PlanInputError("Cross-site changes are not permitted.", 403);
  }
  const origin = request.headers.get("origin");
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host).split(",")[0].trim();
  if (origin && new URL(origin).host !== host) {
    throw new PlanInputError("This request did not originate from the planning workspace.", 403);
  }
}

export async function readPlanPayload(request: Request) {
  checkPlanOrigin(request);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new PlanInputError("Send the plan as JSON.", 415);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 24_000) throw new PlanInputError("This plan is too large.", 413);
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > 24_000) throw new PlanInputError("This plan is too large.", 413);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new PlanInputError("The plan contains invalid JSON.", 400);
  }
  return validatePlan(value);
}

export function publicPlan(plan: typeof missionPlans.$inferSelect) {
  return {
    id: plan.id,
    name: plan.name,
    sourceSensor: plan.sourceSensor,
    referenceSensor: plan.referenceSensor,
    sourceProductId: plan.sourceProductId,
    referenceProductId: plan.referenceProductId,
    tileOverlap: plan.tileOverlap,
    notes: plan.notes,
    status: plan.status,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function planError(error: unknown, action: string) {
  if (error instanceof PlanInputError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(`Planning ${action} failed`, error);
  return Response.json({ error: `Could not ${action}. Please try again. No processing has been started.` }, { status: 503 });
}
