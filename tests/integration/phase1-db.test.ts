import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { scientificProducts, scientificPairs, overlapReports } from "../../src/db/schema";
import { createScientificProduct, createScientificPair, evaluateScientificPair, getScientificPair } from "../../src/science/service";

test("database roles, ownership and append-only evidence are enforced independently of UI",async()=>{
  const owner=randomUUID();
  const fixture=async(fileName:string)=>({kind:"upload",fileName,scope:"COMPLETE_METADATA_FILE",contentBase64:(await readFile(`tests/fixtures/phase1/${fileName}`)).toString("base64")});
  try{
    const source=await createScientificProduct(owner,{role:"source",sensor:"ohrc",input:await fixture("ch2_ohr_ncp_20240229T0921593215_d_img_d18.xml")});
    const reference=await createScientificProduct(owner,{role:"reference",sensor:"lro_nac",input:await fixture("M104318871LE.header.lbl")});
    const pair=await createScientificPair(owner,{sourceProductId:source.id,referenceProductId:reference.id});
    await assert.rejects(db.insert(scientificPairs).values({id:randomUUID(),ownerId:owner,sourceProductId:reference.id,referenceProductId:source.id}));
    await assert.rejects(db.insert(scientificPairs).values({id:randomUUID(),ownerId:randomUUID(),sourceProductId:source.id,referenceProductId:reference.id}));
    await assert.rejects(db.update(scientificProducts).set({rawBase64:"dGFtcGVyZWQ="}).where(eq(scientificProducts.id,source.id)));
    await assert.rejects(db.delete(scientificProducts).where(eq(scientificProducts.id,source.id)));
    await assert.rejects(db.update(scientificPairs).set({referenceProductId:source.id}).where(eq(scientificPairs.id,pair.id)));
    const report=await evaluateScientificPair(owner,pair.id);assert.equal(report.status,"INSUFFICIENT_DATA");
    await assert.rejects(db.update(overlapReports).set({status:"OVERLAP"}).where(eq(overlapReports.pairId,pair.id)));
    const saved=await getScientificPair(owner,pair.id);assert.equal(saved.source.snapshot.sha256,source.snapshot.sha256);assert.equal(saved.report?.status,"INSUFFICIENT_DATA");
    // These immutable real-label copies are private to a random test owner and are not demo fixtures.
  }finally{await pool.end();}
});
