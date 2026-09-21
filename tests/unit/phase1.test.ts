import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, stat, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireMetadata, attachedLabel, fetchArchiveLabel, readBoundedBody, readLocalMetadata, sha256, validateArchiveUrl } from "../../src/science/acquisition";
import { inspectMetadata } from "../../src/science/metadata";
import { inspectFootprint } from "../../src/science/footprints";
import { validateOverlap } from "../../src/science/overlap";
import { pairInput, productInput, parseInput } from "../../src/science/input";
import { parseLabel } from "../../src/science/readers";
import type { MetadataSnapshot, Point, ScientificProduct, Sensor } from "../../src/science/types";

const fixtures=join(process.cwd(),"tests/fixtures/phase1");
const ohr="ch2_ohr_ncp_20240229T0921593215_d_img_d18.xml",tmc="ch2_tmc_ncn_20240808T0532596974_d_img_d18.xml",nac="M104318871LE.header.lbl";
function snapshot(bytes:Buffer,name="unit-only.json",verified=false):MetadataSnapshot {
  return {fileName:name,sha256:sha256(bytes),byteLength:bytes.length,originalByteLength:bytes.length,scope:"COMPLETE_METADATA_FILE",authority:{status:verified?"REVIEWED_HASH":"UNVERIFIED_UPLOAD",uri:null,citation:verified?"Mathematical unit-test premise only; not mission evidence":null,reason:"UNIT TEST ONLY — not a production product, never seeded or exposed in UI"},retrievedAt:"2026-01-01T00:00:00Z",bytesTransferred:bytes.length,readOnly:true};
}
function inspect(bytes:Buffer,sensor:Sensor,name="unit-only.json",verified=false) {
  const snap=snapshot(bytes,name,verified); const metadata=inspectMetadata(bytes,snap,sensor); return {snap,metadata,footprint:inspectFootprint(metadata,snap)};
}
// Mathematical fixtures exist ONLY inside unit tests. They are not lunar observations,
// have no archive identity, and are never installed as server trust entries or shown in the demo.
function mathProduct(role:"source"|"reference",ring:Point[],options:{verified?:boolean;kind?:"box";west?:boolean;frame?:string;latitude?:string;radii?:number[];missing?:string[];boundary?:string}={}):ScientificProduct {
  const value:Record<string,unknown>={schema:"lunaris.metadata/1",productId:`UNIT-MATH-NOT-A-MISSION-PRODUCT-${role}`,instrument:role==="source"?"OHRC":"NACL",mission:role==="source"?"Chandrayaan-2":"LRO",target:"Moon",cameraView:role==="source"?"Nadir":"LEFT",width:100,height:100,start_time:"2026-01-01T00:00:00Z",gsd:{value:1,unit:"m/pixel"},frame:options.frame??"MATHEMATICAL UNIT-TEST FRAME",datum:"MATHEMATICAL UNIT-TEST SPHERE",radiusA:{value:options.radii?.[0]??1737400,unit:"m"},radiusB:{value:options.radii?.[1]??1737400,unit:"m"},radiusC:{value:options.radii?.[2]??1737400,unit:"m"},latitudeType:options.latitude??"PLANETOCENTRIC",longitudeDirection:options.west?"WEST":"EAST",longitudeDomain:"180",footprint:{type:"Polygon",angularUnit:"degrees",coordinateOrder:"longitude, latitude",boundaryModel:options.boundary??"LON_LAT_LINEAR",coordinates:[ring]}};
  if(options.kind==="box") {
    delete value.footprint;
    Object.assign(value,{west:{value:ring[0][0],unit:"deg"},south:{value:ring[0][1],unit:"deg"},east:{value:ring[2][0],unit:"deg"},north:{value:ring[2][1],unit:"deg"}});
  }
  for(const key of options.missing??[]) delete value[key];
  const bytes=Buffer.from(JSON.stringify(value)); const sensor=role==="source"?"ohrc":"lro_nac";
  const {snap,metadata,footprint}=inspect(bytes,sensor,"mathematics-only.json",options.verified??true);
  return {id:role==="source"?"00000000-0000-4000-8000-000000000001":"00000000-0000-4000-8000-000000000002",role,selectedSensor:sensor,snapshot:snap,metadata,footprint,createdAt:snap.retrievedAt};
}
const rectangle=(west:number,south:number,east:number,north:number):Point[]=>[[west,south],[east,south],[east,north],[west,north],[west,south]];
const overlap=(a:ScientificProduct,b:ScientificProduct)=>validateOverlap(a,b,"unit-test-pair-not-a-run");

