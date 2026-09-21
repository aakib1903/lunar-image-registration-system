import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { inspectMetadata } from "../../src/science/metadata";
import { inspectFootprint } from "../../src/science/footprints";
import { inspectGsd } from "../../src/science/gsd";
import { planCommonGsd, planResampling, planTiling, planOverlapCrop, orientationCandidates, anisotropicScaleConfig, buildPhase2Plan, formatPhase2Report } from "../../src/science/preprocessing";
import { sha256 } from "../../src/science/acquisition";
import type { MetadataSnapshot, ScientificPair, ScientificProduct, Sensor } from "../../src/science/types";

const fixtures = join(process.cwd(), "tests/fixtures/phase1");

function snapshot(bytes: Buffer, name = "unit-only.json"): MetadataSnapshot {
  return { fileName: name, sha256: sha256(bytes), byteLength: bytes.length, originalByteLength: bytes.length, scope: "COMPLETE_METADATA_FILE", authority: { status: "REVIEWED_HASH", uri: null, citation: "Mathematical unit-test premise only; not mission evidence", reason: "UNIT TEST ONLY — not a production product, never seeded or exposed in UI" }, retrievedAt: "2026-01-01T00:00:00Z", bytesTransferred: bytes.length, readOnly: true };
}
function inspect(bytes: Buffer, sensor: Sensor, name = "unit-only.json") {
  const snap = snapshot(bytes, name);
  const metadata = inspectMetadata(bytes, snap, sensor);
  return { snap, metadata, footprint: inspectFootprint(metadata, snap) };
}
function mathProduct(role: "source" | "reference", options: { width?: number; height?: number; gsdSample?: number; gsdLine?: number; geotransform?: number[]; crsWkt?: string; noGsd?: boolean } = {}): ScientificProduct {
  const value: Record<string, unknown> = {
    schema: "lunaris.metadata/1",
    productId: `UNIT-MATH-NOT-A-MISSION-PRODUCT-${role}`,
    instrument: role === "source" ? "OHRC" : "NACL",
    mission: role === "source" ? "Chandrayaan-2" : "LRO",
    target: "Moon",
    cameraView: role === "source" ? "Nadir" : "LEFT",
    width: options.width ?? 100,
    height: options.height ?? 100,
    start_time: "2026-01-01T00:00:00Z",
    frame: "MATHEMATICAL UNIT-TEST FRAME",
    datum: "MATHEMATICAL UNIT-TEST SPHERE",
    radiusA: { value: 1737400, unit: "m" },
    radiusB: { value: 1737400, unit: "m" },
    radiusC: { value: 1737400, unit: "m" },
    latitudeType: "PLANETOCENTRIC",
    longitudeDirection: "EAST",
    longitudeDomain: "180",
  };
  if (!options.noGsd) {
    if (options.gsdSample !== undefined) value.sampleGsd = { value: options.gsdSample, unit: "m/pixel" };
    else value.sampleGsd = { value: 1, unit: "m/pixel" };
    if (options.gsdLine !== undefined) value.lineGsd = { value: options.gsdLine, unit: "m/pixel" };
    else value.lineGsd = { value: 1, unit: "m/pixel" };
  }
  if (options.geotransform) value.geotransform = options.geotransform;
  if (options.crsWkt) value.crsWkt = options.crsWkt;
  const bytes = Buffer.from(JSON.stringify(value));
  const sensor = role === "source" ? "ohrc" : "lro_nac";
  const { snap, metadata, footprint } = inspect(bytes, sensor, "mathematics-only.json");
  return { id: role === "source" ? "00000000-0000-4000-8000-000000000001" : "00000000-0000-4000-8000-000000000002", role, selectedSensor: sensor, snapshot: snap, metadata, footprint, createdAt: snap.retrievedAt };
}

test("GSD extraction from real OHRC XML: only scalar GSD is present, sample/line remain unknown, provenance preserved", async () => {
  const bytes = await readFile(join(fixtures, "ch2_ohr_ncp_20240229T0921593215_d_img_d18.xml"));
  const before = sha256(bytes);
  const { metadata } = inspect(bytes, "ohrc", "ch2_ohr_ncp_20240229T0921593215_d_img_d18.xml");
  const gsd = inspectGsd(metadata, snapshot(bytes));
  // The real OHRC XML has only a scalar isda:pixel_resolution, no per-axis GSD.
  assert.equal(gsd.status, "PARTIAL");
  assert.equal(gsd.sampleMetresPerPixel, null);
  assert.equal(gsd.lineMetresPerPixel, null);
  assert.equal(gsd.representative, 0.23);
  assert.equal(gsd.unit, "m/pixel");
  assert.ok(gsd.provenance.length > 0);
  for (const p of gsd.provenance) { assert.equal(p.sha256, before); assert.ok(p.field); assert.ok(p.method); }
  assert.ok(gsd.missing.some(item => item.includes("sample-direction")));
  assert.ok(gsd.missing.some(item => item.includes("line-direction")));
});

