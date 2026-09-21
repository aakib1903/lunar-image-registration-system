import { createHash } from "node:crypto";
import { SCIENCE_VERSION, ScienceError, type AnisotropicScaleConfig, type FootprintInspection, type GsdResult, type MetadataInspection, type Orientation, type OrientationCandidate, type OverlapPlan, type OverlapReport, type Phase2PreprocessingPlan, type Point, type PreprocessingStatus, type Provenance, type ResamplingPlan, type ScientificPair, type ScientificProduct, type Tile, type TilingPlan } from "./types";
import { inspectGsd } from "./gsd";

export interface CommonGsdOptions {
  // Target GSD in m/pixel. If null, defaults to coarser of source/reference (never finer).
  targetMetresPerPixel?: number | null;
}
export interface CommonGsdResult {
  status: "EXACT" | "COARSER_OF_TWO" | "CONFIGURED" | "GSD_UNAVAILABLE";
  targetMetresPerPixel: number | null;
  provenance: Provenance[];
  reason?: string;
  required?: string[];
  limitations?: string[];
}

export function planCommonGsd(sourceGsd: GsdResult, referenceGsd: GsdResult, options: CommonGsdOptions = {}): CommonGsdResult {
  const provenance = [...sourceGsd.provenance, ...referenceGsd.provenance];
  if (sourceGsd.representative === null || referenceGsd.representative === null) {
    return { status: "GSD_UNAVAILABLE", targetMetresPerPixel: null, provenance, reason: "Authoritative GSD is unavailable for at least one product.", required: [...sourceGsd.missing.map(item => `Source: ${item}`), ...referenceGsd.missing.map(item => `Reference: ${item}`)] };
  }
  const coarser = Math.max(sourceGsd.representative, referenceGsd.representative);
  const finer = Math.min(sourceGsd.representative, referenceGsd.representative);
  if (options.targetMetresPerPixel === null || options.targetMetresPerPixel === undefined) {
    return { status: "COARSER_OF_TWO", targetMetresPerPixel: coarser, provenance, limitations: [`Default target is the coarser GSD (${coarser} m/pixel); finer than coarser would invent detail.`] };
  }
  const target = options.targetMetresPerPixel;
  if (!Number.isFinite(target) || target <= 0) throw new ScienceError("INVALID_GSD_TARGET", `Target GSD must be a finite positive number in m/pixel; received ${target}.`);
  if (target < coarser * (1 - 1e-9)) throw new ScienceError("INVALID_GSD_TARGET", `Target GSD ${target} m/pixel is finer than the coarser input (${coarser} m/pixel). Phase 2 does not invent detail by upsampling.`);
  if (target > 100000) throw new ScienceError("INVALID_GSD_TARGET", `Target GSD ${target} m/pixel exceeds the configured bound of 100000 m/pixel.`);
  if (Math.abs(target - coarser) / coarser < 1e-6) return { status: "COARSER_OF_TWO", targetMetresPerPixel: coarser, provenance, limitations: [`Configured target matches coarser input.`] };
  return { status: "CONFIGURED", targetMetresPerPixel: target, provenance, limitations: [`Target ${target} m/pixel is coarser than both inputs (finer: ${finer}, coarser: ${coarser}); downsampling.`] };
}

export interface ResamplingOptions {
  // Target GSD in m/pixel (required). Interpolation defaults to AREA_AVERAGE for downsampling.
  targetMetresPerPixel: number;
  interpolation?: ResamplingPlan["interpolation"];
}
export function planResampling(product: ScientificProduct, options: ResamplingOptions): ResamplingPlan | null {
  const width = product.metadata.fields.width?.value;
  const height = product.metadata.fields.height?.value;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const gsd = inspectGsd(product.metadata, product.snapshot);
  if (gsd.representative === null) return null;
  const target = options.targetMetresPerPixel;
  const sampleScale = target / (gsd.sampleMetresPerPixel ?? gsd.representative);
  const lineScale = target / (gsd.lineMetresPerPixel ?? gsd.representative);
  const outputWidth = Math.max(1, Math.round(width / sampleScale));
  const outputHeight = Math.max(1, Math.round(height / lineScale));
  const interpolation = options.interpolation ?? (sampleScale >= 1 && lineScale >= 1 ? "AREA_AVERAGE" : "NEAREST");
  const provenance = [...gsd.provenance, ...(product.metadata.fields.width?.provenance ?? []), ...(product.metadata.fields.height?.provenance ?? [])];
  const limitations: string[] = [];
  if (sampleScale < 1 || lineScale < 1) limitations.push(`Upsampling requested (scale ${sampleScale.toFixed(4)}×, ${lineScale.toFixed(4)}×); Phase 2 does not invent detail.`);
  return { inputWidth: width, inputHeight: height, inputGsd: gsd, targetGsdMetresPerPixel: target, outputWidth, outputHeight, sampleScaleFactor: sampleScale, lineScaleFactor: lineScale, interpolation, provenance, limitations };
}

