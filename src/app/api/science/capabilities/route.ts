import { scientificJson } from "@/science/http";
import { SCIENCE_VERSION, MAX_HEADER_BYTES, MAX_METADATA_BYTES } from "@/science/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return scientificJson({
    version:SCIENCE_VERSION,phase:1,scope:"Metadata inspection and geographic overlap only",
    sources:["ohrc","tmc2","iirs"],reference:"lro_nac",sourceCount:1,referenceCount:1,
    formats:["PDS4 Product_Observational XML (including ISDA fields)","PDS3 PVL text labels", "ISIS PVL text labels / bounded attached headers", "gdalinfo -json metadata snapshots", "lunaris.metadata/1 evidence manifests"],
    limits:{metadataBytes:MAX_METADATA_BYTES,attachedHeaderBytes:MAX_HEADER_BYTES,archiveTimeoutMilliseconds:15000,operationsPerSessionPer15Minutes:40},
    originals:"READ_ONLY",metadataTrust:"Uploads are UNVERIFIED unless exact bytes match a server-admin reviewed metadata hash. Official archive fetches attest origin, not geometric accuracy.",
    reviewedMetadataConfigured:Boolean(process.env.LUNARIS_REVIEWED_METADATA_JSON),
    overlapStates:["OVERLAP","NO_OVERLAP","INSUFFICIENT_DATA","UNVERIFIED"],
    limitations:["Positive bounding-box intersection is screening only.","Corner-only and fixed-sampling projected raster boundaries remain unverified.","Needs explicit lunar frame, datum, latitude/longitude conventions and radii.","Verified area calculation supports compatible spherical lunar models and simple local polygons, including local antimeridian crossings; no hemispheric/pole-containing topology, polygon holes or ellipsoidal frame transformations.","No authoritative IIRS product fixture or authenticated PRADAN connector is bundled.","Native GDAL/ISIS/SPICE workers and raster decoding are not installed or executed."],
    matching:"NOT_IMPLEMENTED",registration:"NOT_IMPLEMENTED",registrationMetrics:"NOT_IMPLEMENTED",
  });
}