test("GSD extraction from real NAC header: GSD_UNAVAILABLE because header lacks GSD", async () => {
  const bytes = await readFile(join(fixtures, "M104318871LE.header.lbl"));
  const { metadata } = inspect(bytes, "lro_nac", "M104318871LE.header.lbl");
  const gsd = inspectGsd(metadata, snapshot(bytes));
  assert.equal(gsd.status, "GSD_UNAVAILABLE");
  assert.equal(gsd.representative, null);
  assert.ok(gsd.missing.length >= 2);
});

test("Common GSD: defaults to coarser of source/reference", () => {
  const source = mathProduct("source", { gsdSample: 0.5, gsdLine: 0.5 });
  const reference = mathProduct("reference", { gsdSample: 1.5, gsdLine: 1.5 });
  const sourceGsd = inspectGsd(source.metadata, source.snapshot);
  const referenceGsd = inspectGsd(reference.metadata, reference.snapshot);
  const common = planCommonGsd(sourceGsd, referenceGsd);
  assert.equal(common.status, "COARSER_OF_TWO");
  assert.equal(common.targetMetresPerPixel, 1.5);
});

test("Common GSD: rejects target finer than coarser", () => {
  const source = mathProduct("source", { gsdSample: 0.5, gsdLine: 0.5 });
  const reference = mathProduct("reference", { gsdSample: 1.5, gsdLine: 1.5 });
  const sourceGsd = inspectGsd(source.metadata, source.snapshot);
  const referenceGsd = inspectGsd(reference.metadata, reference.snapshot);
  assert.throws(() => planCommonGsd(sourceGsd, referenceGsd, { targetMetresPerPixel: 1.0 }), /finer than the coarser/);
});

test("Common GSD: accepts configured target coarser than both", () => {
  const source = mathProduct("source", { gsdSample: 0.5, gsdLine: 0.5 });
  const reference = mathProduct("reference", { gsdSample: 1.5, gsdLine: 1.5 });
  const sourceGsd = inspectGsd(source.metadata, source.snapshot);
  const referenceGsd = inspectGsd(reference.metadata, reference.snapshot);
  const common = planCommonGsd(sourceGsd, referenceGsd, { targetMetresPerPixel: 2.0 });
  assert.equal(common.status, "CONFIGURED");
  assert.equal(common.targetMetresPerPixel, 2.0);
});

test("Common GSD: GSD_UNAVAILABLE when either product lacks GSD", () => {
  const source = mathProduct("source", { noGsd: true });
  const reference = mathProduct("reference", { gsdSample: 1.5, gsdLine: 1.5 });
  const sourceGsd = inspectGsd(source.metadata, source.snapshot);
  const referenceGsd = inspectGsd(reference.metadata, reference.snapshot);
  const common = planCommonGsd(sourceGsd, referenceGsd);
  assert.equal(common.status, "GSD_UNAVAILABLE");
  assert.equal(common.targetMetresPerPixel, null);
  assert.ok(common.required!.some(item => item.includes("Source")));
});

test("Resampling plan: dimensions, scale factors, interpolation", () => {
  const product = mathProduct("source", { width: 1000, height: 500, gsdSample: 0.5, gsdLine: 0.5 });
  const plan = planResampling(product, { targetMetresPerPixel: 1.0 });
  assert.ok(plan);
  assert.equal(plan.inputWidth, 1000);
  assert.equal(plan.inputHeight, 500);
  assert.equal(plan.targetGsdMetresPerPixel, 1.0);
  assert.equal(plan.outputWidth, 500);
  assert.equal(plan.outputHeight, 250);
  assert.equal(plan.sampleScaleFactor, 2.0);
  assert.equal(plan.lineScaleFactor, 2.0);
  assert.equal(plan.interpolation, "AREA_AVERAGE");
});

test("Resampling plan: null when GSD unavailable", () => {
  const product = mathProduct("source", { noGsd: true });
  const plan = planResampling(product, { targetMetresPerPixel: 1.0 });
  assert.equal(plan, null);
});