export interface TilingOptions {
  longAxisTileLength?: number;
  longAxisTileOverlap?: number;
  orientationHypothesis?: Orientation;
}
export function planTiling(product: ScientificProduct, options: TilingOptions = {}): TilingPlan | null {
  const width = product.metadata.fields.width?.value;
  const height = product.metadata.fields.height?.value;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const tileLength = options.longAxisTileLength ?? 1024;
  const tileOverlap = options.longAxisTileOverlap ?? 0.1;
  if (!Number.isInteger(tileLength) || tileLength < 16) throw new ScienceError("INVALID_TILE_LENGTH", `Tile length must be an integer >= 16 pixels; received ${tileLength}.`);
  if (!Number.isFinite(tileOverlap) || tileOverlap < 0 || tileOverlap > 0.5) throw new ScienceError("INVALID_TILE_OVERLAP", `Tile overlap must be in [0, 0.5]; received ${tileOverlap}.`);
  const longAxis = width >= height ? "x" : "y";
  const longSize = longAxis === "x" ? width : height;
  const shortSize = longAxis === "x" ? height : width;
  const step = Math.max(1, Math.round(tileLength * (1 - tileOverlap)));
  const tileCount = Math.max(1, Math.ceil((longSize - tileLength) / step) + 1);
  if (tileCount > 10000) throw new ScienceError("TILE_COMPLEXITY", `Tile count ${tileCount} exceeds 10000; reduce tile length or increase overlap.`);
  const tiles: Tile[] = [];
  const hypothesis = options.orientationHypothesis ?? "ID";
  for (let i = 0; i < tileCount; i++) {
    const start = Math.min(longSize - tileLength, i * step);
    const end = Math.min(longSize, start + tileLength);
    const x0 = longAxis === "x" ? start : 0;
    const y0 = longAxis === "y" ? start : 0;
    const x1 = longAxis === "x" ? end : width;
    const y1 = longAxis === "y" ? end : height;
    const tileWidth = x1 - x0;
    const tileHeight = y1 - y0;
    // Affine: original_x = tile_x + x0; original_y = tile_y + y0. Matrix is [1, 0, x0, 0, 1, y0].
    const toOriginal: [number, number, number, number, number, number] = [1, 0, x0, 0, 1, y0];
    const roundTripCheck = { pixel: [0, 0] as [number, number], original: [x0, y0] as [number, number] };
    const idHash = createHash("sha256").update(JSON.stringify({ productId: product.id, orientationHypothesis: hypothesis, tileIndex: i, x0, y0, width: tileWidth, height: tileHeight })).digest("hex").slice(0, 16);
    tiles.push({ id: `${product.id.slice(0, 8)}_${hypothesis}_${i}_${idHash}`, index: i, x0, y0, x1, y1, width: tileWidth, height: tileHeight, toOriginal, roundTripCheck });
  }
  const provenance = [...(product.metadata.fields.width?.provenance ?? []), ...(product.metadata.fields.height?.provenance ?? [])];
  const limitations: string[] = [];
  if (tileOverlap === 0) limitations.push("Tile overlap is 0; features near tile edges may be split without overlap continuity.");
  if (longSize < tileLength) limitations.push(`Image long axis (${longSize}px) is shorter than tile length (${tileLength}px); single tile produced.`);
  return { longAxis, shortAxisPreserved: true, longAxisTileLength: tileLength, longAxisTileOverlap: tileOverlap, tileCount, tiles, provenance, limitations };
}

