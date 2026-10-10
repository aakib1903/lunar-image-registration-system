// Parser for bilingual troubleshooting manuals written in Markdown.
// Browser-safe (pure string processing).
//
// Format (see README.md for the full authoring guide):
//
//   ---
//   title: MP-200 Motor-Pump Set | MP-200 મોટર-પંપ સેટ
//   revision: 2026-01
//   ---
//   ## FAULT-01 | Motor does not start | મોટર શરૂ થતી નથી
//   codes: E-14, E-15
//   symptom: Start pressed, nothing happens | સ્ટાર્ટ દબાવ્યા પછી કંઈ થતું નથી
//   safety: Isolate and lock out the supply first | પહેલા વીજપુરવઠો બંધ કરી લોક લગાવો
//   1. Check the supply voltage at the terminals. | ટર્મિનલ પર વીજ-વોલ્ટેજ તપાસો.
//
// A line is split into English and Gujarati with " | " (space, bar, space).
// Lines with only one language are accepted; the script decides the language.

import { hasGujarati } from "./text.mjs";

const FIELD_PATTERN = /^(codes?|symptoms?|safety|warnings?|cautions?|notes?)\s*:\s*(.*)$/i;
const STEP_PATTERN = /^(\d{1,3})[.)]\s+(.*)$/;
const BULLET_PATTERN = /^[-*]\s+(.*)$/;
const SEPARATOR = " | ";

const FIELD_TYPES = {
  symptom: "symptom",
  symptoms: "symptom",
  safety: "safety",
  warning: "safety",
  warnings: "safety",
  caution: "safety",
  cautions: "safety",
  note: "note",
  notes: "note",
};

/** Splits "EN | GU" text into { en, gu }, assigning parts by script. */
export function splitBilingual(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { en: null, gu: null };
  const parts = raw.split(SEPARATOR).map((part) => part.trim()).filter(Boolean);
  const out = { en: null, gu: null };
  if (parts.length === 1) {
    if (hasGujarati(parts[0])) out.gu = parts[0];
    else out.en = parts[0];
    return out;
  }
  const gujaratiParts = parts.filter((part) => hasGujarati(part));
  const latinParts = parts.filter((part) => !hasGujarati(part));
  out.en = latinParts.length ? latinParts.join(SEPARATOR) : null;
  out.gu = gujaratiParts.length ? gujaratiParts.join(SEPARATOR) : null;
  return out;
}

function appendBilingual(target, addition) {
  if (addition.en) target.en = target.en ? `${target.en} ${addition.en}` : addition.en;
  if (addition.gu) target.gu = target.gu ? `${target.gu} ${addition.gu}` : addition.gu;
}

export function slugify(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "section";
}

function parseFrontMatter(lines) {
  const meta = {};
  if (lines[0]?.trim() !== "---") return { meta, bodyStart: 0 };
  let end = 1;
  while (end < lines.length && lines[end].trim() !== "---") end += 1;
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
    if (match) meta[match[1].toLowerCase()] = match[2].trim();
  }
  return { meta, bodyStart: Math.min(end + 1, lines.length) };
}

function parseSectionHeader(headerText, fallbackIndex) {
  const parts = headerText.split(SEPARATOR).map((part) => part.trim()).filter(Boolean);
  let sectionId;
  let titleParts;
  if (parts.length >= 2 && !/\s/.test(parts[0]) && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(parts[0])) {
    sectionId = parts[0];
    titleParts = parts.slice(1);
  } else {
    titleParts = parts;
    sectionId = `${slugify(parts[0] ?? "")}` || `section-${fallbackIndex}`;
  }
  const title = { en: null, gu: null };
  for (const part of titleParts) {
    if (hasGujarati(part)) title.gu = title.gu ? `${title.gu} ${part}` : part;
    else title.en = title.en ? `${title.en} ${part}` : part;
  }
  return { sectionId, title };
}

/**
 * Parses one manual.
 * @param {string} source  Markdown text.
 * @param {{ fileName: string }} options
 * @returns {{ manual: object, chunks: object[], warnings: string[] }}
 */
