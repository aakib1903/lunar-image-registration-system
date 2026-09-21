import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import type { ScientificProduct, OverlapReport, Phase2PreprocessingPlan } from "@/science/types";

export const sourceSensor = pgEnum("lunar_source_sensor", ["ohrc", "tmc2", "iirs"]);

// Planning records only. A draft is never a processing run or a scientific result.
export const missionPlans = pgTable("lunar_mission_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  sourceSensor: sourceSensor("source_sensor").notNull(),
  referenceSensor: varchar("reference_sensor", { length: 20 }).default("lro_nac").notNull(),
  sourceProductId: varchar("source_product_id", { length: 200 }),
  referenceProductId: varchar("reference_product_id", { length: 200 }),
  tileOverlap: integer("tile_overlap").default(20).notNull(),
  notes: text("notes").default("").notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("lunar_plans_owner_idx").on(table.ownerId),
  check("lunar_reference_is_nac", sql`${table.referenceSensor} = 'lro_nac'`),
  check("lunar_overlap_range", sql`${table.tileOverlap} >= 10 AND ${table.tileOverlap} <= 50`),
  check("lunar_plans_are_drafts", sql`${table.status} = 'draft'`),
]);

export const scientificRole = pgEnum("phase1_product_role", ["source", "reference"]);
export const scientificSensor = pgEnum("phase1_sensor", ["ohrc", "tmc2", "iirs", "lro_nac"]);
export const overlapState = pgEnum("phase1_overlap_state", ["OVERLAP", "NO_OVERLAP", "INSUFFICIENT_DATA", "UNVERIFIED"]);

// Append-only evidence. No source raster is stored, written, opened, or altered here.
export const scientificProducts = pgTable("phase1_products", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  role: scientificRole("role").notNull(),
  sensor: scientificSensor("sensor").notNull(),
  sha256: varchar("sha256", {length:64}).notNull(),
  rawBase64: text("raw_base64").notNull(),
  document: jsonb("document").$type<ScientificProduct>().notNull(),
  createdAt: timestamp("created_at", {withTimezone:true}).defaultNow().notNull(),
}, table => [
  index("phase1_product_owner_idx").on(table.ownerId),
  unique("phase1_product_identity_role_owner").on(table.id, table.role, table.ownerId),
  check("phase1_source_reference_sensors", sql`(${table.role} = 'source' AND ${table.sensor} IN ('ohrc','tmc2','iirs')) OR (${table.role} = 'reference' AND ${table.sensor} = 'lro_nac')`),
  check("phase1_label_budget", sql`char_length(${table.rawBase64}) <= 349528`),
]);

export const scientificPairs = pgTable("phase1_pairs", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  sourceProductId: uuid("source_product_id").notNull(),
  referenceProductId: uuid("reference_product_id").notNull(),
  sourceRole: scientificRole("source_role").default("source").notNull(),
  referenceRole: scientificRole("reference_role").default("reference").notNull(),
  createdAt: timestamp("created_at", {withTimezone:true}).defaultNow().notNull(),
}, table => [
  index("phase1_pair_owner_idx").on(table.ownerId),
  unique("phase1_pair_owner_identity").on(table.id, table.ownerId),
  check("phase1_distinct_products", sql`${table.sourceProductId} <> ${table.referenceProductId}`),
  check("phase1_single_pair_roles", sql`${table.sourceRole} = 'source' AND ${table.referenceRole} = 'reference'`),
  foreignKey({name:"phase1_source_role_owner_fk",columns:[table.sourceProductId,table.sourceRole,table.ownerId],foreignColumns:[scientificProducts.id,scientificProducts.role,scientificProducts.ownerId]}),
  foreignKey({name:"phase1_reference_role_owner_fk",columns:[table.referenceProductId,table.referenceRole,table.ownerId],foreignColumns:[scientificProducts.id,scientificProducts.role,scientificProducts.ownerId]}),
]);

export const overlapReports = pgTable("phase1_overlap_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  pairId: uuid("pair_id").notNull(),
  status: overlapState("status").notNull(),
  document: jsonb("document").$type<OverlapReport>().notNull(),
  createdAt: timestamp("created_at", {withTimezone:true}).defaultNow().notNull(),
}, table => [
  index("phase1_report_pair_idx").on(table.pairId, table.createdAt),
  foreignKey({name:"phase1_report_pair_owner_fk",columns:[table.pairId,table.ownerId],foreignColumns:[scientificPairs.id,scientificPairs.ownerId]}),
]);

export const metadataIntakes = pgTable("phase1_intake_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  operation: varchar("operation", {length:20}).notNull(),
  createdAt: timestamp("created_at", {withTimezone:true}).defaultNow().notNull(),
}, table => [index("phase1_intake_owner_time_idx").on(table.ownerId,table.createdAt)]);

export const preprocessingStatus = pgEnum("phase2_preprocessing_status", ["PLANNED", "INSUFFICIENT_DATA", "UNVERIFIED"]);

export const preprocessingPlans = pgTable("phase2_preprocessing_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  pairId: uuid("pair_id").notNull(),
  status: preprocessingStatus("status").notNull(),
  document: jsonb("document").$type<Phase2PreprocessingPlan>().notNull(),
  createdAt: timestamp("created_at", {withTimezone:true}).defaultNow().notNull(),
}, table => [
  index("phase2_preprocessing_pair_idx").on(table.pairId, table.createdAt),
  foreignKey({name:"phase2_preprocessing_pair_owner_fk",columns:[table.pairId,table.ownerId],foreignColumns:[scientificPairs.id,scientificPairs.ownerId]}),
]);