export interface OverlapCropOptions {
  margin?: number;
  // A small, documented tolerance for rounding projected coordinates back to pixels.
  pixelRoundingTolerance?: number;
}
export function planOverlapCrop(product: ScientificProduct, verifiedIntersection: NonNullable<OverlapReport["intersection"]> | null, options: OverlapCropOptions = {}): OverlapPlan {
  const width = product.metadata.fields.width?.value;
  const height = product.metadata.fields.height?.value;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { enabled: false, reason: "Image dimensions unavailable; cannot compute crop.", required: ["Product width and height from authoritative metadata"] };
  }
  if (!verifiedIntersection) return { enabled: false, reason: "Overlap cropping requires verified geographic intersection; screening evidence is not sufficient.", required: ["Verified OVERLAP from Phase 1 with intersection geometry in a declared lunar frame"] };
  const geotransform = product.metadata.fields.geotransform?.value;
  const crsWkt = product.metadata.fields.crsWkt?.value;
  if (!Array.isArray(geotransform) || geotransform.length !== 6 || !geotransform.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return { enabled: false, reason: "Overlap cropping requires an authoritative raster geotransform; corner coordinates alone are not sufficient for pixel mapping.", required: ["Six-element GDAL-style geotransform [x0, sx, rx, y0, ry, sy] from product label or authoritative raster metadata", "CRS WKT declaring the lunar projected grid"] };
  }
  if (typeof crsWkt !== "string" || !crsWkt) {
    return { enabled: false, reason: "CRS WKT is required to interpret the geotransform.", required: ["CRS WKT from product label or authoritative raster metadata"] };
  }
  const [x0, sx, rx, y0, ry, sy] = geotransform as number[];
  if (Math.abs(sx) < 1e-9 || Math.abs(sy) < 1e-9) return { enabled: false, reason: "Geotransform scale is degenerate; cannot invert.", required: ["Non-degenerate geotransform scale factors"] };
  // Inverse affine: pixel_x = (sy*(X - x0) - rx*(Y - y0)) / (sx*sy - rx*ry); pixel_y = (-ry*(X - x0) + sx*(Y - y0)) / (sx*sy - rx*ry)
  const det = sx * sy - rx * ry;
  if (Math.abs(det) < 1e-9) return { enabled: false, reason: "Geotransform is not invertible (rotation terms may be degenerate).", required: ["Invertible geotransform"] };
  const inv = (X: number, Y: number): [number, number] => {
    const dx = X - x0, dy = Y - y0;
    return [(sy * dx - rx * dy) / det, (-ry * dx + sx * dy) / det];
  };
  const rings = verifiedIntersection.geometry.coordinates.flat();
  if (!rings.length) return { enabled: false, reason: "Intersection geometry has no rings.", required: ["Non-empty intersection MultiPolygon"] };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) for (const point of ring) {
    const [px, py] = inv(point[0], point[1]);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return { enabled: false, reason: "A projected intersection point could not be mapped to pixel space.", required: ["Intersection coordinates within the declared geotransform domain"] };
    minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
  }
  const margin = options.margin ?? 0;
  if (!Number.isFinite(margin) || margin < 0) throw new ScienceError("INVALID_MARGIN", `Overlap crop margin must be >= 0 pixels; received ${margin}.`);
  const tolerance = options.pixelRoundingTolerance ?? 0.5;
  const cx0 = Math.max(0, Math.floor(minX - margin));
  const cy0 = Math.max(0, Math.floor(minY - margin));
  const cx1 = Math.min(width, Math.ceil(maxX + margin));
  const cy1 = Math.min(height, Math.ceil(maxY + margin));
  if (cx1 - cx0 < 1 || cy1 - cy0 < 1) return { enabled: false, reason: "Cropped region would be smaller than 1 pixel; margin too small or intersection degenerate.", required: ["Non-degenerate pixel-space intersection"] };
  const vertexProvenance: Provenance[] = verifiedIntersection.geometry.coordinates.flat().slice(0, 4).map((point) => ({
    file: "overlap_report", sha256: "intersection_geometry", field: `coordinates/${JSON.stringify(point)}`, method: "Intersection polygon vertex (lunar projected metres)",
    unit: "m", crs: verifiedIntersection.crs, datum: null,
    authority: { status: "AUTHORITATIVE_ARCHIVE" as const, uri: null, citation: "Phase 1 verified intersection geometry", reason: "Computed in Phase 1 overlap validation" },
  }));
  const provenance = [...(product.metadata.fields.geotransform?.provenance ?? []), ...(product.metadata.fields.crsWkt?.provenance ?? []), ...vertexProvenance];
  const limitations: string[] = [];
  if (Math.abs(minX - Math.round(minX)) > tolerance || Math.abs(minY - Math.round(minY)) > tolerance) limitations.push("Intersection vertex coordinates are not pixel-aligned; cropping uses a conservative envelope with configurable margin.");
  if (margin > 0) limitations.push(`Margin of ${margin} pixels added to the verified intersection envelope; this is a geometric buffer, not a registration tolerance.`);
  return { enabled: true, sourceCrop: { x0: cx0, y0: cy0, x1: cx1, y1: cy1, width: cx1 - cx0, height: cy1 - cy0, margin }, referenceCrop: { x0: cx0, y0: cy0, x1: cx1, y1: cy1, width: cx1 - cx0, height: cy1 - cy0, margin }, provenance, limitations };
}

