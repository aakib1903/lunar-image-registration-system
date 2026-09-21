import { test, expect, request as requestFactory, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const fixtures=join(process.cwd(),"tests/fixtures/phase1");
const ohr="ch2_ohr_ncp_20240229T0921593215_d_img_d18.xml";
const nac="M104318871LE.header.lbl";
async function realProduct(request:APIRequestContext,role:"source"|"reference"){
  const fileName=role==="source"?ohr:nac;
  const bytes=await readFile(join(fixtures,fileName));
  const response=await request.post("/api/science/products",{data:{role,sensor:role==="source"?"ohrc":"lro_nac",input:{kind:"upload",fileName,scope:"COMPLETE_METADATA_FILE",contentBase64:bytes.toString("base64")}}});
  expect(response.status(),await response.text()).toBe(201);return (await response.json()).product;
}

test("Phase 1 API inspects actual labels, retains provenance and persists an honest report",async({request})=>{
  const source=await realProduct(request,"source"),reference=await realProduct(request,"reference");
  expect(source.metadata.fields.gsd.value).toBe(0.23);expect(source.snapshot.readOnly).toBe(true);expect(source.snapshot.authority.status).toBe("UNVERIFIED_UPLOAD");
  expect(reference.metadata.fields.productId.value).toBe("M104318871LE");expect(reference.metadata.rawFootprint).toBeNull();
  const metadata=await request.get(`/api/science/products/${source.id}/metadata`);expect(metadata.status()).toBe(200);expect((await metadata.json()).metadata.fields.width.provenance[0].field).toContain("Axis_Array");
  const footprint=await request.get(`/api/science/products/${reference.id}/footprint`);expect(footprint.status()).toBe(200);expect((await footprint.json()).footprint.status).toBe("INSUFFICIENT_DATA");
  const pairResponse=await request.post("/api/science/pairs",{data:{sourceProductId:source.id,referenceProductId:reference.id}});expect(pairResponse.status()).toBe(201);const {pair}=await pairResponse.json();expect(pair.state).toBe("NOT_EVALUATED");
  expect((await request.get(`/api/science/pairs/${pair.id}/report`)).status()).toBe(409);
  const validation=await request.post(`/api/science/pairs/${pair.id}/overlap`,{data:{}});expect(validation.status()).toBe(200);const {report}=await validation.json();
  expect(report.status).toBe("INSUFFICIENT_DATA");expect(report.missing.join(" ")).toContain("datum");expect(report.intersection).toBeNull();expect(report.overlapPercentage).toBeNull();expect(report.registration).toBe("NOT_IMPLEMENTED");expect(report).not.toHaveProperty("rmse");expect(report).not.toHaveProperty("matchPoints");
  const fetched=await request.get(`/api/science/pairs/${pair.id}/report`);expect((await fetched.json()).report).toEqual(report);
  const download=await request.get(`/api/science/pairs/${pair.id}/report?download=1`);expect(download.headers()["content-disposition"]).toContain("lunaris-overlap");expect((await download.json()).status).toBe("INSUFFICIENT_DATA");
  const stored=(await (await request.get(`/api/science/pairs/${pair.id}`)).json()).pair;expect(stored.state).toBe("INSUFFICIENT_DATA");expect(stored.source.snapshot.sha256).toBe(source.snapshot.sha256);
});

test("API enforces exactly one source, NAC reference, no role swaps, no client trust and no gate overrides",async({request})=>{
  const source=await realProduct(request,"source"),reference=await realProduct(request,"reference");
  for(const data of [
    {sourceProductId:[source.id,source.id],referenceProductId:reference.id},
    {sourceProductId:source.id,referenceProductId:reference.id,secondSourceProductId:source.id},
    {sourceProductId:reference.id,referenceProductId:source.id},
    {sourceProductId:source.id,referenceProductId:source.id},
  ])expect((await request.post("/api/science/pairs",{data})).status()).toBe(422);
  const bytes=await readFile(join(fixtures,ohr));const input={kind:"upload",fileName:ohr,scope:"COMPLETE_METADATA_FILE",contentBase64:bytes.toString("base64")};
  expect((await request.post("/api/science/products",{data:{role:"reference",sensor:"ohrc",input}})).status()).toBe(422);
  expect((await request.post("/api/science/products",{data:{role:"source",sensor:["ohrc","tmc2"],input}})).status()).toBe(422);
  expect((await request.post("/api/science/products",{data:{role:"source",sensor:"tmc2",input}})).status()).toBe(422);
  expect((await request.post("/api/science/products",{data:{role:"source",sensor:"ohrc",input:{...input,authoritative:true}}})).status()).toBe(422);
  const {pair}=await (await request.post("/api/science/pairs",{data:{sourceProductId:source.id,referenceProductId:reference.id}})).json();
  expect((await request.post(`/api/science/pairs/${pair.id}/overlap`,{data:{ignoreProvenance:true}})).status()).toBe(422);
  expect((await request.patch(`/api/science/pairs/${pair.id}`,{data:{sourceProductId:reference.id}})).status()).toBe(405);
  expect((await request.post(`/api/science/pairs/${pair.id}/matching`,{data:{}})).status()).toBe(404);
});

test("metadata and report ownership is isolated; cross-site intake and large bodies are blocked",async({request,baseURL})=>{
  const source=await realProduct(request,"source");const other=await requestFactory.newContext({baseURL});
  try{expect((await other.get(`/api/science/products/${source.id}/metadata`)).status()).toBe(404);expect((await (await other.get("/api/science/products")).json()).products).toHaveLength(0);}finally{await other.dispose();}
  expect((await request.post("/api/science/products",{headers:{Origin:"https://untrusted.invalid"},data:{}})).status()).toBe(403);
  expect((await request.post("/api/science/products",{data:{input:"x".repeat(370000)}})).status()).toBe(413);
  const unauthorized=await request.post("/api/science/products",{data:{role:"source",sensor:"ohrc",input:{kind:"archive",url:"https://pradan.issdc.gov.in/ch2/protected/product.xml"}}});expect(unauthorized.status()).toBe(401);expect((await unauthorized.json()).error.code).toBe("AUTH_REQUIRED");
  expect((await request.post("/api/science/products",{data:{role:"source",sensor:"ohrc",input:{kind:"archive",url:"http://127.0.0.1:3000/api/health"}}})).status()).toBe(422);
});

test("existing UI accepts real labels, reports missing geography, persists and exposes no registration outputs",async({page})=>{
  await page.goto("/");const panel=page.getByRole("region",{name:"Phase 1 metadata and overlap"});
  await expect(panel.getByRole("status")).toHaveText("NOT EVALUATED");
  await page.getByRole("button",{name:"Stage 1: Select source — inspect Phase 1",exact:true}).click();
  const dialog=page.getByRole("dialog");await expect(dialog).toContainText("Originals stay read-only");
  await page.getByLabel("Source metadata file",{exact:true}).setInputFiles(join(fixtures,ohr));
  await page.getByLabel("Reference metadata file",{exact:true}).setInputFiles(join(fixtures,nac));
  await page.getByRole("button",{name:"Inspect metadata & create pair",exact:true}).click();
  await expect(dialog).not.toBeVisible();await expect(panel).toContainText("M104318871LE");await expect(panel.getByRole("status")).toHaveText("NOT EVALUATED");
  await panel.getByRole("button",{name:"Validate overlap",exact:true}).click();await expect(panel.getByRole("status")).toHaveText("INSUFFICIENT DATA");await expect(panel).toContainText("Exactly what is needed");await expect(panel).toContainText("lunar datum");
  await panel.getByRole("button",{name:/Inspect fields & provenance/}).first().click();await expect(page.getByRole("dialog")).toContainText("SHA-256");await expect(page.getByRole("dialog")).toContainText("0.23");await page.getByRole("dialog").getByText("width",{exact:true}).click();await expect(page.getByRole("dialog")).toContainText("Axis_Array");await page.keyboard.press("Escape");
  const downloadEvent=page.waitForEvent("download");await panel.getByRole("link",{name:"Download overlap validation report"}).click();const download=await downloadEvent;expect(download.suggestedFilename()).toMatch(/^lunaris-overlap-.*\.json$/);
  await page.reload();await expect(panel.getByRole("status")).toHaveText("INSUFFICIENT DATA");
  await expect(page.getByRole("button",{name:/run registration|start matching|download geotiff/i})).toHaveCount(0);
  await expect(page.getByText("SUCCESS",{exact:true})).toHaveCount(0);await expect(page.getByText("REGISTERED",{exact:true})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
