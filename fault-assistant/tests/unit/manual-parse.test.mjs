import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseManualMarkdown, splitBilingual, slugify } from "../../src/lib/manual-parse.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sampleSource = await readFile(join(here, "..", "..", "manuals", "sample-mp200-motor-pump.md"), "utf8");

test("sample manual parses into one chunk per fault with bilingual headings", () => {
  const { manual, chunks, warnings } = parseManualMarkdown(sampleSource, { fileName: "sample-mp200-motor-pump.md" });
  assert.equal(manual.id, "mp200");
  assert.match(manual.title.en, /MP-200 Motor-Pump Set/);
  assert.match(manual.title.gu, /મોટર-પંપ સેટ/);
  assert.equal(manual.revision, "2026-01");
  assert.equal(chunks.length, 7);
  const overheat = chunks.find((chunk) => chunk.source.section === "FAULT-02");
  assert.equal(overheat.id, "mp200:FAULT-02");
  assert.deepEqual(overheat.codes, ["E-21"]);
  assert.equal(overheat.title.en, "Motor overheats");
  assert.equal(overheat.title.gu, "મોટર વધુ ગરમ થાય છે");
  assert.ok(overheat.items.filter((item) => item.type === "step").length >= 5);
  assert.ok(overheat.items.some((item) => item.type === "safety"));
  assert.deepEqual(warnings, [], "the sample must be complete in both languages");
});

test("every sample step has English and Gujarati text", () => {
  const { chunks } = parseManualMarkdown(sampleSource, { fileName: "sample.md" });
  for (const chunk of chunks) {
    for (const item of chunk.items) {
      assert.ok(item.en && item.gu, `${chunk.id} item missing a language: ${JSON.stringify(item)}`);
    }
  }
});

test("splitBilingual assigns parts by script and tolerates a single language", () => {
  assert.deepEqual(splitBilingual("Check supply | વીજપુરવઠો તપાસો"), { en: "Check supply", gu: "વીજપુરવઠો તપાસો" });
  assert.deepEqual(splitBilingual("વીજપુરવઠો તપાસો | Check supply"), { en: "Check supply", gu: "વીજપુરવઠો તપાસો" });
  assert.deepEqual(splitBilingual("Only English"), { en: "Only English", gu: null });
  assert.deepEqual(splitBilingual("માત્ર ગુજરાતી"), { en: null, gu: "માત્ર ગુજરાતી" });
  assert.deepEqual(splitBilingual(""), { en: null, gu: null });
});

test("continuation lines extend the previous step and missing languages are reported", () => {
  const source = [
    "---",
    "title: Test pump",
    "---",
    "## T-1 | Test fault | પરીક્ષણ ખામી",
    "codes: X-1, X-2",
    "1. First line that wraps | પહેલી લાઇન",
    "   continued here",
    "2. Second step with no Gujarati",
    "",
    "stray text after a blank line",
  ].join("\n");
  const { manual, chunks, warnings } = parseManualMarkdown(source, { fileName: "test.md" });
  assert.equal(manual.title.gu, null);
  assert.equal(chunks[0].codes.length, 2);
  const steps = chunks[0].items.filter((item) => item.type === "step");
  assert.equal(steps[0].en, "First line that wraps continued here");
  assert.equal(steps[0].gu, "પહેલી લાઇન");
  assert.equal(steps[1].gu, null);
  assert.ok(warnings.some((w) => /manual title has no Gujarati/.test(w)));
  assert.ok(warnings.some((w) => /1 line\(s\) without Gujarati/.test(w)));
  assert.ok(warnings.some((w) => /outside a step or field/.test(w)));
});

test("sections without an ID get a slug, and duplicate IDs are reported", () => {
  const source = [
    "## Pump does not prime",
    "1. Open the vent",
    "## Pump does not prime",
    "1. Open the vent",
  ].join("\n");
  const { chunks, warnings } = parseManualMarkdown(source, { fileName: "dup.md" });
  assert.equal(chunks[0].id, "dup:pump-does-not-prime");
  assert.ok(warnings.some((w) => /duplicate section id/.test(w)));
});

test("sections with no steps are reported", () => {
  const { warnings } = parseManualMarkdown("## ID-1 | Empty | ખાલી\nsymptom: nothing\n", { fileName: "e.md" });
  assert.ok(warnings.some((w) => /no numbered steps/.test(w)));
});

test("slugify produces ASCII identifiers", () => {
  assert.equal(slugify("MP-200 Motor-Pump Set"), "mp-200-motor-pump-set");
  assert.equal(slugify("   "), "section");
});
