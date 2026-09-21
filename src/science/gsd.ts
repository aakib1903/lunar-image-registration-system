import { ScienceError, type GsdResult, type MetadataInspection, type MetadataSnapshot, type Provenance } from "./types";

export function inspectGsd(metadata: MetadataInspection, snapshot: MetadataSnapshot): GsdResult {
  const sample = metadata.fields.gsdSample;
  const line = metadata.fields.gsdLine;
  const gsd = metadata.fields.gsd;
  const provenance: Provenance[] = [...(sample?.provenance ?? []), ...(line?.provenance ?? []), ...(gsd?.provenance ?? [])];
  const missing: string[] = [];
  const limitations: string[] = [];

  if (snapshot.authority.status === "UNVERIFIED_UPLOAD") limitations.push("GSD provenance is from an unverified local upload; archive origin has not been attested by this service.");

  const sampleM = typeof sample?.value === "number" && Number.isFinite(sample.value) && sample.value > 0 ? sample.value : null;
  const lineM = typeof line?.value === "number" && Number.isFinite(line.value) && line.value > 0 ? line.value : null;
  const gsdM = typeof gsd?.value === "number" && Number.isFinite(gsd.value) && gsd.value > 0 ? gsd.value : null;

  if (sampleM === null) missing.push("Authoritative sample-direction GSD in m/pixel (explicit units, from the product label)");
  if (lineM === null) missing.push("Authoritative line-direction GSD in m/pixel (explicit units, from the product label)");

  let nominal: number | null = null;
  if (sampleM !== null && lineM !== null) {
    nominal = Math.sqrt(sampleM * lineM);
  } else if (sampleM !== null) {
    nominal = sampleM;
    limitations.push("Only sample-direction GSD is declared; line-direction GSD is unknown. Representative value assumes isotropy.");
  } else if (lineM !== null) {
    nominal = lineM;
    limitations.push("Only line-direction GSD is declared; sample-direction GSD is unknown. Representative value assumes isotropy.");
  } else if (gsdM !== null) {
    nominal = gsdM;
    limitations.push("Only a scalar GSD is declared. Sample and line directions are unknown; representative value assumes isotropy.");
  }

  if (nominal === null) {
    return { status: "GSD_UNAVAILABLE", sampleMetresPerPixel: null, lineMetresPerPixel: null, nominalMetresPerPixel: null, unit: "m/pixel", provenance, missing, limitations, representative: null };
  }

  if (!provenance.length) throw new ScienceError("GSD_PROVENANCE", "GSD values must retain label-field provenance; a value without provenance is not authoritative.");
  const status: GsdResult["status"] = sampleM !== null && lineM !== null ? "EXACT" : "PARTIAL";
  return { status, sampleMetresPerPixel: sampleM, lineMetresPerPixel: lineM, nominalMetresPerPixel: nominal, unit: "m/pixel", provenance, missing, limitations, representative: nominal };
}
