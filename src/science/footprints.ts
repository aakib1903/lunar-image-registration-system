import type { FootprintInspection, LunarCrs, MetadataInspection, MetadataSnapshot, Point } from "./types";

export const wrapLongitude = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;
export function unwrapRing(ring: Point[]): Point[] {
  const result: Point[] = [];
  for (const [longitude, latitude] of ring) {
    let x = wrapLongitude(longitude);
    if (result.length) {
      const previous = result[result.length - 1][0];
      while (x - previous > 180) x -= 360;
      while (x - previous < -180) x += 360;
    }
    result.push([x, latitude]);
  }
  return result;
}
const samePoint = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
export function simpleRing(ring: Point[]): boolean {
  if (ring.length < 4 || !samePoint(ring[0], ring[ring.length-1]) || ring.some(point => !point.every(Number.isFinite))) return false;
  const [ox,oy]=ring[0];
  const area=ring.slice(0,-1).reduce((sum,p,i)=>sum+(p[0]-ox)*(ring[i+1][1]-oy)-(ring[i+1][0]-ox)*(p[1]-oy),0);
  if (area === 0) return false;
  const orientation = (a: Point, b: Point, c: Point) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const between = (a: Point, b: Point, c: Point) => Math.min(a[0],b[0]) <= c[0] && c[0] <= Math.max(a[0],b[0]) && Math.min(a[1],b[1]) <= c[1] && c[1] <= Math.max(a[1],b[1]);
  for (let i=0;i<ring.length-1;i++) {
    if (samePoint(ring[i],ring[i+1])) return false;
    for (let j=i+2;j<ring.length-1;j++) {
      if (i===0 && j===ring.length-2) continue;
      const a=ring[i], b=ring[i+1], c=ring[j], d=ring[j+1];
      const o1=orientation(a,b,c), o2=orientation(a,b,d), o3=orientation(c,d,a), o4=orientation(c,d,b);
      if ((o1*o2<0 && o3*o4<0) || (o1===0 && between(a,b,c)) || (o2===0 && between(a,b,d)) || (o3===0 && between(c,d,a)) || (o4===0 && between(c,d,b))) return false;
    }
  }
  return true;
}

