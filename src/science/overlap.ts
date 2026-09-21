import proj4 from "proj4";
import polygonClipping from "polygon-clipping";
import { simpleRing, wrapLongitude } from "./footprints";
import { SCIENCE_VERSION, type FootprintInspection, type MultiPolygonCoordinates, type OverlapReport, type Point, type ScientificProduct } from "./types";

const RAD = Math.PI / 180;
function ringArea(ring: Point[]): number {
  if (ring.length < 4) return 0;
  const [ox,oy]=ring[0]; let area=0;
  for (let i=0;i<ring.length-1;i++) area+=(ring[i][0]-ox)*(ring[i+1][1]-oy)-(ring[i+1][0]-ox)*(ring[i][1]-oy);
  return Math.abs(area/2);
}
export function polygonArea(polygons: MultiPolygonCoordinates): number {
  return polygons.reduce((total, polygon) => total + ringArea(polygon[0]) - polygon.slice(1).reduce((sum,ring)=>sum+ringArea(ring),0), 0);
}
export function envelopeIntersects(a: Point[], b: Point[]): boolean {
  const bounds=(ring:Point[])=>[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
  const x=bounds(a),y=bounds(b);
  return [-720,-360,0,360,720].some(shift=>Math.min(x[2],y[2]+shift)>Math.max(x[0],y[0]+shift) && Math.min(x[3],y[3])>Math.max(x[1],y[1]));
}

function densify(footprint: FootprintInspection, step: number): Point[] {
  const ring=footprint.unwrappedRing!; const result:Point[]=[];
  const xyz=([x,y]:Point)=>[Math.cos(y*RAD)*Math.cos(x*RAD),Math.cos(y*RAD)*Math.sin(x*RAD),Math.sin(y*RAD)];
  for(let i=0;i<ring.length-1;i++) {
    const a=ring[i],b=ring[i+1], av=xyz(a),bv=xyz(b);
    const angle=Math.acos(Math.max(-1,Math.min(1,av.reduce((sum,v,j)=>sum+v*bv[j],0))));
    if(angle>=Math.PI-1e-8) throw Error("Antipodal edge is ambiguous.");
    const count=Math.max(1,Math.ceil((footprint.boundaryModel==="GREAT_CIRCLE" ? angle/RAD : Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1])))/step));
    if(result.length+count>16000) throw Error("Footprint densification exceeds the bounded geometry budget.");
    for(let j=0;j<count;j++) {
      const t=j/count;
      if(footprint.boundaryModel!=="GREAT_CIRCLE" || angle<1e-10) result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
      else {
        const f=Math.sin((1-t)*angle)/Math.sin(angle),g=Math.sin(t*angle)/Math.sin(angle);
        const p=av.map((v,k)=>f*v+g*bv[k]);
        result.push([Math.atan2(p[1],p[0])/RAD,Math.atan2(p[2],Math.hypot(p[0],p[1]))/RAD]);
      }
    }
  }
  result.push(result[0]); return result;
}

