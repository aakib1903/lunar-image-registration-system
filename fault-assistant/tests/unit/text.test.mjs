import { test } from "node:test";
import assert from "node:assert/strict";
import { codeKey, dominantLanguage, extractCodeKeys, hasGujarati, normalizeText, stemOf, termsOf, tokenize } from "../../src/lib/text.mjs";
import { expandQuery } from "../../src/lib/glossary.mjs";

test("normalizeText maps Gujarati digits to ASCII and folds case", () => {
  assert.equal(normalizeText("૫૨ E-Trip"), "52 e-trip");
  assert.equal(normalizeText("A\u200Bb\uFEFF"), "ab");
  assert.equal(normalizeText("E\u2013 14"), "e- 14");
});

test("tokenize keeps Gujarati vowel signs and splits on punctuation", () => {
  assert.deepEqual(tokenize("મોટર, વધુ ગરમ થાય છે."), ["મોટર", "વધુ", "ગરમ", "થાય", "છે"]);
  assert.deepEqual(tokenize("Check E-14 now!"), ["check", "e", "14", "now"]);
});

test("stemOf strips common English and Gujarati inflections", () => {
  assert.equal(stemOf("overheating"), "overheat");
  assert.equal(stemOf("vibrating"), "vibrat");
  assert.equal(stemOf("leaks"), "leak");
  assert.equal(stemOf("વીજળીની"), "વીજળી");
  assert.equal(stemOf("મોટરો"), "મોટર");
  // A stem must keep at least two code points so short words are not destroyed.
  assert.equal(stemOf("ની"), "ની");
});

test("termsOf returns both the surface token and its stem", () => {
  const terms = termsOf("overheating motor");
  assert.ok(terms.includes("overheating"));
  assert.ok(terms.includes("overheat"));
  assert.ok(terms.includes("motor"));
});

test("fault codes are extracted and canonicalised", () => {
  assert.equal(codeKey("E-14"), "e14");
  assert.equal(codeKey(" e 14 "), "e14");
  const keys = extractCodeKeys("Display shows E-21 then e 52 and F201, not a word");
  assert.ok(keys.includes("e21"));
  assert.ok(keys.includes("e52"));
  assert.ok(keys.includes("f201"));
});

test("extractCodeKeys ignores codes glued to longer words", () => {
  assert.deepEqual(extractCodeKeys("wordsE14"), []);
});

test("language detection by script", () => {
  assert.equal(dominantLanguage("Check the supply voltage"), "en");
  assert.equal(dominantLanguage("મોટર શરૂ થતી નથી"), "gu");
  assert.equal(dominantLanguage("123 !!"), null);
  assert.equal(hasGujarati("E-14"), false);
  assert.equal(hasGujarati("E-14 ગરમ"), true);
});

test("glossary links Gujarati and English terms in both directions", () => {
  const fromEnglish = expandQuery("motor overheating");
  assert.ok(fromEnglish.includes("ગરમ"), "English overheating should add Gujarati hot");
  assert.ok(fromEnglish.includes("વધુ"));
  const fromGujarati = expandQuery("પંપમાં દબાણ ઓછું");
  assert.ok(fromGujarati.includes("pressure"));
  assert.ok(fromGujarati.includes("low"));
  assert.deepEqual(expandQuery("football scores"), []);
});
