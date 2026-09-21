import { XMLParser, XMLValidator } from "fast-xml-parser";
import { MAX_METADATA_BYTES, ScienceError, type Entry, type ParsedLabel } from "./types";

export const keyOf = (key: string) => key.split(":").pop()!.replace(/[^a-z0-9]/gi, "").toLowerCase();
const scalar = (raw: string): unknown => {
  let value = raw.trim();
  if (/^(["'])[\s\S]*\1$/.test(value)) return value.slice(1, -1);
  value = value.replace(/\s*<[^>]+>\s*$/, "").trim();
  if (/^[({]/.test(value) && /[)}]$/.test(value)) return value.slice(1, -1).split(",").map((item) => scalar(item));
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?$/.test(value)) return Number(value.replace(/[dD]/, "e"));
  return value.replace(/^['"]|['"]$/g, "");
};

function pvl(text: string): ParsedLabel {
  // Strip comments without altering the submitted bytes or interpreting text inside quotes.
  const clean = text.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\*[\s\S]*?\*\//g, (part) => part.startsWith("/*") ? part.replace(/[^\n]/g, " ") : part);
  const entries: Entry[] = [];
  const stack: { name: string; type: string }[] = [];
  let pending = "", quote = "", depth = 0, ended = false, ordinal = 0;
  function statement(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/^END\s*$/i.test(trimmed)) { if (stack.length) throw new ScienceError("INVALID_PVL", "PVL END reached before all objects/groups closed."); ended = true; return; }
    const close = trimmed.match(/^END_(OBJECT|GROUP)(?:\s*=\s*(.*))?$/i);
    if (close) {
      const current = stack.pop();
      if (!current || current.type !== close[1].toUpperCase() || (close[2] && keyOf(String(scalar(close[2]))) !== keyOf(current.name.replace(/\[\d+\]$/, "")))) throw new ScienceError("INVALID_PVL", "Unbalanced PVL object/group.");
      return;
    }
    const match = trimmed.match(/^([\w:^.-]+)\s*=\s*([\s\S]+)$/);
    if (!match) throw new ScienceError("INVALID_PVL", "Unrecognized or incomplete PVL statement.");
    const [, keyword, raw] = match;
    if (/^(OBJECT|GROUP)$/i.test(keyword)) {
      if (stack.length >= 32) throw new ScienceError("METADATA_COMPLEXITY", "PVL nesting exceeds 32 levels.");
      stack.push({ name: `${String(scalar(raw))}[${ordinal++}]`, type: keyword.toUpperCase() });
      return;
    }
    entries.push({ key: keyOf(keyword), path: [...stack.map((item) => item.name), keyword].join("/"), value: scalar(raw), unit: raw.match(/<([^>]+)>\s*$/)?.[1] ?? null, method: "PVL token extraction; no linked files dereferenced" });
  }
  for (const line of clean.split(/\r?\n/)) {
    if (ended) break;
    pending += (pending ? "\n" : "") + line;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) { if (ch === quote && line[i - 1] !== "\\") quote = ""; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(" || ch === "{") depth++;
      else if (ch === ")" || ch === "}") depth--;
    }
    if (depth < 0) throw new ScienceError("INVALID_PVL", "Unbalanced PVL sequence.");
    if (!quote && depth === 0) { statement(pending); pending = ""; }
    if (entries.length > 6000) throw new ScienceError("METADATA_COMPLEXITY", "Too many metadata fields.");
  }
  if (!ended || quote || depth || stack.length) throw new ScienceError("INCOMPLETE_LABEL", "A complete PVL text label ending with END is required; no image data will be fetched to complete it.", 422, ["Complete detached .lbl/.pvl or bounded attached text header, including END"]);
  return { format: /\bObject\s*=\s*IsisCube/i.test(text) ? "ISIS_PVL" : "PDS3_PVL", entries, limitations: [], raw: null };
}

function xml(text: string): ParsedLabel {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new ScienceError("UNSAFE_XML", "DTD and entity declarations are not permitted. External schemas and linked assets are never fetched.");
  // Guard depth before invoking the XML parser.
  let depth = 0;
  for (const token of text.matchAll(/<\/?[A-Za-z_][^>]*>/g)) {
    if (token[0].startsWith("</")) depth--;
    else if (!token[0].endsWith("/>")) depth++;
    if (depth > 40) throw new ScienceError("METADATA_COMPLEXITY", "XML nesting exceeds 40 levels.");
  }
  if (XMLValidator.validate(text) !== true) throw new ScienceError("INVALID_XML", "The XML label is not well formed.");
  const raw = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, processEntities: false, trimValues: true, alwaysCreateTextNode: true }).parse(text) as Record<string, unknown>;
  const entries: Entry[] = [];
  function walk(value: unknown, path: string, level: number) {
    if (level > 40 || entries.length > 6000) throw new ScienceError("METADATA_COMPLEXITY", "XML metadata is too complex.");
    if (Array.isArray(value)) { value.forEach((item, index) => walk(item, `${path}[${index}]`, level + 1)); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if ("#text" in record) entries.push({ path, key: keyOf(path.split("/").pop()!.replace(/\[\d+\]$/, "")), value: record["#text"], unit: typeof record["@_unit"] === "string" ? record["@_unit"] : null, method: "PDS4 XML element extraction; namespaces retained in field path; no external resolution" });
    for (const [key, child] of Object.entries(record)) if (!key.startsWith("@_") && !key.startsWith("#") && !key.startsWith("?")) walk(child, `${path}/${key}`, level + 1);
  }
  const products = Object.keys(raw).filter((key) => keyOf(key) === "productobservational");
  if (products.length !== 1 || Array.isArray(raw[products[0]])) throw new ScienceError("UNSUPPORTED_XML", "Only one PDS4 Product_Observational label for one logical product is accepted.");
  walk(raw, "", 0);
  return { format: "PDS4_XML", entries, limitations: ["Structural XML parsing is not PDS4 XSD/Schematron certification. External dictionaries are not downloaded."], raw };
}

function json(text: string): ParsedLabel {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new ScienceError("INVALID_JSON", "Invalid metadata JSON."); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ScienceError("INVALID_JSON", "A single metadata object is required.");
  const record = raw as Record<string, unknown>;
  const format = record.schema === "lunaris.metadata/1" ? "LUNAR_METADATA_JSON" : typeof record.driverShortName === "string" && Array.isArray(record.size) ? "GDAL_JSON" : null;
  if (!format) throw new ScienceError("UNSUPPORTED_JSON", "Accepts gdalinfo -json output or the documented lunaris.metadata/1 evidence manifest, not arbitrary GeoJSON or assumed Earth coordinates.");
  const entries: Entry[] = [];
  function walk(value: unknown, path: string, level: number) {
    if (level > 32 || entries.length > 6000) throw new ScienceError("METADATA_COMPLEXITY", "JSON metadata is too complex.");
    if (Array.isArray(value)) {
      if (value.every((item) => typeof item !== "object")) entries.push({ path, key: keyOf(path.split("/").pop()!), value, unit: null, method: `${format} array extraction` });
      else value.forEach((item, index) => walk(item, `${path}/${index}`, level + 1));
    } else if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if ("value" in object && Object.keys(object).every((key) => ["value", "unit"].includes(key))) entries.push({ path, key: keyOf(path.split("/").pop()!), value: object.value, unit: typeof object.unit === "string" ? object.unit : null, method: `${format} explicit value/unit extraction` });
      else for (const [key, child] of Object.entries(object)) walk(child, `${path}/${key}`, level + 1);
    } else entries.push({ path, key: keyOf(path.split("/").pop()!), value, unit: null, method: `${format} field extraction` });
  }
  walk(record, "$", 0);
  return { format, entries, raw: record, limitations: format === "GDAL_JSON" ? ["GDAL JSON is a submitted read-only inspection, not proof of its source raster or archive authenticity. wgs84Extent is never used as lunar geography."] : ["A lunar evidence manifest is unverified unless its exact byte hash has been independently reviewed against authoritative metadata."] };
}

export function parseLabel(bytes: Uint8Array): ParsedLabel {
  if (!bytes.length || bytes.length > MAX_METADATA_BYTES) throw new ScienceError("METADATA_LIMIT", "Only metadata up to 256 KiB is accepted.", 413);
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new ScienceError("BINARY_PRODUCT_NOT_SUPPORTED", "Binary rasters and SPICE kernels are not ingested. Supply their detached metadata, a complete text label, or a read-only GDAL JSON inspection."); }
  if (/\x00/.test(text)) throw new ScienceError("BINARY_PRODUCT_NOT_SUPPORTED", "Binary bytes found. Submit only the complete text label, not pixel data.");
  const start = text.trimStart();
  if (start.startsWith("{") || start.startsWith("[")) return json(text);
  if (start.startsWith("<")) return xml(text);
  if (/\bPDS_VERSION_ID\s*=|\bObject\s*=\s*IsisCube/i.test(text)) return pvl(text);
  throw new ScienceError("UNSUPPORTED_FORMAT", "Expected PDS3 PVL, an ISIS text label, PDS4 XML, GDAL JSON, or a lunar evidence manifest. File names do not determine metadata values.");
}
