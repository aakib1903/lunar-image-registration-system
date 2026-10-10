#!/usr/bin/env node
// Builds the on-device manual index from manuals/*.md and manuals/*.pdf.
// Output: public/data/manuals.json (single file, shipped to the device).
//
//   node scripts/build-index.mjs [--manuals <dir>] [--out <file>] [--strict]
//
// --strict exits with status 1 if any warning is produced (use in CI).

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseManualMarkdown, splitBilingual, slugify } from "../src/lib/manual-parse.mjs";
import { passagesFromPages } from "../src/lib/pdf-chunks.mjs";
import { extractPdfPages } from "../src/build/pdf-extract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const manualsDir = resolve(root, argValue("--manuals", "manuals"));
const outFile = resolve(root, argValue("--out", "public/data/manuals.json"));
const strict = process.argv.includes("--strict");

async function buildFromMarkdown(path, fileName) {
  const source = await readFile(path, "utf8");
  return parseManualMarkdown(source, { fileName });
}

async function buildFromPdf(path, fileName) {
  const { pages, pageCount } = await extractPdfPages(path);
  const manualId = slugify(basename(fileName, extname(fileName)));
  const title = splitBilingual(basename(fileName, extname(fileName)).replace(/[-_]+/g, " "));
  const { chunks, warnings } = passagesFromPages(pages, { manualId, manualTitle: title, file: fileName });
  const manual = { id: manualId, title, revision: null, file: fileName, pageCount };
  return { manual, chunks, warnings };
}

async function main() {
  const entries = (await readdir(manualsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const sources = entries.filter((name) => [".md", ".pdf"].includes(extname(name).toLowerCase()));
  if (sources.length === 0) {
    throw new Error(`No manuals (.md or .pdf) found in ${manualsDir}`);
  }

  const manuals = [];
  const chunks = [];
  const warnings = [];
  for (const fileName of sources) {
    const path = join(manualsDir, fileName);
    const built = extname(fileName).toLowerCase() === ".pdf"
      ? await buildFromPdf(path, fileName)
      : await buildFromMarkdown(path, fileName);
    manuals.push({ ...built.manual, chunkCount: built.chunks.length });
    chunks.push(...built.chunks);
    warnings.push(...built.warnings);
  }

  const ids = new Set();
  for (const chunk of chunks) {
    if (ids.has(chunk.id)) warnings.push(`duplicate chunk id ${chunk.id}`);
    ids.add(chunk.id);
  }

  const index = {
    schema: "fault-assistant/manuals/1",
    builtAt: new Date().toISOString(),
    manuals,
    chunks,
    warnings,
  };

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(index)}\n`, "utf8");

  const gujaratiChunks = chunks.filter((chunk) => chunk.items.some((item) => item.gu)).length;
  console.log(`Manuals: ${manuals.length}; sections/passages: ${chunks.length}; with Gujarati: ${gujaratiChunks}`);
  console.log(`Wrote ${outFile}`);
  if (warnings.length) {
    console.log(`Warnings (${warnings.length}):`);
    for (const warning of warnings) console.log(`  - ${warning}`);
  }
  if (strict && warnings.length) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exit(1);
});
