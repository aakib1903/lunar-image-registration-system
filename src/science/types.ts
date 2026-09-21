export const SCIENCE_VERSION = "phase1-1.0.0";
export const MAX_METADATA_BYTES = 256 * 1024;
export const MAX_HEADER_BYTES = 64 * 1024;
export type Sensor = "ohrc" | "tmc2" | "iirs" | "lro_nac";
export type ProductRole = "source" | "reference";
export type OverlapStatus = "OVERLAP" | "NO_OVERLAP" | "INSUFFICIENT_DATA" | "UNVERIFIED";
export type InspectionStatus = "INSPECTED" | "INSUFFICIENT_DATA" | "UNVERIFIED";
export type Point = [number, number];
export type PolygonCoordinates = Point[][];
export type MultiPolygonCoordinates = PolygonCoordinates[];
export type MetadataFormat = "PDS4_XML" | "PDS3_PVL" | "ISIS_PVL" | "GDAL_JSON" | "LUNAR_METADATA_JSON";
export type GsdStatus = "EXACT" | "PARTIAL" | "COARSER_OF_TWO" | "CONFIGURED" | "GSD_UNAVAILABLE";
export type PreprocessingStatus = "PLANNED" | "INSUFFICIENT_DATA" | "UNVERIFIED";
export type Orientation = "ID" | "R90" | "R180" | "R270" | "FLIP_H" | "FLIP_V" | "FLIP_H_R90" | "FLIP_H_R270";
export type InterpolationMethod = "NEAREST" | "AREA_AVERAGE" | "BILINEAR" | "LANCZOS";

export interface Authority {
  status: "AUTHORITATIVE_ARCHIVE" | "REVIEWED_HASH" | "UNVERIFIED_UPLOAD";
  uri: string | null;
  citation: string | null;
  reason: string;
}
export interface MetadataSnapshot {
  fileName: string;
  sha256: string;
  byteLength: number;
  originalByteLength: number | null;
  scope: "COMPLETE_METADATA_FILE" | "ATTACHED_LABEL_ONLY";
  authority: Authority;
  retrievedAt: string;
  bytesTransferred: number;
  readOnly: true;
}
export interface Provenance {
  file: string;
  sha256: string;
  field: string;
  method: string;
  unit: string | null;
  crs: string | null;
  datum: string | null;
  authority: Authority;
}
export interface Value<T = string | number | boolean | number[]> {
  value: T;
  unit: string | null;
  provenance: Provenance[];
}
export interface Entry {
  path: string;
  key: string;
  value: unknown;
  unit: string | null;
  method: string;
}
export interface ParsedLabel {
  format: MetadataFormat;
  entries: Entry[];
  limitations: string[];
  raw: Record<string, unknown> | null;
}
export interface RawFootprint {
  kind: "POLYGON" | "CORNERS" | "BOUNDING_BOX" | "PROJECTED_RASTER";
  coordinates: Point[];
  provenance: Provenance[];
  boundaryModel: "GREAT_CIRCLE" | "LON_LAT_LINEAR" | "PROJECTED_RASTER";
}
export interface GsdResult {
  status: GsdStatus;
  sampleMetresPerPixel: number | null;
  lineMetresPerPixel: number | null;
  nominalMetresPerPixel: number | null;
  unit: "m/pixel";
  provenance: Provenance[];
  missing: string[];
  limitations: string[];
  // A scalar representative derived from authoritative sample/line GSD; null if either is unavailable.
  representative: number | null;
}

export interface ResamplingPlan {
  inputWidth: number;
  inputHeight: number;
  inputGsd: GsdResult;
  targetGsdMetresPerPixel: number;
  outputWidth: number;
  outputHeight: number;
  sampleScaleFactor: number;
  lineScaleFactor: number;
  interpolation: InterpolationMethod;
  provenance: Provenance[];
  limitations: string[];
}

export interface Tile {
  id: string;
  index: number;
  x0: number; y0: number;
  x1: number; y1: number;
  width: number; height: number;
  // A tile point (tx, ty) maps to the original pixel via this affine.
  toOriginal: [number, number, number, number, number, number];
  // A small 1D sample verifying the round-trip on the first pixel.
  roundTripCheck: { pixel: [number, number]; original: [number, number] };
}

export interface TilingPlan {
  longAxis: "x" | "y";
  shortAxisPreserved: boolean;
  longAxisTileLength: number;
  longAxisTileOverlap: number;
  tileCount: number;
  tiles: Tile[];
  provenance: Provenance[];
  limitations: string[];
}

export interface OrientationCandidate {
  hypothesis: Orientation;
  degrees: 0 | 90 | 180 | 270;
  flip: "none" | "horizontal" | "vertical";
  description: string;
  verified: false;
  requiredEvidence: string[];
}

export interface AnisotropicScaleConfig {
  enabled: boolean;
  range: [number, number];
  steps: number;
  order: "after GSD normalization, orientation handling, and long-axis tiling";
  requiredPreconditions: string[];
}