test("real fixture bytes match recorded provenance; no raster products are fixtures",async()=>{
  const manifest=JSON.parse(await readFile(join(fixtures,"provenance.json"),"utf8"));
  for(const item of manifest.records){const bytes=await readFile(join(fixtures,item.file));assert.equal(sha256(bytes),item.sha256);assert.equal(bytes.length,item.bytes);assert.ok(bytes.length<10000);}
});
test("real OHRC XML: axes, physical GSD, acquisition, refined corners and every value provenance",async()=>{
  const bytes=await readFile(join(fixtures,ohr));const before=sha256(bytes);const {metadata,footprint}=inspect(bytes,"ohrc",ohr);
  assert.equal(metadata.detectedSensor?.value,"ohrc");assert.equal(metadata.fields.width?.value,3000);assert.equal(metadata.fields.height?.value,4000);assert.equal(metadata.fields.gsd?.value,0.23);assert.equal(metadata.fields.gsdSample,null);
  assert.match(String(metadata.fields.productId?.value),/^urn:isro:isda:/);assert.equal(metadata.fields.acquisitionStart?.value,"2024-02-29T09:21:59.3215Z");
  assert.equal(metadata.rawFootprint?.kind,"CORNERS");assert.equal(metadata.rawFootprint?.coordinates[0][1],-85.086985);
  assert.ok(metadata.rawFootprint?.provenance.every(p=>p.field.includes("Refined_Corner_Coordinates")));
  for(const field of Object.values(metadata.fields)){if(!field)continue;assert.ok(field.provenance.length);for(const p of field.provenance){assert.equal(p.file,ohr);assert.equal(p.sha256,before);assert.ok(p.field);assert.ok(p.method);assert.ok("crs"in p&&"datum"in p);}}
  assert.equal(footprint.status,"INSUFFICIENT_DATA");assert.ok(footprint.missing.some(item=>item.includes("datum")));assert.equal(sha256(bytes),before);
});
test("real TMC-2 XML uses its own product axes, GSD and corners; no cross-sensor alignment",async()=>{
  const {metadata}=inspect(await readFile(join(fixtures,tmc)),"tmc2",tmc);assert.equal(metadata.detectedSensor?.value,"tmc2");assert.equal(metadata.fields.width?.value,4000);assert.equal(metadata.fields.height?.value,2000);assert.equal(metadata.fields.gsd?.value,4.48);assert.equal(metadata.rawFootprint?.kind,"CORNERS");
});
test("real NAC header identifies LEFT LROC, exposes true dimensions, does not invent GSD/footprints",async()=>{
  const {metadata,footprint}=inspect(await readFile(join(fixtures,nac)),"lro_nac",nac,true);assert.equal(metadata.fields.productId?.value,"M104318871LE");assert.equal(metadata.fields.width?.value,5064);assert.equal(metadata.fields.height?.value,52224);assert.equal(metadata.detectedSensor?.value,"lro_nac");assert.equal(metadata.fields.cameraView?.value,"LEFT");assert.equal(metadata.fields.gsd,null);assert.equal(metadata.rawFootprint,null);assert.equal(footprint.status,"INSUFFICIENT_DATA");
});
test("real ISIS PVL retains explicit units; a unitless parser case never gets inferred units",async()=>{
  const {metadata}=inspect(await readFile(join(fixtures,"ch2_ohrc_full.pvl")),"ohrc");assert.equal(metadata.format,"ISIS_PVL");assert.equal(metadata.fields.width?.value,3000);assert.equal(metadata.fields.height?.value,4000);assert.equal(metadata.fields.gsd?.value,0.23);assert.equal(metadata.fields.gsd?.provenance[0].unit,"meters/pixel");
  const unitless=inspect(Buffer.from('PDS_VERSION_ID=PDS3\nINSTRUMENT_ID=OHRC\nPIXEL_RESOLUTION=0.23\nEND\n'),"ohrc").metadata;
  assert.equal(unitless.fields.gsd,null);assert.ok(unitless.limitations.some(item=>item.includes("unit")));
});
test("IIRS adapter recognizes explicit instrument metadata; missing data remains missing",()=>{
  const bytes=Buffer.from('PDS_VERSION_ID=PDS3\nPRODUCT_ID="UNIT-PARSER-IIRS-NOT-REAL-OBSERVATION"\nINSTRUMENT_ID=IIRS\nMISSION_NAME=Chandrayaan-2\nTARGET_NAME=MOON\nEND\n');
  const {metadata,footprint}=inspect(bytes,"iirs");assert.equal(metadata.detectedSensor?.value,"iirs");assert.equal(metadata.fields.width,null);assert.equal(metadata.fields.gsd,null);assert.equal(footprint.status,"INSUFFICIENT_DATA");
});
test("filenames and selected sensors cannot provide metadata identity or geography",()=>{
  const bytes=Buffer.from('PDS_VERSION_ID=PDS3\nPRODUCT_ID=UNKNOWN\nEND\n');const a=inspect(bytes,"ohrc","OHRC_northpole_0_90.xml");assert.equal(a.metadata.detectedSensor,null);assert.equal(a.metadata.fields.productId,null);assert.equal(a.metadata.rawFootprint,null);
});
test("wrong source sensor and WAC reference are rejected; multiple source IDs cannot enter pair schema",async()=>{
  assert.throws(()=>parseInput(pairInput,{sourceProductId:["one","two"],referenceProductId:"three"}));
  assert.throws(()=>parseInput(pairInput,{sourceProductId:"00000000-0000-4000-8000-000000000001",referenceProductId:"00000000-0000-4000-8000-000000000002",sources:["ohrc","iirs"]}));
  assert.throws(()=>parseInput(productInput,{role:"reference",sensor:"ohrc",input:{kind:"archive",url:"https://example.org/a.xml"}}));
  const bytes=await readFile(join(fixtures,ohr));assert.throws(()=>inspect(bytes,"tmc2"),/Selected tmc2/);
  assert.throws(()=>inspect(Buffer.from('PDS_VERSION_ID=PDS3\nINSTRUMENT_ID=WAC\nEND\n'),"lro_nac"),/not an LRO NAC/);
});
test("mathematical polygons have OVERLAP with lunar metre areas and explicit percentages",()=>{
  const result=overlap(mathProduct("source",rectangle(0,0,2,2)),mathProduct("reference",rectangle(1,0,3,2)));
  assert.equal(result.status,"OVERLAP");assert.ok(result.intersection!.areaSquareMetres>0);assert.ok(Math.abs(result.overlapPercentage!.source-50)<0.02);assert.match(result.intersection!.crs,/R=1737400/);assert.doesNotMatch(result.intersection!.crs,/4326|WGS84/);assert.equal(result.registration,"NOT_IMPLEMENTED");assert.ok(!("rmse"in result));
});
test("mathematical disjoint polygons and boundary-only contact have NO_OVERLAP",()=>{
  for(const box of [rectangle(3,0,4,1),rectangle(1,0,2,1)]) {const result=overlap(mathProduct("source",rectangle(0,0,1,1)),mathProduct("reference",box));assert.equal(result.status,"NO_OVERLAP");assert.equal(result.intersection?.areaSquareMetres,0);}
});
test("bounding boxes: positive screening is UNVERIFIED; disjoint authoritative envelopes are NO_OVERLAP",()=>{
  const source=mathProduct("source",rectangle(0,0,2,2),{kind:"box"});
  const positive=overlap(source,mathProduct("reference",rectangle(1,0,3,2),{kind:"box"}));assert.equal(positive.status,"UNVERIFIED");assert.equal(positive.screening?.boundingBoxesIntersect,true);assert.equal(positive.overlapPercentage,null);assert.equal(positive.intersection,null);
  const negative=overlap(source,mathProduct("reference",rectangle(3,0,4,2),{kind:"box"}));assert.equal(negative.status,"NO_OVERLAP");
});
test("missing reference datum yields INSUFFICIENT_DATA, not inferred Moon geometry",()=>{
  const report=overlap(mathProduct("source",rectangle(0,0,2,2)),mathProduct("reference",rectangle(1,0,3,2),{missing:["datum"]}));assert.equal(report.status,"INSUFFICIENT_DATA");assert.equal(report.intersection,null);assert.ok(report.missing.some(value=>value.includes("datum")));
});
test("unverified upload stays UNVERIFIED even with complete overlapping coordinates",()=>{
  const source=mathProduct("source",rectangle(0,0,2,2),{verified:false});const report=overlap(source,mathProduct("reference",rectangle(1,0,3,2)));assert.equal(report.status,"UNVERIFIED");assert.equal(report.intersection,null);
  source.footprint.status="VERIFIED";assert.equal(overlap(source,mathProduct("reference",rectangle(1,0,3,2))).status,"UNVERIFIED");
});
test("dateline crossing and west-positive coordinates normalize without an Earth CRS",()=>{
  const a=mathProduct("source",rectangle(179,0,-179,2));const b=mathProduct("reference",rectangle(179.5,0,-178.5,2));assert.equal(a.footprint.boundingBox?.crossesAntimeridian,true);assert.equal(overlap(a,b).status,"OVERLAP");
  const west=mathProduct("source",rectangle(-2,0,0,2),{west:true});assert.equal(overlap(west,mathProduct("reference",rectangle(1,0,3,2))).status,"OVERLAP");
});
test("local polar polygons work; pole-containing wraps, wrong frames, and ellipsoids fail closed",()=>{
  assert.equal(overlap(mathProduct("source",rectangle(20,-86,22,-85)),mathProduct("reference",rectangle(21,-86,23,-85))).status,"OVERLAP");
  assert.equal(overlap(mathProduct("source",rectangle(0,0,1,1)),mathProduct("reference",rectangle(0,0,1,1),{frame:"DIFFERENT FRAME"})).status,"UNVERIFIED");
  assert.equal(overlap(mathProduct("source",rectangle(0,0,1,1),{radii:[1737400,1737400,1736000]}),mathProduct("reference",rectangle(0,0,1,1))).status,"UNVERIFIED");
  assert.notEqual(mathProduct("source",rectangle(0,88,10,90)).footprint.status,"VERIFIED");
});
test("self-intersection, open polygon, invalid coordinates and degeneracy cannot verify",()=>{
  for(const ring of [[[0,0],[2,2],[0,2],[2,0],[0,0]],[[0,0],[1,0],[1,1],[0,1]],[[0,100],[1,100],[1,101],[0,100]],[[0,0],[1,0],[2,0],[0,0]]] as Point[][]) assert.notEqual(mathProduct("source",ring).footprint.status,"VERIFIED");
});
test("GDAL metadata extraction retains rotation; arbitrary wgs84Extent never establishes lunar footprint",()=>{
  const bytes=Buffer.from(JSON.stringify({driverShortName:"GTiff",description:"not-evidence.tif",size:[600,5000],geoTransform:[0,5,0.2,0,0.1,-5],coordinateSystem:{wkt:'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'},wgs84Extent:{type:"Polygon",coordinates:[rectangle(0,0,1,1)]},metadata:{"":{INSTRUMENT_ID:"OHRC",MISSION_NAME:"Chandrayaan-2",TARGET_NAME:"Moon",PRODUCT_ID:"UNIT-GDAL-INSPECTION-NOT-MISSION-DATA"}}}));
  const {metadata,footprint}=inspect(bytes,"ohrc");assert.equal(metadata.fields.width?.value,600);assert.deepEqual(metadata.fields.geotransform?.value,[0,5,0.2,0,0.1,-5]);assert.equal(metadata.rawFootprint,null);assert.equal(footprint.status,"INSUFFICIENT_DATA");
});
test("XXE, HTML, malformed labels, and conflicting array axes are not silently accepted",async()=>{
  assert.throws(()=>parseLabel(Buffer.from('<!DOCTYPE a [<!ENTITY e SYSTEM "file:///etc/passwd">]><Product_Observational>&e;</Product_Observational>')),/DTD/);
  assert.throws(()=>parseLabel(Buffer.from('<html><body>Login required</body></html>')),/Product_Observational/);
  assert.throws(()=>parseLabel(Buffer.from('PDS_VERSION_ID=PDS3\nOBJECT=IMAGE\nLINES=3\nEND\n')),/before all objects/);
  const label=(await readFile(join(fixtures,ohr),"utf8")).replace('</File_Area_Observational>','<Array_2D_Image><Axis_Array><axis_name>Sample</axis_name><elements>12</elements></Axis_Array></Array_2D_Image></File_Area_Observational>');
  assert.throws(()=>inspect(Buffer.from(label),"ohrc"),/Multiple PDS4 image arrays/);
});
test("local inputs are opened read-only and remain byte-identical with unchanged mtime",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"lunaris-readonly-"));const path=join(dir,"original.lbl");
  try{const bytes=await readFile(join(fixtures,nac));await writeFile(path,bytes);await chmod(path,0o444);const before=await stat(path);assert.deepEqual(await readLocalMetadata(path),bytes);const after=await stat(path);assert.equal(after.mtimeMs,before.mtimeMs);assert.equal(sha256(await readFile(path)),sha256(bytes));}finally{await rm(dir,{recursive:true,force:true});}
});
test("large attached products read only a bounded prefix and never change original bytes",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"lunaris-header-"));const path=join(dir,"original.cub");
  try{const label=await readFile(join(fixtures,nac));const bytes=Buffer.concat([label,Buffer.alloc(400000)]);await writeFile(path,bytes);const extracted=await readLocalMetadata(path);assert.deepEqual(extracted,label);assert.equal(sha256(await readFile(path)),sha256(bytes));assert.throws(()=>attachedLabel(Buffer.from("no complete label")),/complete PVL/);}finally{await rm(dir,{recursive:true,force:true});}
});
test("archive allowlist, auth boundary, range refusal and byte budgets fail closed",async()=>{
  assert.throws(()=>validateArchiveUrl("http://127.0.0.1/secret.xml"));assert.throws(()=>validateArchiveUrl("https://pds.mcp.nasa.gov.evil.invalid/a.lbl"));assert.throws(()=>validateArchiveUrl("https://pradan.issdc.gov.in/ch2/protected/label.xml"),/official PRADAN/);
  await assert.rejects(fetchArchiveLabel("https://pds.lroc.im-ldi.com/data/a.IMG",(async()=>new Response("DO NOT READ FULL IMAGE",{status:200})) as typeof fetch),/did not honor/);
  await assert.rejects(fetchArchiveLabel("https://pds.lroc.im-ldi.com/data/a.xml",(async()=>new Response(null,{status:302,headers:{location:"https://example.org/a.xml"}})) as typeof fetch),/allowlisted/);
  await assert.rejects(readBoundedBody(new Response("large",{headers:{"content-length":"99999999"}}),20),/budget/);
  await assert.rejects(readBoundedBody(new Response("012345678901234567890"),20),/budget/);
});
test("claimed archive URL cannot grant authority; duplicate intake does not mutate bytes",async()=>{
  const bytes=await readFile(join(fixtures,nac));const result=await acquireMetadata({kind:"upload",fileName:nac,contentBase64:bytes.toString("base64"),scope:"COMPLETE_METADATA_FILE",claimedArchiveUrl:"https://pds.lroc.im-ldi.com/data/a.lbl"});assert.equal(result.snapshot.authority.status,"UNVERIFIED_UPLOAD");assert.equal(result.snapshot.sha256,sha256(bytes));assert.deepEqual(result.bytes,bytes);assert.equal(result.snapshot.readOnly,true);
});
