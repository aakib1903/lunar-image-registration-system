// Text normalisation, tokenisation and light stemming for English and Gujarati.
// Browser-safe: no Node-only imports.

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;
const GUJARATI_DIGIT = /[\u0AE6-\u0AEF]/g;
const DASHES = /[\u2010-\u2015\u2212]/g;
const GUJARATI_SCRIPT = /\p{Script=Gujarati}/u;
const LATIN_LETTER = /\p{Script=Latin}/u;

// Gujarati inflectional suffixes (postpositions, plural and case endings).
// Longest match first; a stem must keep at least two code points.
const GU_SUFFIXES = [
  "ઓનાં", "ઓની", "ઓનું", "ોનાં", "ોની", "ોનું", "ોના", "ોને", "ોમાં", "ોથી", "ોએ",
  "નાં", "ની", "નું", "ના", "ને", "માં", "થી", "નો", "ની", "ઓ", "ો", "ી", "ું", "ે", "ા",
];

const EN_SUFFIXES = ["ations", "ation", "ings", "ing", "ions", "ion", "ed", "es", "s"];

export function normalizeText(input) {
  return String(input ?? "")
    .normalize("NFC")
    .replace(ZERO_WIDTH, "")
    .replace(GUJARATI_DIGIT, (digit) => String(digit.charCodeAt(0) - 0x0ae6))
    .replace(DASHES, "-")
    .toLowerCase();
}

export function tokenize(input) {
  return normalizeText(input)
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
}

function stripGujaratiSuffix(token) {
  const points = [...token];
  for (const suffix of GU_SUFFIXES) {
    const suffixPoints = [...suffix].length;
    if (token.endsWith(suffix) && points.length - suffixPoints >= 2) {
      return points.slice(0, points.length - suffixPoints).join("");
    }
  }
  return token;
}

function stripEnglishSuffix(token) {
  for (const suffix of EN_SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}

/** Returns the stem of a single normalised token. */
export function stemOf(token) {
  if (GUJARATI_SCRIPT.test(token)) return stripGujaratiSuffix(token);
  if (/^[a-z]+$/.test(token)) return stripEnglishSuffix(token);
  return token;
}

/** Index/query terms for a text: each token plus its stem (deduplicated). */
export function termsOf(input) {
  const out = new Set();
  for (const token of tokenize(input)) {
    out.add(token);
    const stem = stemOf(token);
    if (stem) out.add(stem);
  }
  return [...out];
}

/** Canonical fault-code key, e.g. "E-14", "e 14" and "E14" all become "e14". */
export function codeKey(code) {
  return normalizeText(code).replace(/[\s._-]+/g, "");
}

/**
 * Extracts candidate fault codes (1-4 letters, optional separator, 1-5 digits,
 * optional letter) from free text. Returns canonical keys.
 */
export function extractCodeKeys(input) {
  const keys = new Set();
  const text = normalizeText(input);
  const pattern = /(?<![\p{L}\p{N}])([a-z]{1,4})[\s._-]?(\d{1,5}[a-z]?)(?![\p{L}\p{N}])/gu;
  for (const match of text.matchAll(pattern)) {
    keys.add(`${match[1]}${match[2]}`);
  }
  return [...keys];
}

/** Script heuristic used for PDF passages and display fallbacks. */
export function dominantLanguage(input) {
  let gujarati = 0;
  let latin = 0;
  for (const char of String(input ?? "")) {
    if (GUJARATI_SCRIPT.test(char)) gujarati += 1;
    else if (LATIN_LETTER.test(char)) latin += 1;
  }
  if (gujarati === 0 && latin === 0) return null;
  return gujarati > latin ? "gu" : "en";
}

/** True when the text contains at least one Gujarati character. */
export function hasGujarati(input) {
  return GUJARATI_SCRIPT.test(String(input ?? ""));
}
