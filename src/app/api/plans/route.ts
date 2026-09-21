import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { missionPlans } from "@/db/schema";
import { createPlanSession, getPlanSession, planError, publicPlan, readPlanPayload } from "@/lib/plan-session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ownerId = await getPlanSession();
    if (!ownerId) return Response.json({ plans: [] }, { headers: { "Cache-Control": "private, no-store" } });
    const plans = await db.select().from(missionPlans).where(eq(missionPlans.ownerId, ownerId)).orderBy(desc(missionPlans.updatedAt)).limit(100);
    return Response.json({ plans: plans.map(publicPlan) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return planError(error, "load your plans");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await readPlanPayload(request);
    const ownerId = await createPlanSession(request);
    const [total] = await db.select({ value: count() }).from(missionPlans).where(eq(missionPlans.ownerId, ownerId));
    if (total.value >= 100) return Response.json({ error: "This session has reached its 100-plan limit. Remove an unused draft first." }, { status: 429 });
    const [plan] = await db.insert(missionPlans).values({ ...payload, ownerId }).returning();
    return Response.json({ plan: publicPlan(plan) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return planError(error, "save your plan");
  }
}
