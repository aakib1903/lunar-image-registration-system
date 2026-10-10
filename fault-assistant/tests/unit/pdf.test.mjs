import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { passagesFromPages, MAX_PASSAGE_CHARS } from "../../src/lib/pdf-chunks.mjs";
import { buildSearchIndex, search } from "../../src/lib/search.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "fixtures", "long-manual-extract.pdf");

const meta = { manualId: "pump-extract", manualTitle: { en: "Pump extract", gu: null }, file: "extract.pdf" };

test("running headers and bare page numbers are removed; headings start passages", () => {
  const pages = [1, 2, 3].map((page) => ({
    page,
    text: [
      "MP-200 Service Manual",
      `Page ${page}`,
      page === 2 ? "4.1 Motor does not start\nCheck the supply voltage at the panel input." : "",
      page === 3 ? "4.2 Low discharge pressure\nPrime the pump by opening the vent." : "",
      page === 1 ? "Introduction text for the manual." : "",
    ].join("\n"),
  }));
  const { chunks, warnings } = passagesFromPages(pages, meta);
  assert.deepEqual(warnings, []);
  assert.equal(chunks.length, 3);
  assert.ok(!chunks.some((chunk) => chunk.items[0].en.includes("MP-200 Service Manual")));
  assert.ok(!chunks.some((chunk) => /^Page \d/m.test(chunk.items[0].en)));
  assert.equal(chunks[1].title.en, "4.1 Motor does not start");
  assert.deepEqual(chunks[1].pages, [2]);
  assert.equal(chunks[2].title.en, "4.2 Low discharge pressure");
});

test("scanned pages without a text layer are reported, not guessed", () => {
  const pages = [
    { page: 1, text: "4.1 Heading\nSome text" },
    { page: 2, text: "   \n  " },
  ];
  const { warnings } = passagesFromPages(pages, meta);
  assert.ok(warnings.some((w) => /page 2 has no extractable text/.test(w)));
});

test("long sections are split below the passage size limit", () => {
  const longLine = "Check the terminal connections and record the reading in the log sheet. ".repeat(5);
  const pages = [{ page: 4, text: Array.from({ length: 12 }, () => longLine).join("\n") }];
  const { chunks } = passagesFromPages(pages, meta);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.items[0].en.length <= MAX_PASSAGE_CHARS + longLine.length, "passage too large");
  }
});

test("a real PDF fixture is extracted and its passages are searchable with page references", async () => {
  const { extractPdfPages } = await import("../../src/build/pdf-extract.mjs");
  const { pages, pageCount } = await extractPdfPages(fixture);
  assert.equal(pageCount, 5);
  const { chunks, warnings } = passagesFromPages(pages, { ...meta, file: "long-manual-extract.pdf" });
  assert.deepEqual(warnings, []);
  const index = buildSearchIndex(chunks);
  const [seal] = search(index, "steady leak from the mechanical seal");
  assert.equal(seal.chunk.title.en, "4.4 Seal leakage");
  assert.deepEqual(seal.chunk.pages, [5]);
  const [prime] = search(index, "prime the pump vent");
  assert.equal(prime.chunk.title.en, "4.2 Low discharge pressure");
  assert.deepEqual(prime.chunk.pages, [3]);
  const [noise] = search(index, "bearing grinding");
  assert.deepEqual(noise.chunk.pages, [4]);
});
