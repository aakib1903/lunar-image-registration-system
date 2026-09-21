import { proposalMarkdown } from "@/lib/architecture";

export async function GET() {
  return new Response(proposalMarkdown(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="LUNARIS-architecture-v1.0.md"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
