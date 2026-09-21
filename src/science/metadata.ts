import proj4 from "proj4";
import { parseLabel, keyOf } from "./readers";
import { SCIENCE_VERSION, ScienceError, type Entry, type MetadataInspection, type MetadataSnapshot, type Point, type Provenance, type RawFootprint, type Sensor, type Value } from "./types";

export function inspectMetadata(bytes: Uint8Array, snapshot: MetadataSnapshot, selectedSensor: Sensor): MetadataInspection {
  const parsed = parseLabel(bytes);
  const entries = parsed.entries;
  const limitations = [...parsed.limitations];
  const missing: string[] = [];
  const fields: Record<string, Value | null> = {};
  function provenance(entry: Entry, method?: string): Provenance {
    return { file: snapshot.fileName, sha256: snapshot.sha256, field: entry.path, method: method ?? entry.method, unit: entry.unit, crs: null, datum: null, authority: snapshot.authority };
  }
  function find(aliases: string[], scope?: RegExp): Entry | null {
    const keys = aliases.map(keyOf);
    for (const key of keys) {
      const found = entries.filter((entry) => entry.key === key && (!scope || scope.test(entry.path)));
      if (found.length === 1) return found[0];
      if (found.length > 1) { limitations.push(`Ambiguous repeated field ${aliases[0]} in ${found.map((entry) => entry.path).join(", ")}; no value selected.`); return null; }
    }
    return null;
  }
  function assign(name: string, entry: Entry | null, value?: Value["value"], unit?: string | null, method?: string): Value | null {
    if (!entry || entry.value === null || entry.value === undefined || /^(UNK|UNKNOWN|N\/A|NULL|NAN)$/i.test(String(entry.value).trim())) { fields[name] = null; return null; }
    const result: Value = { value: value ?? entry.value as Value["value"], unit: unit === undefined ? entry.unit : unit, provenance: [provenance(entry, method)] };
    fields[name] = result; return result;
  }
  function text(name: string, aliases: string[], scope?: RegExp) { const entry = find(aliases, scope); return assign(name, entry, entry ? String(entry.value).trim() : undefined); }
  function numeric(name: string, aliases: string[], scope?: RegExp, unitKind?: "length" | "gsd" | "angle") {
    const entry = find(aliases, scope);
    if (!entry) return assign(name, null);
    const number = typeof entry.value === "number" ? entry.value : typeof entry.value === "string" && entry.value.trim() ? Number(entry.value) : NaN;
    if (!Number.isFinite(number)) { limitations.push(`Non-numeric ${entry.path} was not used.`); return assign(name, null); }
    let factor = 1, unit = entry.unit;
    if (unitKind) {
      const normalized = (entry.unit ?? "").toLowerCase().replace(/\s/g, "");
      const factors: Record<string, number> = unitKind === "angle" ? { deg: 1, degree: 1, degrees: 1, rad: 180 / Math.PI } : unitKind === "gsd" ? { "m/pixel": 1, "m/pix": 1, "meters/pixel": 1, "metres/pixel": 1, "km/pixel": 1000, "mm/pixel": 0.001 } : { m: 1, meter: 1, meters: 1, metre: 1, metres: 1, km: 1000, mm: 0.001 };
      if (!Object.prototype.hasOwnProperty.call(factors, normalized)) { limitations.push(`Missing/unsupported unit for ${entry.path}; ${unitKind} was not guessed.`); return assign(name, null); }
      factor = factors[normalized]; unit = unitKind === "angle" ? "degrees" : unitKind === "gsd" ? "m/pixel" : "m";
    }
    if ((unitKind === "length" || unitKind === "gsd") && number <= 0) return assign(name, null);
    return assign(name, entry, number * factor, unit, `${entry.method}; ${factor === 1 ? "explicit units retained" : `unit conversion × ${factor}`}`);
  }

  text("productId", ["product_id", "logical_identifier", "productId"]);
  text("mission", ["mission_name", "SpacecraftName", "instrument_host_name", "mission"], parsed.format === "PDS4_XML" ? /Investigation_Area\// : undefined);
  if (!fields.mission && parsed.format === "PDS4_XML") text("mission", ["name"], /Investigation_Area\//);
  text("target", ["target_name", "TargetName", "target"]);
  if (!fields.target && parsed.format === "PDS4_XML") text("target", ["name"], /Target_Identification\//);
  text("instrument", ["instrument_id", "InstrumentId", "instrument", "instrument_name"]);
  if (!fields.instrument && parsed.format === "PDS4_XML") {
    const types = entries.filter((entry) => entry.key === "type" && /Observing_System_Component/.test(entry.path) && String(entry.value).toLowerCase() === "instrument");
    if (types.length === 1) {
      const path = types[0].path.slice(0, types[0].path.lastIndexOf("/"));
      assign("instrument", entries.find((entry) => entry.path === `${path}/name` || entry.path === `${path}/pds:name`) ?? null);
    } else if (types.length > 1) throw new ScienceError("MULTIPLE_INSTRUMENTS", "The label describes multiple instrument components. Submit exactly one source logical product.");
  }
  text("cameraView", ["frame_id", "CameraView", "view", "camera_id"]);
  text("processingLevel", ["processing_level", "product_type", "ProcessingLevel"]);
  text("acquisitionStart", ["start_date_time", "start_time", "StartTime"]);
  text("acquisitionStop", ["stop_date_time", "stop_time", "StopTime"]);
  numeric("orbitNumber", ["imaging_orbit_number", "orbit_number", "OrbitNumber"]);
  numeric("lineExposureDuration", ["line_exposure_duration", "LineExposureDuration"]);
  numeric("sampleBits", ["sample_bits", "SampleBits"]);
  text("sampleType", ["sample_type", "data_type", "SampleType"], /IMAGE|Image|Element_Array|metadata/i);
  text("axisIndexOrder", ["axis_index_order"]);
  numeric("width", ["line_samples", "Samples", "width"]);
  numeric("height", ["Lines", "height"]);
  numeric("bands", ["Bands"]);
  if (parsed.format === "PDS4_XML") {
    const axisNames = entries.filter((entry) => entry.key === "axisname");
    const arrayPaths = [...new Set(axisNames.map((entry) => entry.path.split(/\/(?:\w+:)?Axis_Array/)[0]))];
    if (arrayPaths.length > 1) throw new ScienceError("AMBIGUOUS_IMAGE_ARRAY", "Multiple PDS4 image arrays are present. Phase 1 requires one explicitly selected source/reference image array; arrays are never combined.", 422, ["A detached label for one image array, or a future validated explicit-array selector; do not edit the original XML"]);
    for (const [axisName, field] of [["sample", "width"], ["line", "height"], ["band", "bands"]]) {
      const axes = axisNames.filter((entry) => String(entry.value).toLowerCase() === axisName);
      if (arrayPaths.length === 1 && axes.length === 1) {
        const parent = axes[0].path.slice(0, axes[0].path.lastIndexOf("/"));
        const element = entries.find((entry) => entry.key === "elements" && entry.path.startsWith(`${parent}/`));
        if (element && Number.isSafeInteger(Number(element.value)) && Number(element.value) > 0) {
          const result = assign(field, element, Number(element.value), "pixels", `${element.method}; selected by explicit ${axisName} axis_name`);
          result?.provenance.push(provenance(axes[0]));
        }
      }
    }
  }
  numeric("gsdSample", ["pixel_resolution_x", "sample_resolution", "sampleGsd", "scaled_pixel_width"], undefined, "gsd");
  numeric("gsdLine", ["pixel_resolution_y", "line_resolution", "lineGsd", "scaled_pixel_height"], undefined, "gsd");
  numeric("gsd", ["pixel_resolution", "map_scale", "PixelResolution", "gsd"], undefined, "gsd");
  text("projection", ["map_projection_name", "map_projection_type", "projection", "ProjectionName"]);
  text("latitudeType", ["latitude_type", "keyword_latitude_type", "LatitudeType", "projection_latitude_type"]);
  text("longitudeDirection", ["longitude_direction", "positive_longitude_direction", "LongitudeDirection"]);
  text("longitudeDomain", ["longitude_domain", "LongitudeDomain"]);
  text("frame", ["coordinate_system_name", "frame", "ReferenceFrame"]);
  text("datum", ["datum", "DatumName", "reference_datum"]);
  if (!fields.datum && parsed.format === "LUNAR_METADATA_JSON") text("datum", ["datum"]);
  if (!fields.crsWkt && parsed.format === "LUNAR_METADATA_JSON") text("crsWkt", ["crsWkt", "wkt"]);
  if (!fields.geotransform && parsed.format === "LUNAR_METADATA_JSON") {
    const entry = find(["geotransform", "geoTransform"]);
    if (entry && Array.isArray(entry.value) && entry.value.length === 6 && entry.value.every((v) => typeof v === "number" && Number.isFinite(v))) assign("geotransform", entry, entry.value, null, "Lunar manifest affine geotransform");
  }
  numeric("radiusA", ["a_axis_radius", "EquatorialRadius", "radiusA"], undefined, "length");
  numeric("radiusB", ["b_axis_radius", "radiusB"], undefined, "length");
  numeric("radiusC", ["c_axis_radius", "PolarRadius", "radiusC"], undefined, "length");
  if (parsed.format === "ISIS_PVL" && !fields.radiusB && fields.radiusA) {
    fields.radiusB = { ...fields.radiusA, provenance: fields.radiusA.provenance.map((p) => ({ ...p, method: `${p.method}; ISIS Mapping EquatorialRadius is the shared equatorial a/b radius` })) };
  }

  let rawFootprint: RawFootprint | null = null;
  const cornerGroups = [/(?:Refined_Corner_Coordinates)\//, /(?:System_Level_Coordinates)\//, undefined];
  for (const scope of cornerGroups) {
    if (scope && !entries.some((entry) => scope.test(entry.path))) continue;
    const corners: Point[] = [], evidence: Provenance[] = [];
    for (const prefix of ["upper_left", "upper_right", "lower_right", "lower_left"]) {
      const lat = numeric(`corner_${prefix}_latitude`, [`${prefix}_latitude`], scope, "angle");
      const lon = numeric(`corner_${prefix}_longitude`, [`${prefix}_longitude`], scope, "angle");
      if (lat && lon) { corners.push([Number(lon.value), Number(lat.value)]); evidence.push(...lat.provenance, ...lon.provenance); }
    }
    if (corners.length === 4) { rawFootprint = { kind: "CORNERS", coordinates: [...corners, corners[0]], provenance: evidence, boundaryModel: "GREAT_CIRCLE" }; limitations.push("Four corner coordinates are retained as a screening polygon only: long-strip edges and valid-pixel extent are not established by corners."); break; }
  }
  const bounds = {
    west: numeric("west", ["west_bounding_coordinate", "westernmost_longitude", "MinimumLongitude", "west"], undefined, "angle"),
    east: numeric("east", ["east_bounding_coordinate", "easternmost_longitude", "MaximumLongitude", "east"], undefined, "angle"),
    north: numeric("north", ["north_bounding_coordinate", "maximum_latitude", "MaximumLatitude", "north"], undefined, "angle"),
    south: numeric("south", ["south_bounding_coordinate", "minimum_latitude", "MinimumLatitude", "south"], undefined, "angle"),
  };
  if (!rawFootprint && bounds.west && bounds.east && bounds.north && bounds.south) {
    const w = Number(bounds.west.value), e = Number(bounds.east.value), n = Number(bounds.north.value), s = Number(bounds.south.value);
    rawFootprint = { kind: "BOUNDING_BOX", coordinates: [[w,s],[e,s],[e,n],[w,n],[w,s]], provenance: Object.values(bounds).flatMap((v) => v!.provenance), boundaryModel: "LON_LAT_LINEAR" };
  }
  if (parsed.format === "LUNAR_METADATA_JSON" && parsed.raw) {
    const footprint = parsed.raw.footprint as Record<string, unknown> | undefined;
    if (footprint?.type === "Polygon" && footprint.angularUnit === "degrees" && footprint.coordinateOrder === "longitude, latitude" && Array.isArray(footprint.coordinates) && footprint.coordinates.length === 1) {
      const ring = footprint.coordinates[0];
      if (Array.isArray(ring) && ring.length >= 4 && ring.length <= 256 && ring.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v)))) {
        const entry: Entry = { path: "$/footprint/coordinates/0", key: "footprint", value: ring, unit: "degrees", method: "Explicit lunar polygon evidence manifest; never inferred from image dimensions" };
        if (footprint.boundaryModel === "GREAT_CIRCLE" || footprint.boundaryModel === "LON_LAT_LINEAR") rawFootprint = { kind: "POLYGON", coordinates: ring as Point[], provenance: [provenance(entry)], boundaryModel: footprint.boundaryModel };
        else limitations.push("Polygon requires an explicit GREAT_CIRCLE or LON_LAT_LINEAR boundaryModel.");
      } else limitations.push("Polygon is invalid or exceeds 256 vertices; no geometry inferred.");
    } else if (footprint) limitations.push("Only one simple closed polygon ring is supported in Phase 1; holes/multipolygons require a later geometry extension.");
  }

  if (parsed.format === "GDAL_JSON" && parsed.raw) {
    const data = parsed.raw;
    const size = data.size as unknown[];
    for (const [index, name] of [[0, "width"], [1, "height"]] as const) if (Number.isSafeInteger(size[index]) && Number(size[index]) > 0) assign(name, { path: `$/size/${index}`, key: name, value: size[index], unit: "pixels", method: "GDAL dataset size metadata" }, Number(size[index]), "pixels");
    const coordinateSystem = data.coordinateSystem as Record<string, unknown> | undefined;
    const wkt = typeof coordinateSystem?.wkt === "string" ? coordinateSystem.wkt : null;
    if (wkt) assign("crsWkt", { path: "$/coordinateSystem/wkt", key: "wkt", value: wkt, unit: null, method: "GDAL declared CRS WKT; not WGS84 extent" }, wkt);
    const transform = data.geoTransform;
    if (Array.isArray(transform) && transform.length === 6 && transform.every((value) => typeof value === "number" && Number.isFinite(value))) {
      assign("geotransform", { path: "$/geoTransform", key: "geotransform", value: transform, unit: null, method: "GDAL affine geotransform, including rotation terms" }, transform as number[]);
      if (wkt && fields.radiusA && fields.radiusB && fields.radiusC && fields.latitudeType && fields.longitudeDirection && fields.frame && fields.target && /^(moon|luna)$/i.test(String(fields.target.value))) {
        const a = Number(fields.radiusA.value), b = Number(fields.radiusB.value), c = Number(fields.radiusC.value);
        try {
          const sourceProjection = new proj4.Proj(wkt);
          if (Math.abs(sourceProjection.a - a) > 0.001 || Math.abs(sourceProjection.b - c) > 0.001 || Math.abs(a-b) > 0.001 || a !== c) throw new Error("Incompatible CRS radii");
          if ((sourceProjection as unknown as { units?: string }).units !== "m") throw new Error("Only metre projected grids supported");
          const conversion = proj4(wkt, `+proj=longlat +a=${a} +b=${c} +no_defs`);
          const width = Number(fields.width?.value), height = Number(fields.height?.value);
          if (!(width > 0 && height > 0)) throw new Error("Missing dimensions");
          const rectangle: Point[] = [[0,0],[width,0],[width,height],[0,height],[0,0]], ring: Point[] = [];
          for (let edge=0;edge<4;edge++) for (let step=0;step<32;step++) {
            const t=step/32, x=rectangle[edge][0]+t*(rectangle[edge+1][0]-rectangle[edge][0]), y=rectangle[edge][1]+t*(rectangle[edge+1][1]-rectangle[edge][1]);
            const point = conversion.forward([transform[0]+x*transform[1]+y*transform[2],transform[3]+x*transform[4]+y*transform[5]]);
            ring.push([point[0],point[1]]);
          }
          ring.push(ring[0]);
          rawFootprint = { kind: "PROJECTED_RASTER", coordinates: ring, boundaryModel: "PROJECTED_RASTER", provenance: [...fields.geotransform!.provenance, ...fields.crsWkt!.provenance, ...fields.width!.provenance, ...fields.height!.provenance] };
          // Coordinate conversion emits east-positive; a conflicting declaration is blocked rather than reinterpreted.
          if (!/^(east|positive east)$/i.test(String(fields.longitudeDirection.value))) throw new Error("Longitude convention conflict");
          assign("gsdSample", { path: "$/geoTransform", key: "gsdSample", value: Math.hypot(transform[1],transform[4]), unit: "m/pixel", method: "Norm of GDAL sample-axis vector in declared projected metre grid; map sampling, not measured surface GSD" });
          assign("gsdLine", { path: "$/geoTransform", key: "gsdLine", value: Math.hypot(transform[2],transform[5]), unit: "m/pixel", method: "Norm of GDAL line-axis vector in declared projected metre grid; map sampling, not measured surface GSD" });
          limitations.push("Projected raster boundary is sampled at 32 segments per edge; it is not the valid-data mask or a raw camera footprint. GDAL map sampling is not necessarily surface GSD.");
        } catch { rawFootprint = null; limitations.push("GDAL CRS could not be safely reconciled with explicit lunar radii, east longitude, and metre units. No Earth conversion was attempted."); }
      } else limitations.push("GDAL georeferencing requires explicit Moon target, frame, latitude/longitude conventions, and a/b/c radii. WKT name, image dimensions, and wgs84Extent alone are insufficient.");
    }
  }

  const instrument = String(fields.instrument?.value ?? "");
  const code = keyOf(instrument);
  const view = String(fields.cameraView?.value ?? "").toUpperCase();
  let detected: Sensor | null = null;
  if (["ohrc", "orbiterhighresolutioncamera"].includes(code)) detected = "ohrc";
  if (["tmc2", "terrainmappingcamera", "terrainmappingcamera2"].includes(code)) detected = "tmc2";
  if (["iirs", "imaginginfraredspectrometer", "imaginginfraredspectrometeriirs"].includes(code)) detected = "iirs";
  if (["nacl", "nacr", "lronacl", "lronacr", "lronac", "narrowanglecamera"].includes(code)) detected = "lro_nac";
  if (["lroc", "lunarreconnaissanceorbitercamera"].includes(code) && ["LEFT", "RIGHT"].includes(view)) detected = "lro_nac";
  if (/wac|wideangle/i.test(instrument)) throw new ScienceError("SENSOR_MISMATCH", "LRO WAC is not an LRO NAC reference.");
  if (detected && detected !== selectedSensor) throw new ScienceError("SENSOR_MISMATCH", `Selected ${selectedSensor}, but label fields identify ${detected}. No identity is inferred from the file name.`);
  if (fields.target && !/^(moon|luna)$/i.test(String(fields.target.value))) throw new ScienceError("TARGET_MISMATCH", "The selected product metadata identifies a non-lunar target.");
  if (fields.mission && detected && (detected === "lro_nac" ? !/LRO|LUNAR RECONNAISSANCE ORBITER/i.test(String(fields.mission.value)) : !/chandrayaan[\s_-]*2|CH2/i.test(String(fields.mission.value)))) throw new ScienceError("MISSION_MISMATCH", "The metadata mission is incompatible with the selected sensor.");
  if (detected === "lro_nac" && !["LEFT", "RIGHT", "NACL", "NACR"].includes(view) && !/^(nacl|nacr|lronacl|lronacr)$/.test(code)) missing.push("Explicit NAC left/right camera identity (FRAME_ID or instrument ID), not a combined NAC pair");
  if (!detected) missing.push("Unambiguous supported instrument metadata (LROC also needs LEFT/RIGHT FRAME_ID)");
  for (const name of ["productId", "target", "mission", "width", "height"]) if (!fields[name]) missing.push(`Product metadata: ${name}`);
  for (const name of ["width", "height"]) if (fields[name] && (!Number.isSafeInteger(Number(fields[name]!.value)) || Number(fields[name]!.value) <= 0)) { fields[name] = null; missing.push(`Positive integer ${name}`); }
  if (!fields.gsd && (!fields.gsdSample || !fields.gsdLine)) missing.push("Product-specific GSD with explicit metric units (sample and line scales where available)");
  if (!fields.acquisitionStart) missing.push("Acquisition start time");
  if (!rawFootprint) missing.push("Authoritative geographic footprint polygon or coordinate bounds; raw images may require archive geometry, camera model, SPICE and DEM");
  const crs = fields.frame ? String(fields.frame.value) : null, datum = fields.datum ? String(fields.datum.value) : null;
  for (const value of Object.values(fields)) if (value) for (const item of value.provenance) { item.crs = crs; item.datum = datum; }
  rawFootprint?.provenance.forEach((item) => { item.crs = crs; item.datum = datum; });
  const detectedSensor: Value<Sensor> | null = detected ? { value: detected, unit: null, provenance: [...(fields.instrument?.provenance ?? []), ...(fields.cameraView?.provenance ?? [])] } : null;
  return { version: SCIENCE_VERSION, format: parsed.format, selectedSensor, detectedSensor, fields, rawFields: entries.map((entry) => ({ value: entry.value, provenance: { ...provenance(entry), crs, datum } })), rawFootprint, status: missing.length ? "INSUFFICIENT_DATA" : snapshot.authority.status === "UNVERIFIED_UPLOAD" ? "UNVERIFIED" : "INSPECTED", missing: [...new Set(missing)], limitations: [...new Set(limitations)] };
}
