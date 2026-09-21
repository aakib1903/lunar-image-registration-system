import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { basename, extname } from "node:path";
import { decodeUpload, type ProductSubmission } from "./input";
import { MAX_HEADER_BYTES, MAX_METADATA_BYTES, ScienceError, type Authority, type MetadataSnapshot } from "./types";

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const archiveRoots: Record<string, string[]> = {
  "pds.mcp.nasa.gov": ["/data/store/img/lunar_reconnaissance_orbiter/"],
  "pds.lroc.im-ldi.com": ["/data/"],
  "pds.lroc.asu.edu": ["/data/"],
  "pdsimage2.wr.usgs.gov": ["/"],
  "pradan.issdc.gov.in": ["/ch2/"],
  "isda.issdc.gov.in": ["/"],
};
export function validateArchiveUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new ScienceError("INVALID_ARCHIVE_URL", "A valid HTTPS metadata URL is required."); }
  const roots = archiveRoots[url.hostname];
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || !roots?.some((root) => url.pathname.startsWith(root))) throw new ScienceError("ARCHIVE_NOT_ALLOWED", "Only explicitly allowlisted official HTTPS archive paths, without credentials or query tokens, can be requested.", 422);
  if (!/\.(xml|lbl|lab|pvl|json|img|cub)$/i.test(url.pathname)) throw new ScienceError("METADATA_ONLY", "Provide a detached XML/PVL/JSON label or a range-readable IMG/CUB header. TIFF, ZIP, SPICE, and image-pixel downloads are not supported.");
  if (/\/protected\//i.test(url.pathname)) throw new ScienceError("AUTH_REQUIRED", "Use the official PRADAN login and upload an authorized label. This service does not bypass authentication or accept archive passwords.", 401, ["Authorized detached product XML label", "Independent metadata provenance review for verified overlap"]);
  return url;
}

export function attachedLabel(bytes: Uint8Array): Buffer {
  const buffer = Buffer.from(bytes);
  const match = buffer.toString("latin1").match(/(?:^|\r?\n)END[ \t]*(?:\r?\n|$)/i);
  if (!match || match.index === undefined) throw new ScienceError("INCOMPLETE_LABEL", "The bounded prefix does not contain a complete PVL END marker. Supply a detached label; no more product bytes will be read.", 422, ["Complete detached PDS3/ISIS label"]);
  return buffer.subarray(0, match.index + match[0].length);
}

export async function readBoundedBody(response: Response, limit: number): Promise<Buffer> {
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) { await response.body?.cancel(); throw new ScienceError("METADATA_LIMIT", `Server response exceeds the ${limit}-byte metadata budget.`, 413); }
  if (!response.body) throw new ScienceError("EMPTY_METADATA", "Archive returned no metadata body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      count += value.byteLength;
      if (count > limit) { await reader.cancel(); throw new ScienceError("METADATA_LIMIT", "Streaming response exceeded the metadata byte budget; transfer was cancelled.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export async function fetchArchiveLabel(value: string, fetcher: typeof fetch = fetch) {
  let url = validateArchiveUrl(value);
  const signal = AbortSignal.timeout(15_000);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const attached = /\.(img|cub)$/i.test(url.pathname);
    let response: Response;
    try { response = await fetcher(url, { redirect: "manual", cache: "no-store", signal, headers: { Accept: "application/xml,text/plain,application/json,application/octet-stream", "Accept-Encoding": "identity", ...(attached ? { Range: `bytes=0-${MAX_HEADER_BYTES - 1}` } : {}) } }); }
    catch { throw new ScienceError("ARCHIVE_UNAVAILABLE", "The archive metadata request failed or timed out. No fallback to image download is allowed.", 503); }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location"); await response.body?.cancel();
      if (!location) throw new ScienceError("ARCHIVE_REDIRECT", "Archive redirect has no destination.", 502);
      url = validateArchiveUrl(new URL(location, url).toString()); continue;
    }
    if ([401, 403].includes(response.status)) { await response.body?.cancel(); throw new ScienceError("AUTH_REQUIRED", "Archive authorization is required. Use official access and upload its small label; authentication will not be bypassed.", response.status); }
    if (!response.ok) { await response.body?.cancel(); throw new ScienceError("ARCHIVE_UNAVAILABLE", `Archive returned HTTP ${response.status}. No image data was ingested.`, 502); }
    let originalByteLength: number | null = null;
    if (attached) {
      const range = response.headers.get("content-range")?.match(/^bytes 0-(\d+)\/(\d+)$/);
      if (response.status !== 206 || !range || Number(range[1]) >= MAX_HEADER_BYTES) { await response.body?.cancel(); throw new ScienceError("RANGE_NOT_HONORED", "Archive did not honor the bounded header request. Full product download was refused.", 422); }
      originalByteLength = Number(range[2]);
    } else if (response.status === 206) {
      await response.body?.cancel(); throw new ScienceError("INCOMPLETE_LABEL", "Detached metadata must be a complete file, not an unsolicited partial response.");
    }
    const bytes = await readBoundedBody(response, attached ? MAX_HEADER_BYTES : MAX_METADATA_BYTES);
    return { bytes: attached ? attachedLabel(bytes) : bytes, finalUrl: url.toString(), scope: attached ? "ATTACHED_LABEL_ONLY" as const : "COMPLETE_METADATA_FILE" as const, originalByteLength, bytesTransferred: bytes.length };
  }
  throw new ScienceError("ARCHIVE_REDIRECT", "Too many archive redirects.", 502);
}

