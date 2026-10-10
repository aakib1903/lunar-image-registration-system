// Bilingual technical glossary. Each group lists terms that mean the same thing
// in English and Gujarati. When a query mentions any term of a group, the other
// terms are added to the query at reduced weight, so a Gujarati description can
// retrieve English manual text and vice versa.
//
// Review note: Gujarati terms should be checked by a Gujarati-speaking
// technician before field use. Keep groups small and specific.

import { normalizeText, tokenize, stemOf } from "./text.mjs";

export const GLOSSARY = [
  ["motor", "મોટર"],
  ["pump", "પંપ"],
  ["overheat", "overheating", "overheated", "ઓવરહીટ", "વધુ ગરમ", "વધારે ગરમ", "અતિ ગરમ", "ગરમ થાય", "ગરમ થવું"],
  ["temperature", "temp", "તાપમાન", "ઊંચું તાપમાન", "ઉંચું તાપમાન"],
  ["hot", "heat", "heating", "ગરમ", "ગરમી"],
  ["noise", "noisy", "sound", "અવાજ", "ઘોંઘાટ", "ઘોંઘાટિયો"],
  ["vibration", "vibrate", "vibrating", "shaking", "કંપન", "ધ્રુજારી", "ધ્રૂજે"],
  ["pressure", "દબાણ", "પ્રેશર"],
  ["low", "ઓછું", "ઓછો", "ઓછી", "નીચું", "નીચો"],
  ["high", "ઊંચું", "ઊંચો", "ઊંચી", "ઉંચું", "ઉંચો", "વધુ", "વધારે"],
  ["leak", "leaking", "leakage", "drip", "dripping", "લીકેજ", "લીક", "ટપકવું", "ટપકે", "ટપકી"],
  ["power", "electricity", "electric", "supply", "વીજળી", "વીજ", "પાવર", "વીજપુરવઠો", "સપ્લાય"],
  ["start", "starting", "started", "શરૂ", "શરૂ થતી", "શરૂ થાય", "ચાલુ થતી"],
  ["run", "running", "runs", "ચાલતી", "ચાલે", "ચાલતું"],
  ["trip", "tripping", "tripped", "ટ્રિપ", "ટ્રિપ થાય", "ટ્રીપ"],
  ["overload", "overloaded", "ઓવરલોડ", "ઓવર લોડ"],
  ["fuse", "fuses", "blown", "ફ્યુઝ", "ફ્યુઝ ઊડી", "ઉડી ગયો"],
  ["seal", "seals", "gland", "સીલ", "ગ્લેન્ડ"],
  ["bearing", "bearings", "બેરિંગ"],
  ["valve", "valves", "વાલ્વ"],
  ["filter", "strainer", "ફિલ્ટર", "સ્ટ્રેનર"],
  ["clog", "clogged", "clogging", "blocked", "blockage", "obstruction", "ભરાયેલું", "ભરાયેલ", "ભરાઈ", "અવરોધ", "બ્લોક"],
  ["fault", "faults", "error", "alarm", "ખામી", "ખામીઓ", "ભૂલ", "એલાર્મ", "ફોલ્ટ"],
  ["code", "codes", "display", "કોડ", "ડિસ્પ્લે"],
  ["contactor", "કોન્ટેક્ટર"],
  ["sensor", "સેન્સર"],
  ["oil", "lubricant", "lubrication", "તેલ", "લુબ્રિકેશન", "લુબ્રિકન્ટ"],
  ["belt", "belts", "બેલ્ટ"],
  ["water", "પાણી"],
  ["flow", "discharge", "output", "પ્રવાહ", "ડિસ્ચાર્જ", "આઉટપુટ"],
  ["switch", "switches", "સ્વિચ"],
  ["cable", "cables", "wire", "wiring", "કેબલ", "વાયર", "વાયરિંગ"],
  ["terminal", "terminals", "ટર્મિનલ"],
  ["stop", "stops", "stopped", "stopping", "બંધ", "બંધ થઈ", "બંધ પડી", "બંધ થાય"],
  ["fan", "cooling", "ઠંડક", "પંખો", "કૂલિંગ"],
  ["alignment", "misalignment", "ગોઠવણી", "અલાઇનમેન્ટ"],
];

function termTokens(term) {
  return tokenize(term).map((token) => stemOf(token));
}

/** Pre-computed glossary entries: stemmed token sequences per term. */
const ENTRIES = GLOSSARY.map((group) =>
  group.map((term) => ({ term: normalizeText(term), tokens: termTokens(term) })),
);

function containsSequence(haystack, needle) {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let match = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/**
 * Returns the glossary terms that should be added to a query.
 * A group is triggered when any of its terms appears (as a stemmed token
 * sequence) in the query. Terms already present in the query are skipped.
 */
export function expandQuery(queryText) {
  const queryStems = tokenize(queryText).map((token) => stemOf(token));
  const queryTokens = new Set(tokenize(queryText));
  const added = new Map();
  for (const group of ENTRIES) {
    const triggered = group.some((entry) => containsSequence(queryStems, entry.tokens));
    if (!triggered) continue;
    for (const entry of group) {
      if (queryTokens.has(entry.term)) continue;
      for (const token of tokenize(entry.term)) {
        if (!queryTokens.has(token)) added.set(token, true);
      }
      for (const stem of entry.tokens) {
        if (!queryStems.includes(stem)) added.set(stem, true);
      }
    }
  }
  return [...added.keys()];
}
