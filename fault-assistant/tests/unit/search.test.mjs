import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSearchIndex, search } from "../../src/lib/search.mjs";
import { parseManualMarkdown } from "../../src/lib/manual-parse.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sampleSource = await readFile(join(here, "..", "..", "manuals", "sample-mp200-motor-pump.md"), "utf8");
const { chunks } = parseManualMarkdown(sampleSource, { fileName: "sample-mp200-motor-pump.md" });
const index = buildSearchIndex(chunks);

function topSection(query) {
  const [first] = search(index, query);
  return first ? first.chunk.source.section : null;
}

const CASES = [
  // English descriptions.
  ["motor overheating", "FAULT-02"],
  ["overload trips again", "FAULT-03"],
  ["pump has low pressure", "FAULT-04"],
  ["bearing grinding noise", "FAULT-05"],
  ["water dripping from seal", "FAULT-06"],
  ["display blank no lamps", "FAULT-07"],
  ["motor does not start", "FAULT-01"],
  // Gujarati descriptions.
  ["મોટર વધુ ગરમ થાય છે", "FAULT-02"],
  ["મોટર શરૂ થતી નથી", "FAULT-01"],
  ["ડિસ્ચાર્જ દબાણ ઓછું", "FAULT-04"],
  ["બેરિંગમાંથી અવાજ", "FAULT-05"],
  ["સીલમાંથી પાણી ટપકે છે", "FAULT-06"],
  ["કંટ્રોલ પેનલ બંધ છે", "FAULT-07"],
  // Cross-language: a Gujarati description that only the English glossary path can connect.
  ["મોટરમાં ઓવરલોડ ટ્રિપ", "FAULT-03"],
];

for (const [query, section] of CASES) {
  test(`"${query}" finds ${section}`, () => {
    assert.equal(topSection(query), section);
  });
}

test("fault codes match exactly and are flagged as exact", () => {
  const [first] = search(index, "E-21");
  assert.equal(first.chunk.id, "mp200:FAULT-02");
  assert.equal(first.exact, true);
  assert.deepEqual(first.codeMatches, ["e21"]);
  const gujaratiDigits = search(index, "E-૫૨");
  assert.equal(gujaratiDigits[0].chunk.id, "mp200:FAULT-03");
  assert.equal(gujaratiDigits[0].exact, true);
});

test("a code with no matching section returns nothing exact", () => {
  const results = search(index, "E-999");
  assert.ok(results.every((result) => !result.exact));
});

test("unrelated and empty queries return no procedures", () => {
  assert.deepEqual(search(index, "football score yesterday"), []);
  assert.deepEqual(search(index, "the and of"), []);
  assert.deepEqual(search(index, "   "), []);
});

test("results are sorted by score and limited", () => {
  const results = search(index, "motor pump pressure", { limit: 3 });
  assert.equal(results.length, 3);
  for (let i = 1; i < results.length; i += 1) {
    assert.ok(results[i - 1].score >= results[i].score);
  }
});

test("matched terms explain the match", () => {
  const [first] = search(index, "bearing noise");
  assert.ok(first.matchedTerms.includes("bearing"));
  assert.ok(first.matchedTerms.includes("noise"));
});