export function parseManualMarkdown(source, { fileName }) {
  const lines = String(source).split(/\r?\n/);
  const { meta, bodyStart } = parseFrontMatter(lines);
  const warnings = [];
  const manualId = slugify(meta.id ?? fileName.replace(/\.[^.]+$/, ""));
  const manual = {
    id: manualId,
    title: splitBilingual(meta.title ?? fileName),
    revision: meta.revision ?? null,
    file: fileName,
  };
  if (!manual.title.en) warnings.push(`${fileName}: manual title has no English text`);
  if (!manual.title.gu) warnings.push(`${fileName}: manual title has no Gujarati text`);

  const sections = [];
  let current = null;
  let lastItem = null;

  const startSection = (headerText) => {
    const { sectionId, title } = parseSectionHeader(headerText, sections.length + 1);
    current = { sectionId, title, codes: [], items: [], line: 0 };
    lastItem = null;
    sections.push(current);
  };

  for (let index = bodyStart; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();
    if (/^##\s+/.test(line) && !/^###/.test(line)) {
      startSection(line.replace(/^##\s+/, ""));
      current.line = index + 1;
      continue;
    }
    if (!current) continue;
    if (line === "") {
      lastItem = null;
      continue;
    }
    if (line.startsWith("#")) continue;

    const field = line.match(FIELD_PATTERN);
    if (field) {
      const key = field[1].toLowerCase();
      if (key.startsWith("code")) {
        current.codes.push(...field[2].split(/[,;]/).map((code) => code.trim()).filter(Boolean));
        lastItem = null;
        continue;
      }
      const type = FIELD_TYPES[key];
      lastItem = { type, ...splitBilingual(field[2]) };
      current.items.push(lastItem);
      continue;
    }

    const step = line.match(STEP_PATTERN);
    if (step) {
      lastItem = { type: "step", n: Number(step[1]), ...splitBilingual(step[2]) };
      current.items.push(lastItem);
      continue;
    }

    const bullet = line.match(BULLET_PATTERN);
    if (bullet) {
      lastItem = { type: "note", ...splitBilingual(bullet[1]) };
      current.items.push(lastItem);
      continue;
    }

    // Continuation of the previous step/field.
    if (lastItem) {
      appendBilingual(lastItem, splitBilingual(line));
    } else {
      warnings.push(`${fileName}:${index + 1}: text outside a step or field was ignored`);
    }
  }

  const chunks = [];
  sections.forEach((section, position) => {
    const label = `${fileName} section ${section.sectionId}`;
    const items = section.items.map((item) => {
      const out = { type: item.type, en: item.en, gu: item.gu };
      if (item.n !== undefined) out.n = item.n;
      return out;
    });
    const steps = items.filter((item) => item.type === "step");
    if (steps.length === 0) warnings.push(`${label}: no numbered steps`);
    if (!section.title.en) warnings.push(`${label}: heading has no English text`);
    if (!section.title.gu) warnings.push(`${label}: heading has no Gujarati text`);
    const missingGujarati = items.filter((item) => !item.gu).length;
    if (missingGujarati) warnings.push(`${label}: ${missingGujarati} line(s) without Gujarati text`);
    const missingEnglish = items.filter((item) => !item.en).length;
    if (missingEnglish) warnings.push(`${label}: ${missingEnglish} line(s) without English text`);
    const seen = new Set();
    for (const code of section.codes) {
      if (seen.has(code.toLowerCase())) warnings.push(`${label}: duplicate code ${code}`);
      seen.add(code.toLowerCase());
    }
    chunks.push({
      id: `${manualId}:${section.sectionId}`,
      manualId,
      kind: "fault",
      title: section.title,
      codes: section.codes,
      items,
      source: { file: fileName, section: section.sectionId, line: section.line, position: position + 1 },
      pages: null,
    });
  });

  const ids = new Set();
  for (const chunk of chunks) {
    if (ids.has(chunk.id)) warnings.push(`${fileName}: duplicate section id ${chunk.id}`);
    ids.add(chunk.id);
  }
  return { manual, chunks, warnings };
}