export function orientationCandidates(): OrientationCandidate[] {
  return [
    { hypothesis: "ID", degrees: 0, flip: "none", description: "Identity (no rotation or flip)", verified: false, requiredEvidence: ["Correspondence matching evidence; metadata alone cannot confirm orientation"] },
    { hypothesis: "R90", degrees: 90, flip: "none", description: "90° counter-clockwise rotation", verified: false, requiredEvidence: ["Correspondence matching evidence; metadata alone cannot confirm orientation"] },
    { hypothesis: "R180", degrees: 180, flip: "none", description: "180° rotation", verified: false, requiredEvidence: ["Correspondence matching evidence; metadata alone cannot confirm orientation"] },
    { hypothesis: "R270", degrees: 270, flip: "none", description: "270° counter-clockwise rotation (90° clockwise)", verified: false, requiredEvidence: ["Correspondence matching evidence; metadata alone cannot confirm orientation"] },
    { hypothesis: "FLIP_H", degrees: 0, flip: "horizontal", description: "Horizontal flip (mirror about vertical axis)", verified: false, requiredEvidence: ["Correspondence matching evidence; metadata alone cannot confirm orientation"] },
    { hypothesis: "FLIP_V", degrees: 0, flip: "vertical", description: "Vertical flip (mirror about horizontal axis)", verified: false, requiredEvidence: ["Correspondence matching evidence; metadata alone cannot confirm orientation"] },
    { hypothesis: "FLIP_H_R90", degrees: 90, flip: "horizontal", description: "Horizontal flip + 90° rotation", verified: false, requiredEvidence: ["Correspondence matching evidence; metadata alone cannot confirm orientation"] },
    { hypothesis: "FLIP_H_R270", degrees: 270, flip: "horizontal", description: "Horizontal flip + 270° rotation", verified: false, requiredEvidence: ["Correspondence matching evidence; metadata alone cannot confirm orientation"] },
  ];
}

export interface AnisotropicOptions {
  enabled?: boolean;
  rangeMin?: number;
  rangeMax?: number;
  steps?: number;
}
export function anisotropicScaleConfig(options: AnisotropicOptions = {}): AnisotropicScaleConfig {
  const enabled = options.enabled ?? false;
  const range: [number, number] = [options.rangeMin ?? 0.9, options.rangeMax ?? 1.1];
  const steps = options.steps ?? 5;
  if (range[0] >= range[1]) throw new ScienceError("INVALID_ANISOTROPIC_RANGE", `Anisotropic scale range min must be < max; received [${range[0]}, ${range[1]}].`);
  if (steps < 2 || steps > 50) throw new ScienceError("INVALID_ANISOTROPIC_STEPS", `Anisotropic scale steps must be in [2, 50]; received ${steps}.`);
  return { enabled, range, steps, order: "after GSD normalization, orientation handling, and long-axis tiling", requiredPreconditions: enabled ? ["Verified geographic overlap", "Authoritative GSD for both products", "Completed orientation hypothesis selection"] : [] };
}