export function inspectFootprint(metadata: MetadataInspection, snapshot: MetadataSnapshot): FootprintInspection {
  const get = (name: string) => metadata.fields[name]?.value;
  const raw = metadata.rawFootprint;
  const missing: string[] = [], limitations: string[] = [];
  const latitude = String(get("latitudeType") ?? "").replace(/[\s_-]/g, "").toUpperCase();
  const direction = String(get("longitudeDirection") ?? "").replace(/[\s_-]/g, "").toUpperCase();
  const radii = [get("radiusA"),get("radiusB"),get("radiusC")];
  const crs: LunarCrs = {
    body: "Moon", frame: get("frame") ? String(get("frame")) : null, datum: get("datum") ? String(get("datum")) : null,
    radiiMetres: radii.every((value) => typeof value === "number" && value > 0 && Number.isFinite(value)) ? radii as [number,number,number] : null,
    latitudeType: latitude === "PLANETOCENTRIC" || latitude === "PLANETOGRAPHIC" ? latitude : null,
    sourceLongitudeDirection: ["EAST", "POSITIVEEAST"].includes(direction) ? "EAST" : ["WEST", "POSITIVEWEST"].includes(direction) ? "WEST" : null,
    sourceLongitudeDomain: get("longitudeDomain") === undefined ? null : String(get("longitudeDomain")),
    normalizedLongitudeDirection: "EAST", normalizedLongitudeDomain: "[-180, 180]", coordinateOrder: "longitude, latitude", angularUnit: "degrees",
  };
  if (!raw) missing.push("Explicit geographic polygon, complete corner coordinates, bounding coordinates, or supported lunar raster geotransform");
  if (!crs.latitudeType) missing.push("Unambiguous latitude type: Planetocentric or Planetographic (not merely ‘Selenographic’)");
  if (!crs.sourceLongitudeDirection) missing.push("Positive-east or positive-west longitude convention");
  if (!crs.radiiMetres) missing.push("All three lunar body radii with explicit length units");
  if (!crs.frame) missing.push("Named lunar body-fixed reference frame, including realization when applicable");
  if (!crs.datum) missing.push("Explicit lunar datum/model identity; equal radii alone do not prove frame compatibility");
  if (!metadata.fields.target || !metadata.fields.mission || !metadata.detectedSensor || !metadata.fields.productId) missing.push("Metadata-confirmed Moon target, mission, supported instrument, and product identifier");
  if (!crs.sourceLongitudeDomain) limitations.push("Original longitude domain is unspecified. Numeric angular coordinates, when otherwise explicit, are normalized modulo 360; no original domain is invented.");
  if (snapshot.scope === "ATTACHED_LABEL_ONLY") limitations.push("SHA-256 covers the inspected text header only, not the original raster or its pixel content.");
  const evidence = [...(raw?.provenance ?? []), ...["target","mission","frame","datum","radiusA","radiusB","radiusC","latitudeType","longitudeDirection","longitudeDomain"].flatMap((name) => metadata.fields[name]?.provenance ?? [])];
  let ring: Point[] | null = null;
  let unsupported = false;
  if (raw && crs.sourceLongitudeDirection) {
    if (raw.coordinates.length > 257 || raw.coordinates.some(([lon,lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90 || lon < -360 || lon > 360)) {
      missing.push("Finite, degree-valued lunar coordinates within legal ranges and at most 256 vertices");
    } else {
      const sign = crs.sourceLongitudeDirection === "WEST" ? -1 : 1;
      const domain = crs.sourceLongitudeDomain?.replace(/\s/g, "");
      const invalidDomain = domain === "360" || domain === "[0,360]" || domain === "0-360" ? raw.coordinates.some(([x]) => x < 0 || x > 360) : domain === "180" || domain === "[-180,180]" ? raw.coordinates.some(([x]) => x < -180 || x > 180) : false;
      if (invalidDomain) missing.push("Longitude coordinates consistent with the label’s declared domain");
      ring = unwrapRing(raw.coordinates.map(([x,y]) => [x*sign,y]));
      if (raw.kind === "BOUNDING_BOX") {
        const west=wrapLongitude(raw.coordinates[0][0]*sign), east=wrapLongitude(raw.coordinates[1][0]*sign);
        const span=((east-west)%360+360)%360;
        const south=raw.coordinates[0][1], north=raw.coordinates[2][1];
        if (south >= north || span===0) { missing.push("Non-degenerate latitude and longitude bounds"); ring=null; }
        else if (span>=180) { unsupported=true; limitations.push("Bounding extent spans at least a hemisphere or has ambiguous east/west limits. Global/polar-wrap boxes are not validated in Phase 1."); }
        else ring=[[west,south],[west+span,south],[west+span,north],[west,north],[west,south]];
        limitations.push("This geometry is an enclosing bounding box, not proof that the image covers the enclosed area. Positive envelope intersections remain UNVERIFIED.");
      }
      if (ring && (Math.max(...ring.map(([x])=>x))-Math.min(...ring.map(([x])=>x))>=180 || !samePoint(ring[0],ring[ring.length-1]))) {
        unsupported=true; limitations.push("Polygon is not a closed local ring, crosses a polar wrap, or spans a hemisphere. A supported closed/densified footprint is needed.");
      }
      if (ring && !unsupported && !simpleRing(ring)) { missing.push("A non-self-intersecting simple polygon with distinct vertices"); ring=null; }
      if (ring && ring.some(([,y])=>Math.abs(y)===90)) { unsupported=true; limitations.push("Pole-touching footprints need a spherical polar-topology extension; Phase 1 does not reinterpret them."); }
    }
  }
  if (raw?.kind === "CORNERS") { unsupported=true; limitations.push("Only four corner points are available. Curved pushbroom-strip edges are unknown; a documented boundary or geolocation model is required before overlap can be verified."); }
  if (raw?.kind === "PROJECTED_RASTER") { unsupported=true; limitations.push("Projected boundary samples are inspectable but not certified: adaptive projection-boundary error bounds and valid-data masking remain required. Phase 1 does not verify this approximation."); }
  if (snapshot.authority.status === "UNVERIFIED_UPLOAD") { unsupported=true; limitations.push(snapshot.authority.reason); }
  const values=ring?.map(([lon])=>lon) ?? [];
  const bounds=ring ? { west: wrapLongitude(Math.min(...values)), east: wrapLongitude(Math.max(...values)), south: Math.min(...ring.map(([,y])=>y)), north: Math.max(...ring.map(([,y])=>y)), crossesAntimeridian: Math.floor((Math.min(...values)+180)/360) !== Math.floor((Math.max(...values)+180)/360) } : null;
  const status: FootprintInspection["status"] = missing.length ? "INSUFFICIENT_DATA" : unsupported || !evidence.length ? "UNVERIFIED" : "VERIFIED";
  return { status, kind: raw?.kind ?? null, boundaryModel: raw?.boundaryModel ?? null, crs, geometry: ring ? { type:"Polygon", coordinates:[ring.map(([x,y])=>[wrapLongitude(x),y])] } : null, unwrappedRing:ring, boundingBox:bounds, provenance:evidence, missing:[...new Set(missing)], limitations:[...new Set(limitations)] };
}