test("Long-axis tiling: preserves short axis, deterministic IDs, round-trip check", () => {
  const product = mathProduct("source", { width: 100, height: 1000 });
  const plan = planTiling(product, { longAxisTileLength: 200, longAxisTileOverlap: 0.1 });
  assert.ok(plan);
  assert.equal(plan.longAxis, "y");
  assert.equal(plan.shortAxisPreserved, true);
  assert.ok(plan.tileCount > 1);
  for (const tile of plan.tiles) {
    assert.equal(tile.width, 100);
    assert.ok(tile.height <= 200);
    assert.equal(tile.toOriginal[0], 1);
    assert.equal(tile.toOriginal[4], 1);
    assert.equal(tile.roundTripCheck.original[0], tile.x0);
    assert.equal(tile.roundTripCheck.original[1], tile.y0);
  }
  const ids = plan.tiles.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
  // Deterministic: same inputs produce same IDs.
  const plan2 = planTiling(product, { longAxisTileLength: 200, longAxisTileOverlap: 0.1 });
  assert.deepEqual(plan.tiles.map(t => t.id), plan2!.tiles.map(t => t.id));
});

test("Long-axis tiling: horizontal long axis", () => {
  const product = mathProduct("source", { width: 1000, height: 100 });
  const plan = planTiling(product, { longAxisTileLength: 200, longAxisTileOverlap: 0.1 });
  assert.ok(plan);
  assert.equal(plan.longAxis, "x");
  for (const tile of plan.tiles) assert.equal(tile.height, 100);
});

test("Long-axis tiling: rejects invalid tile length/overlap", () => {
  const product = mathProduct("source", { width: 100, height: 1000 });
  assert.throws(() => planTiling(product, { longAxisTileLength: 10 }), />= 16/);
  assert.throws(() => planTiling(product, { longAxisTileOverlap: 0.6 }), /\[0, 0.5\]/);
});

test("Overlap crop: blocked without verified intersection", () => {
  const product = mathProduct("source", { width: 1000, height: 1000, geotransform: [0, 1, 0, 0, 0, -1], crsWkt: "PROJCS[\"test\"]" });
  const result = planOverlapCrop(product, null);
  assert.equal(result.enabled, false);
  assert.ok(result.reason.includes("verified geographic intersection"));
});

import type { MultiPolygonCoordinates } from "../../src/science/types";