export interface Phase2Options extends CommonGsdOptions {
  longAxisTileLength?: number;
  longAxisTileOverlap?: number;
  overlapCropMargin?: number;
  anisotropic?: AnisotropicOptions;
}
export function buildPhase2Plan(pair: ScientificPair, report: OverlapReport | null, options: Phase2Options = {}): Phase2PreprocessingPlan {
  const sourceGsd = inspectGsd(pair.source.metadata, pair.source.snapshot);
  const referenceGsd = inspectGsd(pair.reference.metadata, pair.reference.snapshot);
  const commonGsd = planCommonGsd(sourceGsd, referenceGsd, { targetMetresPerPixel: options.targetMetresPerPixel });
  const missing: string[] = [];
  const limitations: string[] = [];
  const provenance: Provenance[] = [...sourceGsd.provenance, ...referenceGsd.provenance];

  let sourceResampling: ResamplingPlan | null = null;
  let referenceResampling: ResamplingPlan | null = null;
  if (commonGsd.targetMetresPerPixel !== null) {
    sourceResampling = planResampling(pair.source, { targetMetresPerPixel: commonGsd.targetMetresPerPixel });
    referenceResampling = planResampling(pair.reference, { targetMetresPerPixel: commonGsd.targetMetresPerPixel });
    if (!sourceResampling) missing.push("Source: width/height and GSD required to compute resampling plan");
    if (!referenceResampling) missing.push("Reference: width/height and GSD required to compute resampling plan");
  } else {
    limitations.push("Common GSD unavailable; resampling plans cannot be computed.");
  }

  const sourceTiling = planTiling(pair.source, { longAxisTileLength: options.longAxisTileLength, longAxisTileOverlap: options.longAxisTileOverlap });
  const referenceTiling = planTiling(pair.reference, { longAxisTileLength: options.longAxisTileLength, longAxisTileOverlap: options.longAxisTileOverlap });
  if (!sourceTiling) missing.push("Source: width/height required to compute tiling plan");
  if (!referenceTiling) missing.push("Reference: width/height required to compute tiling plan");

  const overlapCrop = planOverlapCrop(pair.source, report?.intersection ?? null, { margin: options.overlapCropMargin });
  if (!overlapCrop.enabled) limitations.push(`Overlap cropping blocked: ${overlapCrop.reason}`);

  const anisotropic = anisotropicScaleConfig(options.anisotropic);
  if (anisotropic.enabled) limitations.push("Anisotropic scale search is enabled but will not execute until GSD, orientation, and long-axis tiling are completed.");

  const orientation = orientationCandidates();
  limitations.push("Orientation candidates are hypotheses; none are verified without correspondence matching evidence.");
  limitations.push("Phase 2 computes preprocessing plans; no rasters are decoded, resampled, or written in this phase.");

  const status: PreprocessingStatus = pair.source.snapshot.authority.status === "UNVERIFIED_UPLOAD" || pair.reference.snapshot.authority.status === "UNVERIFIED_UPLOAD" ? "UNVERIFIED" : missing.length && !commonGsd.targetMetresPerPixel ? "INSUFFICIENT_DATA" : "PLANNED";

  return { schemaVersion: "lunaris.phase2.preprocessing/1", engineVersion: SCIENCE_VERSION, pairId: pair.id, evaluatedAt: new Date().toISOString(), status, sourceGsd, referenceGsd, commonGsd: commonGsd.targetMetresPerPixel !== null ? { status: commonGsd.status as "EXACT" | "COARSER_OF_TWO" | "CONFIGURED", targetMetresPerPixel: commonGsd.targetMetresPerPixel, provenance: commonGsd.provenance } : { status: "GSD_UNAVAILABLE", targetMetresPerPixel: null, provenance: commonGsd.provenance, reason: commonGsd.reason!, required: commonGsd.required! }, sourceResampling, referenceResampling, overlapCrop, sourceTiling, referenceTiling, orientationCandidates: orientation, anisotropicScale: anisotropic, provenance, missing, limitations, registration: "NOT_IMPLEMENTED" };
}