export interface OverlapCropPlan {
  enabled: true;
  sourceCrop: { x0: number; y0: number; x1: number; y1: number; width: number; height: number; margin: number };
  referenceCrop: { x0: number; y0: number; x1: number; y1: number; width: number; height: number; margin: number };
  provenance: Provenance[];
  limitations: string[];
}
export type OverlapCropPlanBlocked = { enabled: false; reason: string; required: string[] };

export interface Phase2PreprocessingPlan {
  schemaVersion: "lunaris.phase2.preprocessing/1";
  engineVersion: string;
  pairId: string;
  evaluatedAt: string;
  status: PreprocessingStatus;
  sourceGsd: GsdResult;
  referenceGsd: GsdResult;
  commonGsd: { status: GsdStatus; targetMetresPerPixel: number; provenance: Provenance[] } | { status: "GSD_UNAVAILABLE"; targetMetresPerPixel: null; provenance: Provenance[]; reason: string; required: string[] };
  sourceResampling: ResamplingPlan | null;
  referenceResampling: ResamplingPlan | null;
  overlapCrop: OverlapPlan;
  sourceTiling: TilingPlan | null;
  referenceTiling: TilingPlan | null;
  orientationCandidates: OrientationCandidate[];
  anisotropicScale: AnisotropicScaleConfig;
  provenance: Provenance[];
  missing: string[];
  limitations: string[];
  registration: "NOT_IMPLEMENTED";
}
export type OverlapPlan = OverlapCropPlan | OverlapCropPlanBlocked;

export interface MetadataInspection {
  version: string;
  format: MetadataFormat;
  selectedSensor: Sensor;
  detectedSensor: Value<Sensor> | null;
  fields: Record<string, Value | null>;
  rawFields: { value: unknown; provenance: Provenance }[];
  rawFootprint: RawFootprint | null;
  status: InspectionStatus;
  missing: string[];
  limitations: string[];
}
export interface LunarCrs {
  body: "Moon";
  frame: string | null;
  datum: string | null;
  radiiMetres: [number, number, number] | null;
  latitudeType: "PLANETOCENTRIC" | "PLANETOGRAPHIC" | null;
  sourceLongitudeDirection: "EAST" | "WEST" | null;
  sourceLongitudeDomain: string | null;
  normalizedLongitudeDirection: "EAST";
  normalizedLongitudeDomain: "[-180, 180]";
  coordinateOrder: "longitude, latitude";
  angularUnit: "degrees";
}
export interface FootprintInspection {
  status: "VERIFIED" | "INSUFFICIENT_DATA" | "UNVERIFIED";
  kind: RawFootprint["kind"] | null;
  boundaryModel: RawFootprint["boundaryModel"] | null;
  crs: LunarCrs;
  // Lunar coordinates, NOT an RFC7946/WGS84 GeoJSON assertion.
  geometry: { type: "Polygon"; coordinates: PolygonCoordinates } | null;
  unwrappedRing: Point[] | null;
  boundingBox: { west: number; south: number; east: number; north: number; crossesAntimeridian: boolean } | null;
  provenance: Provenance[];
  missing: string[];
  limitations: string[];
}
export interface ScientificProduct {
  id: string;
  role: ProductRole;
  selectedSensor: Sensor;
  snapshot: MetadataSnapshot;
  metadata: MetadataInspection;
  footprint: FootprintInspection;
  createdAt: string;
}
export interface OverlapReport {
  schemaVersion: "lunaris.overlap/1";
  engineVersion: string;
  pairId: string;
  evaluatedAt: string;
  status: OverlapStatus;
  reason: string;
  sourceProduct: ScientificProduct;
  referenceProduct: ScientificProduct;
  sourceFootprint: FootprintInspection;
  referenceFootprint: FootprintInspection;
  intersection: {
    geometry: { type: "MultiPolygon"; coordinates: MultiPolygonCoordinates };
    crs: string;
    coordinateOrder: "easting, northing";
    unit: "metres";
    areaSquareMetres: number;
  } | null;
  overlapPercentage: { source: number; reference: number; denominator: "metadata footprint area, not valid-pixel area" } | null;
  areas: { sourceSquareMetres: number; referenceSquareMetres: number } | null;
  screening: { boundingBoxesIntersect: boolean; interpretation: string } | null;
  algorithm: { name: string; maximumEdgeStepDegrees: number; numericalAreaFloorSquareMetres: number; scope: string };
  provenance: Provenance[];
  missing: string[];
  limitations: string[];
  registration: "NOT_IMPLEMENTED";
}
export interface ScientificPair {
  id: string;
  source: ScientificProduct;
  reference: ScientificProduct;
  state: "NOT_EVALUATED" | OverlapStatus;
  report: OverlapReport | null;
  createdAt: string;
}

export class ScienceError extends Error {
  constructor(public code: string, message: string, public status = 422, public needed: string[] = []) {
    super(message);
    this.name = "ScienceError";
  }
}
