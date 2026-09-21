import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { missionPlans } from "@/db/schema";
import { checkPlanOrigin, getPlanSession, planError, publicPlan, readPlanPayload, UUID_PATTERN } from "@/lib/plan-session";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const payload = await readPlanPayload(request);
    const { id } = await context.params;
    const ownerId = await getPlanSession();
    if (!ownerId || !UUID_PATTERN.test(id)) return Response.json({ error: "Plan not found in this session." }, { status: 404 });
    const [plan] = await db.update(missionPlans).set({ ...payload, updatedAt: new Date() }).where(and(eq(missionPlans.id, id), eq(missionPlans.ownerId, ownerId))).returning();
    if (!plan) return Response.json({ error: "Plan not found in this session." }, { status: 404 });
    return Response.json({ plan: publicPlan(plan) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return planError(error, "update your plan");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    checkPlanOrigin(request);
    const { id } = await context.params;
    const ownerId = await getPlanSession();
    if (!ownerId || !UUID_PATTERN.test(id)) return Response.json({ error: "Plan not found in this session." }, { status: 404 });
    const [plan] = await db.delete(missionPlans).where(and(eq(missionPlans.id, id), eq(missionPlans.ownerId, ownerId))).returning({ id: missionPlans.id });
    if (!plan) return Response.json({ error: "Plan not found in this session." }, { status: 404 });
    return Response.json({ deleted: plan.id });
  } catch (error) {
    return planError(error, "delete your plan");
  }
}