export function formatPhase2Report(plan: Phase2PreprocessingPlan): string {
  const lines: string[] = [];
  lines.push(`# Phase 2 Preprocessing Report`);
  lines.push(``);
  lines.push(`**Pair ID:** ${plan.pairId}`);
  lines.push(`**Evaluated at:** ${plan.evaluatedAt}`);
  lines.push(`**Status:** ${plan.status}`);
  lines.push(`**Registration:** NOT_IMPLEMENTED`);
  lines.push(``);
  lines.push(`## GSD`);
  lines.push(`- Source: ${plan.sourceGsd.representative ?? "GSD_UNAVAILABLE"} ${plan.sourceGsd.unit} (${plan.sourceGsd.status})`);
  lines.push(`- Reference: ${plan.referenceGsd.representative ?? "GSD_UNAVAILABLE"} ${plan.referenceGsd.unit} (${plan.referenceGsd.status})`);
  lines.push(`- Common target: ${plan.commonGsd.targetMetresPerPixel ?? "GSD_UNAVAILABLE"} m/pixel (${plan.commonGsd.status})`);
  lines.push(``);
  if (plan.sourceResampling || plan.referenceResampling) {
    lines.push(`## Resampling Plans`);
    for (const [label, plan_] of [["Source", plan.sourceResampling], ["Reference", plan.referenceResampling]] as const) {
      if (!plan_) { lines.push(`- ${label}: unavailable`); continue; }
      lines.push(`- ${label}: ${plan_.inputWidth}×${plan_.inputHeight} → ${plan_.outputWidth}×${plan_.outputHeight} (scale ${plan_.sampleScaleFactor.toFixed(4)}×, ${plan_.lineScaleFactor.toFixed(4)}×, ${plan_.interpolation})`);
    }
    lines.push(``);
  }
  if (plan.sourceTiling || plan.referenceTiling) {
    lines.push(`## Tiling Plans`);
    for (const [label, plan_] of [["Source", plan.sourceTiling], ["Reference", plan.referenceTiling]] as const) {
      if (!plan_) { lines.push(`- ${label}: unavailable`); continue; }
      lines.push(`- ${label}: long axis ${plan_.longAxis}, tile length ${plan_.longAxisTileLength}px, overlap ${(plan_.longAxisTileOverlap * 100).toFixed(1)}%, ${plan_.tileCount} tiles`);
    }
    lines.push(``);
  }
  if (plan.overlapCrop.enabled) {
    lines.push(`## Overlap Crop`);
    lines.push(`- Source: [${plan.overlapCrop.sourceCrop.x0}, ${plan.overlapCrop.sourceCrop.y0}] → [${plan.overlapCrop.sourceCrop.x1}, ${plan.overlapCrop.sourceCrop.y1}] (${plan.overlapCrop.sourceCrop.width}×${plan.overlapCrop.sourceCrop.height}, margin ${plan.overlapCrop.sourceCrop.margin}px)`);
    lines.push(`- Reference: [${plan.overlapCrop.referenceCrop.x0}, ${plan.overlapCrop.referenceCrop.y0}] → [${plan.overlapCrop.referenceCrop.x1}, ${plan.overlapCrop.referenceCrop.y1}] (${plan.overlapCrop.referenceCrop.width}×${plan.overlapCrop.referenceCrop.height}, margin ${plan.overlapCrop.referenceCrop.margin}px)`);
    lines.push(``);
  } else {
    lines.push(`## Overlap Crop: Blocked`);
    lines.push(`- Reason: ${plan.overlapCrop.reason}`);
    if ("required" in plan.overlapCrop) for (const item of plan.overlapCrop.required) lines.push(`  - Required: ${item}`);
    lines.push(``);
  }
  lines.push(`## Orientation Candidates`);
  for (const candidate of plan.orientationCandidates) lines.push(`- ${candidate.hypothesis}: ${candidate.description} (verified: ${candidate.verified})`);
  lines.push(``);
  lines.push(`## Anisotropic Scale`);
  lines.push(`- Enabled: ${plan.anisotropicScale.enabled}`);
  lines.push(`- Range: [${plan.anisotropicScale.range[0]}, ${plan.anisotropicScale.range[1]}], ${plan.anisotropicScale.steps} steps`);
  lines.push(`- Order: ${plan.anisotropicScale.order}`);
  lines.push(``);
  if (plan.missing.length) {
    lines.push(`## Missing Data`);
    for (const item of plan.missing) lines.push(`- ${item}`);
    lines.push(``);
  }
  if (plan.limitations.length) {
    lines.push(`## Limitations`);
    for (const item of plan.limitations) lines.push(`- ${item}`);
    lines.push(``);
  }
  lines.push(`## Registration`);
  lines.push(`NOT_IMPLEMENTED. This report describes preprocessing plans only; no correspondence matching, robust geometry, or registration metrics have been computed.`);
  return lines.join("\n");
}
