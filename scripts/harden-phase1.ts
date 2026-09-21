import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/db";

async function main() {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION lunaris_phase1_reject_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'LUNARIS Phase 1 evidence is immutable: create a new snapshot, pair, or report instead.';
    END;
    $$;
  `);
  for (const table of ["phase1_products", "phase1_pairs", "phase1_overlap_reports", "phase2_preprocessing_plans"]) {
    const trigger = `${table}_immutable`;
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${trigger} ON ${table}`));
    await db.execute(sql.raw(`CREATE TRIGGER ${trigger} BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION lunaris_phase1_reject_mutation()`));
  }
  console.log("Installed append-only evidence guards for products, pairs, and overlap reports. Original files were not touched.");
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
