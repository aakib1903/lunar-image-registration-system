import type { SensorId } from "./architecture";

export interface PlanPayload {
  name: string;
  sourceSensor: SensorId;
  referenceSensor: "lro_nac";
  sourceProductId: string | null;
  referenceProductId: string | null;
  tileOverlap: number;
  notes: string;
}

export interface MissionPlan extends PlanPayload {
  id: string;
  status: "draft";
  createdAt: string;
  updatedAt: string;
}

export class PlanInputError extends Error {
  constructor(message: string, public status = 422) {
    super(message);
    this.name = "PlanInputError";
  }
}

export function validatePlan(value: unknown): PlanPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlanInputError("A single planning object is required.");
  }
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100) {
    throw new PlanInputError("Give your plan a name between 1 and 100 characters.");
  }
  if (input.sourceSensor !== "ohrc" && input.sourceSensor !== "tmc2" && input.sourceSensor !== "iirs") {
    throw new PlanInputError("Choose exactly one supported source sensor.");
  }
  if (input.referenceSensor !== "lro_nac") {
    throw new PlanInputError("The single reference sensor must be LRO NAC.");
  }
  if (input.status !== undefined && input.status !== "draft") {
    throw new PlanInputError("Only planning drafts can be saved. Processing is not implemented.");
  }
  if (typeof input.tileOverlap !== "number" || !Number.isInteger(input.tileOverlap) || input.tileOverlap < 10 || input.tileOverlap > 50) {
    throw new PlanInputError("Tile overlap must be an integer between 10% and 50%.");
  }
  const notes = input.notes ?? "";
  if (typeof notes !== "string" || notes.length > 4000) {
    throw new PlanInputError("Planning notes must be no longer than 4,000 characters.");
  }
  function productId(key: string) {
    const id = input[key];
    if (id === undefined || id === null || id === "") return null;
    if (typeof id !== "string" || id.length > 200 || /[\u0000-\u001f]/.test(id)) {
      throw new PlanInputError("Each product ID must be a single string, up to 200 characters.");
    }
    return id.trim() || null;
  }
  return {
    name: input.name.trim(),
    sourceSensor: input.sourceSensor,
    referenceSensor: "lro_nac",
    sourceProductId: productId("sourceProductId"),
    referenceProductId: productId("referenceProductId"),
    tileOverlap: input.tileOverlap,
    notes: notes.trim(),
  };
}