test("Overlap crop: blocked without geotransform", () => {
  const product = mathProduct("source", { width: 1000, height: 1000 });
  const coords: MultiPolygonCoordinates = [[[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]];
  const intersection = { geometry: { type: "MultiPolygon" as const, coordinates: coords }, crs: "test", coordinateOrder: "easting, northing" as const, unit: "metres" as const, areaSquareMetres: 10000 };
  const result = planOverlapCrop(product, intersection);
  assert.equal(result.enabled, false);
  assert.ok(result.reason.includes("geotransform"));
});

test("Overlap crop: works with geotransform + verified intersection", () => {
  const product = mathProduct("source", { width: 1000, height: 1000, geotransform: [0, 1, 0, 1000, 0, -1], crsWkt: "PROJCS[\"test\"]" });
  const coords: MultiPolygonCoordinates = [[[[100, 900], [200, 900], [200, 800], [100, 800], [100, 900]]]];
  const intersection = { geometry: { type: "MultiPolygon" as const, coordinates: coords }, crs: "test", coordinateOrder: "easting, northing" as const, unit: "metres" as const, areaSquareMetres: 10000 };
  const result = planOverlapCrop(product, intersection, { margin: 10 });
  assert.equal(result.enabled, true);
  if (result.enabled) {
    assert.equal(result.sourceCrop.x0, 90);
    assert.equal(result.sourceCrop.y0, 90);
    assert.equal(result.sourceCrop.x1, 210);
    assert.equal(result.sourceCrop.y1, 210);
    assert.equal(result.sourceCrop.margin, 10);
  }
});

test("Orientation candidates: 8 hypotheses, all unverified", () => {
  const candidates = orientationCandidates();
  assert.equal(candidates.length, 8);
  for (const c of candidates) {
    assert.equal(c.verified, false);
    assert.ok(c.requiredEvidence.length > 0);
  }
  const hypotheses = candidates.map(c => c.hypothesis);
  assert.ok(hypotheses.includes("ID"));
  assert.ok(hypotheses.includes("R90"));
  assert.ok(hypotheses.includes("FLIP_H"));
});

test("Anisotropic scale: disabled by default, rejects invalid range/steps", () => {
  const config = anisotropicScaleConfig();
  assert.equal(config.enabled, false);
  assert.deepEqual(config.range, [0.9, 1.1]);
  assert.equal(config.steps, 5);
  assert.throws(() => anisotropicScaleConfig({ rangeMin: 1.1, rangeMax: 0.9 }), /min must be < max/);
  assert.throws(() => anisotropicScaleConfig({ steps: 1 }), /\[2, 50\]/);
});

test("Phase 2 plan: built from real OHRC + real NAC (GSD_UNAVAILABLE for NAC)", async () => {
  const ohr = await readFile(join(fixtures, "ch2_ohr_ncp_20240229T0921593215_d_img_d18.xml"));
  const nac = await readFile(join(fixtures, "M104318871LE.header.lbl"));
  const source = { id: "00000000-0000-4000-8000-000000000001", role: "source" as const, selectedSensor: "ohrc" as const, snapshot: snapshot(ohr, "ch2_ohr.xml"), metadata: inspectMetadata(ohr, snapshot(ohr, "ch2_ohr.xml"), "ohrc"), footprint: inspectFootprint(inspectMetadata(ohr, snapshot(ohr, "ch2_ohr.xml"), "ohrc"), snapshot(ohr, "ch2_ohr.xml")), createdAt: "2026-01-01T00:00:00Z" };
  const reference = { id: "00000000-0000-4000-8000-000000000002", role: "reference" as const, selectedSensor: "lro_nac" as const, snapshot: snapshot(nac, "nac.lbl"), metadata: inspectMetadata(nac, snapshot(nac, "nac.lbl"), "lro_nac"), footprint: inspectFootprint(inspectMetadata(nac, snapshot(nac, "nac.lbl"), "lro_nac"), snapshot(nac, "nac.lbl")), createdAt: "2026-01-01T00:00:00Z" };
  const pair: ScientificPair = { id: "unit-pair", source, reference, state: "INSUFFICIENT_DATA", report: null, createdAt: "2026-01-01T00:00:00Z" };
  const plan = buildPhase2Plan(pair, null);
  assert.equal(plan.sourceGsd.representative, 0.23);
  assert.equal(plan.referenceGsd.status, "GSD_UNAVAILABLE");
  assert.equal(plan.commonGsd.status, "GSD_UNAVAILABLE");
  assert.equal(plan.sourceResampling, null);
  assert.equal(plan.referenceResampling, null);
  assert.equal(plan.overlapCrop.enabled, false);
  assert.equal(plan.orientationCandidates.length, 8);
  assert.equal(plan.anisotropicScale.enabled, false);
  assert.equal(plan.registration, "NOT_IMPLEMENTED");
});

test("Phase 2 report: formatted markdown includes all sections", () => {
  const source = mathProduct("source", { gsdSample: 0.5, gsdLine: 0.5 });
  const reference = mathProduct("reference", { gsdSample: 1.5, gsdLine: 1.5 });
  const pair: ScientificPair = { id: "unit-pair", source, reference, state: "NOT_EVALUATED", report: null, createdAt: "2026-01-01T00:00:00Z" };
  const plan = buildPhase2Plan(pair, null);
  const report = formatPhase2Report(plan);
  assert.ok(report.includes("# Phase 2 Preprocessing Report"));
  assert.ok(report.includes("## GSD"));
  assert.ok(report.includes("NOT_IMPLEMENTED"));
  assert.ok(!report.includes("RMSE"));
  assert.ok(!report.includes("match_points"));
});

test("Original files immutable: buildPhase2Plan does not mutate inputs", () => {
  const source = mathProduct("source", { gsdSample: 0.5, gsdLine: 0.5 });
  const reference = mathProduct("reference", { gsdSample: 1.5, gsdLine: 1.5 });
  const pair: ScientificPair = { id: "unit-pair", source, reference, state: "NOT_EVALUATED", report: null, createdAt: "2026-01-01T00:00:00Z" };
  const beforeSource = sha256(Buffer.from(JSON.stringify(source)));
  const beforeReference = sha256(Buffer.from(JSON.stringify(reference)));
  buildPhase2Plan(pair, null);
  assert.equal(sha256(Buffer.from(JSON.stringify(source))), beforeSource);
  assert.equal(sha256(Buffer.from(JSON.stringify(reference))), beforeReference);
});