function reviewedAuthority(hash: string, claimed: string | undefined): Authority {
  const fallback: Authority = { status: "UNVERIFIED_UPLOAD", uri: claimed ?? null, citation: null, reason: "Local upload; any supplied archive URI is a claim, not proof. Exact bytes have not been independently matched to an authoritative label." };
  const config = process.env.LUNARIS_REVIEWED_METADATA_JSON;
  if (!config) return fallback;
  let records: unknown;
  try { records = JSON.parse(config); } catch { throw new ScienceError("REVIEW_CONFIG_INVALID", "Server-side metadata review registry is invalid; no trust was granted.", 503); }
  if (!Array.isArray(records)) throw new ScienceError("REVIEW_CONFIG_INVALID", "Review registry must be an array.", 503);
  const match = records.find((record) => record && typeof record === "object" && record.sha256 === hash);
  if (!match) return fallback;
  if (typeof match.uri !== "string" || typeof match.citation !== "string" || !match.citation.trim()) throw new ScienceError("REVIEW_CONFIG_INVALID", "A matching review requires an official citation and URI.", 503);
  // Protected archive URIs may document a legitimate offline review; never fetch or bypass them.
  const uri = new URL(match.uri);
  if (uri.protocol !== "https:" || uri.username || uri.password || uri.search || uri.hash || uri.port || !archiveRoots[uri.hostname]) throw new ScienceError("REVIEW_CONFIG_INVALID", "Reviewed metadata must cite an allowlisted official archive.", 503);
  return { status: "REVIEWED_HASH", uri: match.uri, citation: match.citation, reason: "Exact submitted-byte SHA-256 matches a server-admin reviewed authoritative-metadata record. This is not geometric accuracy certification." };
}

export async function acquireMetadata(input: ProductSubmission["input"]): Promise<{ bytes: Buffer; snapshot: MetadataSnapshot }> {
  let bytes: Buffer, authority: Authority, fileName: string, scope: MetadataSnapshot["scope"], originalByteLength: number | null, bytesTransferred: number;
  if (input.kind === "upload") {
    bytes = decodeUpload(input.contentBase64);
    scope = input.scope;
    if (scope === "ATTACHED_LABEL_ONLY") {
      const label = attachedLabel(bytes);
      if (label.length !== bytes.length) throw new ScienceError("PIXELS_NOT_ALLOWED", "An attached-label submission must end exactly at END. Do not upload padding or pixel bytes.");
    }
    if (input.originalByteLength !== undefined && input.originalByteLength < bytes.length) throw new ScienceError("INVALID_SIZE", "Original product size cannot be smaller than its submitted metadata.");
    fileName = input.fileName;
    originalByteLength = input.originalByteLength ?? (scope === "COMPLETE_METADATA_FILE" ? bytes.length : null);
    bytesTransferred = bytes.length;
    authority = reviewedAuthority(sha256(bytes), input.claimedArchiveUrl);
  } else {
    const remote = await fetchArchiveLabel(input.url);
    ({ bytes, scope, originalByteLength, bytesTransferred } = remote);
    fileName = decodeURIComponent(new URL(remote.finalUrl).pathname.split("/").pop()!).slice(0, 180);
    authority = { status: "AUTHORITATIVE_ARCHIVE", uri: remote.finalUrl, citation: "Direct bounded HTTPS retrieval from allowlisted official archive", reason: "Archive origin verified by server retrieval; label semantics and geolocation still require independent checks." };
  }
  const snapshot: MetadataSnapshot = { fileName, sha256: sha256(bytes), byteLength: bytes.length, originalByteLength, scope, authority, retrievedAt: new Date().toISOString(), bytesTransferred, readOnly: true };
  return { bytes, snapshot };
}

// Offline/CLI adapter only. No HTTP endpoint accepts a filesystem path.
export async function readLocalMetadata(path: string): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new ScienceError("INVALID_FILE", "A regular metadata file is required.");
    const extension = extname(basename(path)).toLowerCase();
    if ([".img", ".cub"].includes(extension)) {
      const prefix = Buffer.alloc(Math.min(stat.size, MAX_HEADER_BYTES));
      const result = await handle.read(prefix, 0, prefix.length, 0);
      return attachedLabel(prefix.subarray(0, result.bytesRead));
    }
    if (![".xml", ".lbl", ".lab", ".pvl", ".json"].includes(extension)) throw new ScienceError("METADATA_ONLY", "Use a text label or GDAL JSON; binary TIFF/SPICE files are not opened.");
    if (stat.size > MAX_METADATA_BYTES) throw new ScienceError("METADATA_LIMIT", "Local metadata exceeds 256 KiB.", 413);
    const buffer=Buffer.alloc(MAX_METADATA_BYTES+1);
    let offset=0;
    while(offset<buffer.length){const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}
    if(offset>MAX_METADATA_BYTES)throw new ScienceError("METADATA_LIMIT","Metadata grew beyond the 256 KiB budget during inspection.",413);
    return buffer.subarray(0,offset);
  } finally { await handle.close(); }
}