export function validateOverlap(source: ScientificProduct, reference: ScientificProduct, pairId: string): OverlapReport {
  const sf=source.footprint,rf=reference.footprint;
  const report:OverlapReport={ schemaVersion:"lunaris.overlap/1",engineVersion:SCIENCE_VERSION,pairId,evaluatedAt:new Date().toISOString(),status:"INSUFFICIENT_DATA",reason:"Required geographic evidence is missing.",sourceProduct:source,referenceProduct:reference,sourceFootprint:sf,referenceFootprint:rf,intersection:null,overlapPercentage:null,areas:null,screening:null,algorithm:{name:"Lunar spherical Lambert azimuthal equal-area + Martinez polygon clipping, two-resolution stability check",maximumEdgeStepDegrees:0.025,numericalAreaFloorSquareMetres:0,scope:"Metadata footprint overlap only; not pixel-mask overlap, a registration quality gate, or absolute geolocation certification."},provenance:[...sf.provenance,...rf.provenance],missing:[...sf.missing.map(item=>`Source: ${item}`),...rf.missing.map(item=>`Reference: ${item}`)],limitations:[...sf.limitations.map(item=>`Source: ${item}`),...rf.limitations.map(item=>`Reference: ${item}`),"No pixels, feature counts, filenames, or visual similarity were used as geographic evidence.","An overlap state is not registration success. Matching, registration, sub-pixel refinement, and registration metrics are not implemented."],registration:"NOT_IMPLEMENTED"};
  const conclude=(status:OverlapReport["status"],reason:string)=>{report.status=status;report.reason=reason;return report;};
  if(source.role!=="source" || reference.role!=="reference" || source.selectedSensor==="lro_nac" || reference.selectedSensor!=="lro_nac" || source.id===reference.id) return conclude("INSUFFICIENT_DATA","Exactly one independent OHRC/TMC-2/IIRS source and one LRO NAC reference are required.");
  if(sf.unwrappedRing && rf.unwrappedRing) report.screening={boundingBoxesIntersect:envelopeIntersects(sf.unwrappedRing,rf.unwrappedRing),interpretation:"Vertex-envelope screening only. Positive screening is never accepted as image overlap; great-circle edges can extend beyond vertex envelopes."};
  if(sf.status==="INSUFFICIENT_DATA" || rf.status==="INSUFFICIENT_DATA" || !sf.unwrappedRing || !rf.unwrappedRing) return report;
  if(sf.status!=="VERIFIED" || rf.status!=="VERIFIED") return conclude("UNVERIFIED","At least one footprint lacks independently traceable authority or has only an uncertified corner/projected-boundary approximation.");
  // Defense in depth: callers cannot promote an uploaded product by changing only footprint.status.
  if([source,reference].some(p=>p.snapshot.authority.status==="UNVERIFIED_UPLOAD" || !p.footprint.provenance.length || p.footprint.provenance.some(e=>e.authority.status==="UNVERIFIED_UPLOAD"))) return conclude("UNVERIFIED","Footprint provenance is not independently authoritative.");
  const canonical=(text:string|null)=>text?.trim().toUpperCase().replace(/\s+/g," ");
  if(!sf.crs.frame || !rf.crs.frame || !sf.crs.datum || !rf.crs.datum || canonical(sf.crs.frame)!==canonical(rf.crs.frame) || canonical(sf.crs.datum)!==canonical(rf.crs.datum)) return conclude("UNVERIFIED","Lunar reference frames or datums differ or are unspecified. A documented frame transformation is required; equal radii do not establish equivalence.");
  const a=sf.crs.radiiMetres,b=rf.crs.radiiMetres;
  if(!a || !b) return conclude("INSUFFICIENT_DATA","Both footprints require explicit lunar radii.");
  if(a.some((r,i)=>Math.abs(r-b[i])>0.001) || a.some(r=>Math.abs(r-a[0])>0.001)) return conclude("UNVERIFIED","Phase 1 area calculations require the same explicit spherical lunar model. Ellipsoidal/triaxial models or differing radii need a validated extension.");
  if(sf.crs.latitudeType!==rf.crs.latitudeType) report.limitations.push("Planetographic and planetocentric latitudes coincide only because both declared a/b/c radii define the same sphere.");
  if(sf.kind==="BOUNDING_BOX" || rf.kind==="BOUNDING_BOX") {
    const safeEnvelope = [sf,rf].every(f=>f.kind==="BOUNDING_BOX" || f.boundaryModel==="LON_LAT_LINEAR");
    if(safeEnvelope && report.screening?.boundingBoxesIntersect===false) return conclude("NO_OVERLAP","Authoritative enclosing extents are disjoint (or touch without shared area). No positive-area footprint overlap is possible under the declared boundary model.");
    return conclude("UNVERIFIED","Bounding extents are only a geographic screening test. A documented coverage polygon is needed to confirm positive overlap; area and percentages are withheld.");
  }
  const points=[...sf.unwrappedRing.slice(0,-1),...rf.unwrappedRing.slice(0,-1)];
  const meanSin=points.reduce((sum,p)=>sum+Math.sin(p[0]*RAD),0),meanCos=points.reduce((sum,p)=>sum+Math.cos(p[0]*RAD),0);
  if(Math.hypot(meanSin,meanCos)<1e-8) return conclude("UNVERIFIED","No unambiguous local projection centre exists for these footprints.");
  const longitude=wrapLongitude(Math.atan2(meanSin,meanCos)/RAD),latitude=points.reduce((sum,p)=>sum+p[1],0)/points.length;
  const geographic=`+proj=longlat +R=${a[0]} +no_defs`;
  const projected=`+proj=laea +lat_0=${latitude} +lon_0=${longitude} +R=${a[0]} +x_0=0 +y_0=0 +units=m +no_defs`;
  try {
    const conversion=proj4(geographic,projected);
    const project=(f:FootprintInspection,step:number):Point[]=>densify(f,step).map(([lon,lat])=>{
      const cosAngle=Math.sin(latitude*RAD)*Math.sin(lat*RAD)+Math.cos(latitude*RAD)*Math.cos(lat*RAD)*Math.cos((lon-longitude)*RAD);
      if(cosAngle<0.25) throw Error("Footprint exceeds the conservative local-projection domain; spherical global topology is not implemented.");
      const result=conversion.forward([lon,lat]);
      if(!result.every(Number.isFinite)) throw Error("Projection is non-finite.");
      return [result[0],result[1]];
    });
    // Validate undensified projected topology before clipping; never let the clipping library repair bad input.
    for(const f of [sf,rf]) {
      const ring=f.unwrappedRing!.map(p=>conversion.forward(p) as Point);
      if(!simpleRing(ring)) throw Error("Projected footprint topology is invalid.");
    }
    const coarseSource=project(sf,0.05),coarseRef=project(rf,0.05);
    const fineSource=project(sf,0.025),fineRef=project(rf,0.025);
    const coarse=polygonClipping.intersection([coarseSource],[coarseRef]) as MultiPolygonCoordinates;
    const fine=polygonClipping.intersection([fineSource],[fineRef]) as MultiPolygonCoordinates;
    const coarseArea=polygonArea(coarse),fineArea=polygonArea(fine),sourceArea=ringArea(fineSource),referenceArea=ringArea(fineRef);
    const floor=Math.max(1e-6,Math.max(sourceArea,referenceArea)*1e-10);
    report.algorithm.numericalAreaFloorSquareMetres=floor;
    if(sourceArea<=floor || referenceArea<=floor) throw Error("One footprint is degenerate at the declared numerical precision.");
    if((coarseArea>floor)!==(fineArea>floor) || Math.abs(coarseArea-fineArea)>Math.max(floor,Math.max(coarseArea,fineArea)*0.001)) throw Error("Intersection is unstable under finer boundary densification; area/overlap are not certified.");
    if(fineArea>0 && fineArea<=floor) throw Error("Intersection is below numerical resolution; do not treat this as definite overlap or non-overlap.");
    if(fineArea>Math.min(sourceArea,referenceArea)*(1+1e-8)) throw Error("Intersection area exceeds an input footprint, indicating invalid geometry.");
    report.intersection={geometry:{type:"MultiPolygon",coordinates:fine},crs:`${projected}; frame=${sf.crs.frame}; datum=${sf.crs.datum}`,coordinateOrder:"easting, northing",unit:"metres",areaSquareMetres:fineArea};
    report.areas={sourceSquareMetres:sourceArea,referenceSquareMetres:referenceArea};
    report.overlapPercentage={source:Math.min(100,100*fineArea/sourceArea),reference:Math.min(100,100*fineArea/referenceArea),denominator:"metadata footprint area, not valid-pixel area"};
    report.limitations.push("Areas are approximate spherical-model areas in square metres, checked at 0.05° and 0.025° edge sampling. Stability checks are numerical, not positional-accuracy guarantees.","Metadata footprints do not establish valid pixels, shadow/illumination compatibility, usable features, GSD readiness, or passage of any later quality gate.");
    return conclude(fineArea>floor?"OVERLAP":"NO_OVERLAP",fineArea>floor?"Independently traceable coverage polygons have a stable positive-area intersection in their compatible declared lunar frame.":"Declared coverage polygons have no positive-area intersection. Boundary-only contact is not overlap.");
  } catch(error) {
    report.intersection=null;report.overlapPercentage=null;report.areas=null;
    const detail=error instanceof Error?error.message:"Unknown geometry validation failure.";
    report.limitations.push(detail);
    return conclude("UNVERIFIED",`Geometry could not be conservatively verified: ${detail}`);
  }
}
