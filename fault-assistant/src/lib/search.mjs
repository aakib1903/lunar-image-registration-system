// On-device BM25 retrieval over manual chunks, bilingual (English + Gujarati).
// Fault codes are matched exactly and receive a large boost.
// Browser-safe: no Node-only imports.

import { tokenize, stemOf, extractCodeKeys, codeKey } from "./text.mjs";
import { expandQuery } from "./glossary.mjs";

const K1 = 1.2;
const B = 0.75;
const CODE_BOOST = 12;
const GLOSSARY_WEIGHT = 0.5;
const TITLE_REPEAT = 2;

// Function words that carry no troubleshooting meaning. Kept short on purpose.
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "be", "it", "its", "of", "to", "in", "on",
  "at", "and", "or", "with", "for", "from", "this", "that", "my", "our", "we", "i",
  "do", "does", "not", "no", "dont", "doesnt", "cant", "when", "after", "while",
  "there", "has", "have", "so", "but", "if", "as", "by", "me", "they", "after",
  "છે", "છો", "નથી", "નહીં", "નહિ", "અને", "અથવા", "માં", "થી", "ની", "નું", "ના",
  "ને", "પર", "એ", "આ", "કે", "શું", "તે", "થાય", "થાય છે", "થઈ", "હોય", "મારું",
  "મને", "મારી", "છે.", "કરો", "કરવું", "કર", "અહીં", "ત્યારે", "પછી",
]);

/** Counts term occurrences: each token plus its stem when different. */
export function termCounts(text) {
  const counts = new Map();
  const add = (term) => counts.set(term, (counts.get(term) ?? 0) + 1);
  for (const token of tokenize(text)) {
    if (STOPWORDS.has(token)) continue;
    add(token);
    const stem = stemOf(token);
    if (stem !== token) add(stem);
  }
  return counts;
}

/** Text used to index one chunk. Title is repeated to give it extra weight. */
export function chunkSearchText(chunk) {
  const parts = [];
  for (let i = 0; i < TITLE_REPEAT; i += 1) {
    parts.push(chunk.title?.en ?? "", chunk.title?.gu ?? "");
  }
  parts.push(chunk.manualTitle?.en ?? "", chunk.manualTitle?.gu ?? "");
  parts.push((chunk.codes ?? []).join(" "));
  for (const item of chunk.items ?? []) {
    parts.push(item.en ?? "", item.gu ?? "");
  }
  return parts.filter(Boolean).join("\n");
}

export function buildSearchIndex(chunks) {
  const docs = chunks.map((chunk) => {
    const counts = termCounts(chunkSearchText(chunk));
    let length = 0;
    for (const count of counts.values()) length += count;
    return {
      chunk,
      counts,
      length,
      codeKeys: new Set((chunk.codes ?? []).map(codeKey)),
    };
  });
  const df = new Map();
  for (const doc of docs) {
    for (const term of doc.counts.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const totalLength = docs.reduce((sum, doc) => sum + doc.length, 0);
  return {
    docs,
    df,
    count: docs.length,
    avgLength: docs.length ? totalLength / docs.length : 0,
  };
}

function idf(index, term) {
  const df = index.df.get(term) ?? 0;
  return Math.log(1 + (index.count - df + 0.5) / (df + 0.5));
}

/**
 * Searches the index. Returns up to `limit` results sorted by score.
 * Each result: { chunk, score, matchedTerms, codeMatches, exact }.
 */
export function search(index, queryText, { limit = 5, minScore = 1.0 } = {}) {
  const queryCounts = termCounts(queryText);
  const baseTerms = [...queryCounts.keys()];
  const expansions = expandQuery(queryText).filter((term) => !queryCounts.has(term) && !STOPWORDS.has(term));
  const queryCodes = extractCodeKeys(queryText);
  const weights = new Map();
  for (const term of baseTerms) weights.set(term, 1);
  for (const term of expansions) weights.set(term, GLOSSARY_WEIGHT);

  if (baseTerms.length === 0 && queryCodes.length === 0) return [];

  const results = [];
  for (const doc of index.docs) {
    let score = 0;
    const matchedTerms = [];
    const norm = 1 - B + (B * doc.length) / (index.avgLength || 1);
    for (const [term, weight] of weights) {
      const tf = doc.counts.get(term);
      if (!tf) continue;
      const termScore = idf(index, term) * ((tf * (K1 + 1)) / (tf + K1 * norm));
      score += termScore * weight;
      if (weight === 1) matchedTerms.push(term);
    }
    const codeMatches = queryCodes.filter((code) => doc.codeKeys.has(code));
    score += codeMatches.length * CODE_BOOST;
    if (score <= 0) continue;
    const exact = codeMatches.length > 0;
    if (!exact && score < minScore) continue;
    results.push({
      chunk: doc.chunk,
      score: Math.round(score * 100) / 100,
      matchedTerms: [...new Set(matchedTerms)],
      codeMatches,
      exact,
    });
  }
  results.sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
  return results.slice(0, limit);
}
