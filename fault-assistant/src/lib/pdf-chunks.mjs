// Turns extracted PDF page text into searchable passages with page references.
// Browser-safe. Text extraction itself happens at build time (src/build/pdf-extract.mjs).
//
// Long PDFs are split at numbered headings (e.g. "4.2 Low discharge pressure")
// and at a maximum passage size. Repeated running headers/footers and bare page
// numbers are removed. Pages without a text layer are reported, not guessed.

import { dominantLanguage, hasGujarati } from "./text.mjs";

export const MAX_PASSAGE_CHARS = 900;
const HEADING = /^(\d{1,2}(?:\.\d{1,2}){0,3})\s+(\S.{2,90})$/;
const FAULT_HEADING = /^(fault|troubleshooting|error|alarm|ખામી|ભૂલ)\b/i;
const PAGE_NUMBER = /^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i;

function cleanLines(pages) {
  const normalised = pages.map((page) =>
    String(page.text ?? "")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
  // Running headers/footers: short lines repeated on at least half of several pages.
  const counts = new Map();
  for (const lines of normalised) {
    for (const line of new Set(lines)) {
      if (line.length <= 80) counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  const threshold = pages.length >= 3 ? Math.ceil(pages.length / 2) : Infinity;
  return normalised.map((lines, index) => ({
    page: pages[index].page,
    lines: lines.filter((line) => {
      if (PAGE_NUMBER.test(line)) return false;
      if ((counts.get(line) ?? 0) >= threshold) return false;
      return true;
    }),
  }));
}

function isHeading(line) {
  const match = line.match(HEADING);
  if (!match) return null;
  if (/[.;:,]$/.test(line)) return null;
  return { number: match[1], title: match[2].trim() };
}

/**
 * @param {{ page: number, text: string }[]} pages  Text per page (1-based page numbers).
 * @param {{ manualId: string, manualTitle: object, file: string }} meta
 * @returns {{ chunks: object[], warnings: string[] }}
 */
export function passagesFromPages(pages, meta) {
  const warnings = [];
  const cleaned = cleanLines(pages);
  for (const page of cleaned) {
    if (page.lines.length === 0) {
      warnings.push(`${meta.file}: page ${page.page} has no extractable text (scanned page? add a text layer or typed notes)`);
    }
  }

  const chunks = [];
  let current = null;
  const flush = () => {
    if (!current || current.text.length === 0) return;
    const text = current.text.join("\n").trim();
    const lang = dominantLanguage(text) ?? "en";
    const title = current.title ?? `${meta.file} p.${current.pages[0]}`;
    chunks.push({
      id: `${meta.manualId}:p${current.pages[0]}-${chunks.length + 1}`,
      manualId: meta.manualId,
      kind: "passage",
      title: lang === "gu" ? { en: null, gu: title } : { en: title, gu: null },
      codes: [],
      items: [{ type: "text", n: null, en: lang === "en" ? text : null, gu: lang === "gu" ? text : null }],
      source: { file: meta.file, section: null, line: null, position: chunks.length + 1 },
      pages: [...new Set(current.pages)].sort((a, b) => a - b),
      language: lang,
    });
    current = null;
  };

  for (const page of cleaned) {
    for (const line of page.lines) {
      const heading = isHeading(line);
      const startsFault = FAULT_HEADING.test(line);
      if (heading || startsFault) {
        flush();
        current = { title: heading ? `${heading.number} ${heading.title}` : line, text: [], pages: [page.page] };
        current.text.push(line);
        continue;
      }
      if (!current) current = { title: null, text: [], pages: [] };
      const size = current.text.reduce((sum, value) => sum + value.length + 1, 0);
      if (size + line.length > MAX_PASSAGE_CHARS && current.text.length > 0) {
        flush();
        current = { title: null, text: [], pages: [] };
      }
      current.text.push(line);
      if (!current.pages.includes(page.page)) current.pages.push(page.page);
    }
  }
  flush();

  // Gujarati-dominant passages are flagged so the UI can explain language mismatch.
  for (const chunk of chunks) {
    if (chunk.pages.length === 0) chunk.pages = [pages[0]?.page ?? 1];
    if (!chunk.items[0].en && !chunk.items[0].gu) warnings.push(`${meta.file}: empty passage skipped`);
    if (hasGujarati(chunk.items[0].gu ?? "")) chunk.language = "gu";
  }
  return { chunks: chunks.filter((chunk) => chunk.items[0].en || chunk.items[0].gu), warnings };
}
