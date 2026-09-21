import { z } from "zod";
import { MAX_METADATA_BYTES, ScienceError } from "./types";

const uploaded = z.object({
  kind: z.literal("upload"),
  fileName: z.string().min(1).max(180).refine((name) => !/[\\/\u0000-\u001f]/.test(name), "Use a file name, not a filesystem path."),
  contentBase64: z.string().min(4).max(Math.ceil(MAX_METADATA_BYTES / 3) * 4),
  scope: z.enum(["COMPLETE_METADATA_FILE", "ATTACHED_LABEL_ONLY"]),
  originalByteLength: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  claimedArchiveUrl: z.string().url().max(2000).optional(),
}).strict();
const archived = z.object({ kind: z.literal("archive"), url: z.string().url().max(2000) }).strict();
export const productInput = z.object({
  role: z.enum(["source", "reference"]),
  sensor: z.enum(["ohrc", "tmc2", "iirs", "lro_nac"]),
  input: z.discriminatedUnion("kind", [uploaded, archived]),
}).strict().superRefine((value, ctx) => {
  if (value.role === "source" && value.sensor === "lro_nac") ctx.addIssue({ code: "custom", message: "Source must be exactly one OHRC, TMC-2, or IIRS product." });
  if (value.role === "reference" && value.sensor !== "lro_nac") ctx.addIssue({ code: "custom", message: "Reference must be exactly one LRO NAC image." });
});
export const pairInput = z.object({ sourceProductId: z.string().uuid(), referenceProductId: z.string().uuid() }).strict().refine((pair) => pair.sourceProductId !== pair.referenceProductId, "Source and reference must be different logical products.");
export type ProductSubmission = z.infer<typeof productInput>;
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ScienceError("INVALID_INPUT", result.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`).join("; "));
  return result.data;
}
export function decodeUpload(content: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) throw new ScienceError("INVALID_ENCODING", "Metadata must be canonical base64 of its original bytes.");
  const bytes = Buffer.from(content, "base64");
  if (!bytes.length || bytes.length > MAX_METADATA_BYTES) throw new ScienceError("METADATA_LIMIT", "Metadata must be nonempty and at most 256 KiB.", 413);
  return bytes;
}
