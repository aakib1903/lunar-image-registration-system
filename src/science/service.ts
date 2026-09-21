import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { metadataIntakes, scientificPairs, scientificProducts, overlapReports, preprocessingPlans } from "@/db/schema";
import { acquireMetadata, sha256 } from "./acquisition";
import { inspectMetadata } from "./metadata";
import { inspectFootprint } from "./footprints";
import { validateOverlap } from "./overlap";
import { buildPhase2Plan, formatPhase2Report, type Phase2Options } from "./preprocessing";
import { pairInput, parseInput, productInput } from "./input";
import { ScienceError, type Phase2PreprocessingPlan, type ScientificPair, type ScientificProduct } from "./types";

async function reserveIntake(ownerId: string, operation: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`);
    const [recent] = await tx.select({ value:count() }).from(metadataIntakes).where(and(eq(metadataIntakes.ownerId,ownerId),gt(metadataIntakes.createdAt,new Date(Date.now()-15*60_000))));
    if(recent.value>=40) throw new ScienceError("RATE_LIMIT", "This session reached 40 metadata operations in 15 minutes. Wait before retrying; no bulk downloads are permitted.",429);
    const [total] = await tx.select({value:count()}).from(scientificProducts).where(eq(scientificProducts.ownerId,ownerId));
    if(operation==="intake" && total.value>=100) throw new ScienceError("STORAGE_LIMIT","This session reached its 100-product metadata limit.",429);
    await tx.insert(metadataIntakes).values({ownerId,operation});
  });
}

export async function createScientificProduct(ownerId: string, value: unknown): Promise<ScientificProduct> {
  const submitted = parseInput(productInput,value);
  await reserveIntake(ownerId,"intake");
  const {bytes,snapshot}=await acquireMetadata(submitted.input);
  const originalHash=sha256(bytes);
  const metadata=inspectMetadata(bytes,snapshot,submitted.sensor);
  const footprint=inspectFootprint(metadata,snapshot);
  if(sha256(bytes)!==originalHash) throw new ScienceError("IMMUTABILITY_VIOLATION","Metadata bytes changed during inspection; no result was stored.",500);
  const product:ScientificProduct={id:randomUUID(),role:submitted.role,selectedSensor:submitted.sensor,snapshot,metadata,footprint,createdAt:new Date().toISOString()};
  await db.insert(scientificProducts).values({id:product.id,ownerId,role:product.role,sensor:product.selectedSensor,sha256:originalHash,rawBase64:bytes.toString("base64"),document:product});
  return product;
}
export async function getScientificProduct(ownerId:string,id:string):Promise<ScientificProduct> {
  const [row]=await db.select({document:scientificProducts.document,raw:scientificProducts.rawBase64,hash:scientificProducts.sha256}).from(scientificProducts).where(and(eq(scientificProducts.id,id),eq(scientificProducts.ownerId,ownerId))).limit(1);
  if(!row) throw new ScienceError("NOT_FOUND","Product not found in this session.",404);
  if(sha256(Buffer.from(row.raw,"base64"))!==row.hash || row.document.snapshot.sha256!==row.hash) throw new ScienceError("CHECKSUM_MISMATCH","Stored metadata snapshot failed its integrity check. Overlap validation is blocked.",409);
  return row.document;
}
export async function listScientificProducts(ownerId:string) {
  const rows=await db.select({document:scientificProducts.document}).from(scientificProducts).where(eq(scientificProducts.ownerId,ownerId)).orderBy(desc(scientificProducts.createdAt)).limit(100);
  return rows.map(row=>({id:row.document.id,role:row.document.role,sensor:row.document.selectedSensor,productId:row.document.metadata.fields.productId?.value??null,fileName:row.document.snapshot.fileName,metadataStatus:row.document.metadata.status,footprintStatus:row.document.footprint.status,createdAt:row.document.createdAt}));
}
export async function createScientificPair(ownerId:string,input:unknown):Promise<ScientificPair> {
  const value=parseInput(pairInput,input);
  const [source,reference]=await Promise.all([getScientificProduct(ownerId,value.sourceProductId),getScientificProduct(ownerId,value.referenceProductId)]);
  if(source.role!=="source" || source.selectedSensor==="lro_nac" || reference.role!=="reference" || reference.selectedSensor!=="lro_nac") throw new ScienceError("INVALID_PAIR","A pair requires exactly one source product (OHRC OR TMC-2 OR IIRS) and exactly one LRO NAC reference.");
  await reserveIntake(ownerId,"pair");
  const id=randomUUID();
  const [row]=await db.insert(scientificPairs).values({id,ownerId,sourceProductId:source.id,referenceProductId:reference.id}).returning({createdAt:scientificPairs.createdAt});
  return {id,source,reference,state:"NOT_EVALUATED",report:null,createdAt:row.createdAt.toISOString()};
}
export async function getScientificPair(ownerId:string,id:string):Promise<ScientificPair> {
  const [row]=await db.select().from(scientificPairs).where(and(eq(scientificPairs.id,id),eq(scientificPairs.ownerId,ownerId))).limit(1);
  if(!row) throw new ScienceError("NOT_FOUND","Pair not found in this session.",404);
  const [source,reference]=await Promise.all([getScientificProduct(ownerId,row.sourceProductId),getScientificProduct(ownerId,row.referenceProductId)]);
  const [report]=await db.select({document:overlapReports.document}).from(overlapReports).where(and(eq(overlapReports.pairId,id),eq(overlapReports.ownerId,ownerId))).orderBy(desc(overlapReports.createdAt),desc(overlapReports.id)).limit(1);
  return {id,source,reference,state:report?.document.status??"NOT_EVALUATED",report:report?.document??null,createdAt:row.createdAt.toISOString()};
}
export async function listScientificPairs(ownerId:string) {
  return db.select({id:scientificPairs.id,sourceProductId:scientificPairs.sourceProductId,referenceProductId:scientificPairs.referenceProductId,createdAt:scientificPairs.createdAt}).from(scientificPairs).where(eq(scientificPairs.ownerId,ownerId)).orderBy(desc(scientificPairs.createdAt)).limit(25);
}
export async function evaluateScientificPair(ownerId:string,id:string) {
  const pair=await getScientificPair(ownerId,id);
  await reserveIntake(ownerId,"overlap");
  const report=validateOverlap(pair.source,pair.reference,pair.id);
  await db.insert(overlapReports).values({ownerId,pairId:id,status:report.status,document:report});
  return report;
}

export interface PreprocessingInput extends Phase2Options {
  pairId: string;
}
export async function createPreprocessingPlan(ownerId:string,input:unknown):Promise<{plan:Phase2PreprocessingPlan;markdown:string}> {
  const parsed=parseInput(
    (await import("zod")).z.object({
      pairId:(await import("zod")).z.string().uuid(),
      targetMetresPerPixel:(await import("zod")).z.number().positive().optional(),
      longAxisTileLength:(await import("zod")).z.number().int().min(16).optional(),
      longAxisTileOverlap:(await import("zod")).z.number().min(0).max(0.5).optional(),
      overlapCropMargin:(await import("zod")).z.number().min(0).optional(),
      anisotropic:(await import("zod")).z.object({
        enabled:(await import("zod")).z.boolean().optional(),
        rangeMin:(await import("zod")).z.number().optional(),
        rangeMax:(await import("zod")).z.number().optional(),
        steps:(await import("zod")).z.number().int().min(2).max(50).optional(),
      }).strict().optional(),
    }).strict(),
    input,
  );
  const pair=await getScientificPair(ownerId,parsed.pairId);
  const [reportRow]=await db.select({document:overlapReports.document}).from(overlapReports).where(and(eq(overlapReports.pairId,parsed.pairId),eq(overlapReports.ownerId,ownerId))).orderBy(desc(overlapReports.createdAt),desc(overlapReports.id)).limit(1);
  await reserveIntake(ownerId,"preprocessing");
  const plan=buildPhase2Plan(pair,reportRow?.document??null,parsed);
  await db.insert(preprocessingPlans).values({ownerId,pairId:parsed.pairId,status:plan.status,document:plan});
  return {plan,markdown:formatPhase2Report(plan)};
}
export async function getPreprocessingPlan(ownerId:string,pairId:string):Promise<Phase2PreprocessingPlan|null> {
  const [row]=await db.select({document:preprocessingPlans.document}).from(preprocessingPlans).where(and(eq(preprocessingPlans.pairId,pairId),eq(preprocessingPlans.ownerId,ownerId))).orderBy(desc(preprocessingPlans.createdAt),desc(preprocessingPlans.id)).limit(1);
  return row?.document??null;
}
