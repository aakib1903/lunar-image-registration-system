import LunarisWorkspace from "@/components/lunaris-workspace";
import type { ViewId } from "@/lib/architecture";

export const dynamic = "force-dynamic";
const validViews: ViewId[] = ["workspace", "architecture", "pipeline", "quality", "plans", "sources"];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const { view } = await searchParams;
  const initialView: ViewId = typeof view === "string" && validViews.includes(view as ViewId) ? view as ViewId : "workspace";
  return <LunarisWorkspace initialView={initialView}/>;
}
