// Browser entry point. Loads the prebuilt manual index, runs on-device search,
// renders procedures, and handles photo OCR. No network calls except to same-origin
// static files, which the service worker serves from the device cache offline.

import { LANGUAGES, STRINGS, t } from "../lib/i18n.mjs";
import { buildSearchIndex, search } from "../lib/search.mjs";

const LANG_KEY = "faultAssistant.lang";
const CONFIDENT_SCORE = 4;
const EXAMPLES = {
  en: ["motor overheating", "E-14", "pump low pressure", "bearing noise", "water leaking from seal"],
  gu: ["મોટર વધુ ગરમ થાય છે", "E-21", "પંપમાં દબાણ ઓછું", "બેરિંગમાંથી અવાજ", "સીલમાંથી પાણી ટપકે છે"],
};

const state = {
  lang: initialLanguage(),
  index: null,
  chunks: [],
  manuals: new Map(),
  lastRender: null,
  swReady: false,
  busyOcr: false,
  manualData: null,
};

const $ = (id) => document.getElementById(id);

function initialLanguage() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "gu") return saved;
  } catch {
    // Storage can be unavailable (private mode); fall back to browser language.
  }
  return (navigator.language || "").toLowerCase().startsWith("gu") ? "gu" : "en";
}

function setLanguage(lang) {
  state.lang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Ignore: the choice still applies for this session.
  }
  applyLanguage();
}

/** Creates an element with optional text and children. */
function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === "class") node.className = value;
    else if (name === "text") node.textContent = value;
    else node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** Picks the text in the active language, falling back to the other one. */
function pick(item, lang = state.lang) {
  const other = lang === "gu" ? "en" : "gu";
  if (item?.[lang]) return { text: item[lang], fallback: false, language: lang };
  if (item?.[other]) return { text: item[other], fallback: true, language: other };
  return { text: "", fallback: true, language: null };
}

function languageName(code) {
  return code === "gu" ? t(state.lang, "languageGujarati") : t(state.lang, "languageEnglish");
}

function applyLanguage() {
  const lang = state.lang;
  document.documentElement.lang = lang === "gu" ? "gu" : "en";
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(lang, node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.setAttribute("placeholder", t(lang, node.dataset.i18nPlaceholder));
  }
  renderLanguageToggle();
  renderExamples();
  renderBrowseList();
  updateStatus();
  if (state.manualData) renderManualMeta(state.manualData);
  if (state.lastRender) renderResults(state.lastRender.results, state.lastRender.options);
}

function renderLanguageToggle() {
  const toggle = $("langToggle");
  toggle.replaceChildren(
    ...LANGUAGES.map((option) => {
      const button = el("button", {
        type: "button",
        text: option.label,
        "aria-pressed": option.code === state.lang ? "true" : "false",
        lang: option.code,
      });
      button.addEventListener("click", () => setLanguage(option.code));
      return button;
    }),
  );
}

function renderExamples() {
  const container = $("examples");
  const label = el("span", { class: "examples-label", text: t(state.lang, "examples") });
  const chips = EXAMPLES[state.lang].map((text) => {
    const chip = el("button", { type: "button", class: "chip", text });
    chip.addEventListener("click", () => {
      $("query").value = text;
      runSearch();
    });
    return chip;
  });
  container.replaceChildren(label, ...chips);
}

function updateStatus() {
  const online = navigator.onLine;
  const status = $("status");
  status.textContent = online ? t(state.lang, "online") : t(state.lang, "offline");
  status.classList.toggle("is-offline", !online);
  status.classList.toggle("is-ready", !online && state.swReady);
  if (state.manualData) renderManualMeta(state.manualData);
}

function renderBrowseList() {
  const list = $("faultList");
  const items = state.chunks.map((chunk) => {
    const title = pick(chunk.title);
    const code = chunk.codes?.[0];
    const label = [code, title.text || chunk.id].filter(Boolean).join("  ·  ");
    const button = el("button", { type: "button", text: label });
    button.addEventListener("click", () => {
      renderResults([{ chunk, score: 0, matchedTerms: [], codeMatches: [], exact: false }], { heading: null });
      $("results").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return el("li", {}, [button]);
  });
  list.replaceChildren(...items);
}

function manualTitle(manualId) {
  const manual = state.manuals.get(manualId);
  return manual ? pick(manual.title).text : manualId;
}

function sectionLabel(chunk) {
  if (chunk.pages?.length) {
    const first = chunk.pages[0];
    const last = chunk.pages[chunk.pages.length - 1];
    const pageText = first === last ? `${t(state.lang, "page")} ${first}` : `${t(state.lang, "pages")} ${first}–${last}`;
    return pageText;
  }
  return chunk.source?.section ? `${t(state.lang, "section")} ${chunk.source.section}` : null;
}

function renderSafety(items) {
  if (items.length === 0) return null;
  return el("div", { class: "safety", role: "note" }, [
    el("strong", { text: t(state.lang, "safety") }),
    el("ul", {}, items.map((item) => {
      const value = pick(item);
      return el("li", { text: value.text, lang: value.language ?? undefined });
    })),
  ]);
}

function renderSteps(items) {
  const steps = items.filter((item) => item.type === "step");
  if (steps.length === 0) return null;
  return el("div", {}, [
    el("h3", { text: t(state.lang, "steps") }),
    el("ol", {}, steps.map((item) => {
      const value = pick(item);
      return el("li", {}, [
        el("span", { text: value.text, lang: value.language ?? undefined }),
      ]);
    })),
  ]);
}

function renderList(title, items, type) {
  const matching = items.filter((item) => item.type === type);
  if (matching.length === 0) return null;
  return el("div", {}, [
    el("h3", { text: title }),
    el("ul", { class: "plain" }, matching.map((item) => {
      const value = pick(item);
      return el("li", { text: value.text, lang: value.language ?? undefined });
    })),
  ]);
}

function renderPassage(chunk) {
  const item = chunk.items?.[0] ?? {};
  const value = pick(item);
  const originalLanguage = chunk.language ?? value.language;
  const notes = [];
  if (value.fallback && value.text) notes.push(el("p", { class: "lang-note", text: t(state.lang, "missingLanguage") }));
  else if (originalLanguage && originalLanguage !== state.lang) {
    notes.push(el("p", {
      class: "lang-note",
      text: t(state.lang, "passageLanguage", { language: languageName(originalLanguage) }),
    }));
  }
  return el("div", {}, [
    el("h3", { text: t(state.lang, "passage") }),
    el("p", { class: "passage-text", text: value.text, lang: value.language ?? undefined }),
    ...notes,
  ]);
}

function renderResult(result, rank) {
  const { chunk } = result;
  const title = pick(chunk.title);
  const items = chunk.items ?? [];
  const exact = result.exact;
  const card = el("article", { class: `result${exact ? " is-exact" : ""}`, "aria-label": title.text || chunk.id });

  const headChildren = [];
  if (title.fallback && title.text) {
    headChildren.push(el("p", { class: "lang-note", text: t(state.lang, "missingLanguage") }));
  }
  headChildren.push(el("h2", { text: `${rank ? `${rank}. ` : ""}${title.text || chunk.id}`, lang: title.language ?? undefined }));
  const sourceParts = [manualTitle(chunk.manualId), sectionLabel(chunk)].filter(Boolean);
  headChildren.push(el("p", { class: "result-source", text: `${t(state.lang, "manual")}: ${sourceParts.join(" · ")}` }));

  const badges = [];
  if (exact) badges.push(el("span", { class: "badge code", text: `${t(state.lang, "codeMatch")}: ${result.codeMatches.map((c) => c.toUpperCase()).join(", ")}` }));
  for (const code of chunk.codes ?? []) badges.push(el("span", { class: "badge", text: code }));
  if (badges.length) headChildren.push(el("div", { class: "badges" }, badges));
  if (result.matchedTerms?.length) {
    headChildren.push(el("p", {
      class: "matched",
      text: `${t(state.lang, "matchedOn")}: ${result.matchedTerms.slice(0, 6).join(", ")}`,
    }));
  }
  card.append(el("div", { class: "result-head" }, headChildren));

  if (chunk.kind === "passage") {
    card.append(renderPassage(chunk));
  } else {
    const safety = renderSafety(items.filter((item) => item.type === "safety"));
    if (safety) card.append(safety);
    const symptoms = renderList(t(state.lang, "symptoms"), items, "symptom");
    if (symptoms) card.append(symptoms);
    const steps = renderSteps(items);
    if (steps) card.append(steps);
    const notes = renderList(t(state.lang, "notes"), items, "note");
    if (notes) card.append(notes);
  }
  return card;
}

function renderResults(results, options = {}) {
  state.lastRender = { results, options };
  const container = $("results");
  const nodes = [];
  if (options.notice) nodes.push(el("p", { class: `notice${options.noticeWarning ? " is-warning" : ""}`, text: options.notice }));
  if (results.length === 0) {
    container.replaceChildren(...nodes);
    if (options.showNoMatch) {
      container.append(el("p", { class: "notice", text: t(state.lang, "noMatch") }));
    }
    return;
  }
  if (options.heading !== null) {
    const confident = results[0].exact || results[0].score >= CONFIDENT_SCORE;
    const heading = confident ? t(state.lang, "resultsTitle") : t(state.lang, "noMatch");
    nodes.push(el("p", { class: "results-title", text: heading }));
  }
  results.forEach((result, index) => nodes.push(renderResult(result, options.heading === null ? null : index + 1)));
  container.replaceChildren(...nodes);
}

function runSearch(query = $("query").value) {
  const text = query.trim();
  if (!state.index) {
    renderResults([], { notice: t(state.lang, "notSavedYet"), noticeWarning: true });
    return;
  }
  if (!text) {
    renderResults([], { notice: t(state.lang, "emptyQuery") });
    return;
  }
  const results = search(state.index, text, { limit: 5 });
  if (results.length === 0) {
    renderResults([], { showNoMatch: true });
    return;
  }
  renderResults(results, {});
}

function setOcrStatus(message, warning = false) {
  const node = $("ocrStatus");
  node.textContent = message;
  node.classList.toggle("is-warning", warning);
}

async function handlePhoto(file) {
  if (!file || state.busyOcr) return;
  state.busyOcr = true;
  setOcrStatus(t(state.lang, "ocrRunning", { percent: 0 }));
  try {
    const { recognizePhoto } = await import("./ocr.mjs");
    const { text, confidence } = await recognizePhoto(file, (percent) => {
      setOcrStatus(t(state.lang, "ocrRunning", { percent }));
    });
    const cleaned = text.replace(/\n{2,}/g, "\n").trim();
    $("query").value = cleaned;
    if (!cleaned || confidence < 35) {
      setOcrStatus(t(state.lang, "ocrLow"), true);
      if (!cleaned) return;
    } else {
      setOcrStatus(t(state.lang, "ocrDone"));
    }
    runSearch(cleaned);
  } catch (error) {
    console.error(error);
    setOcrStatus(t(state.lang, "ocrFail"), true);
  } finally {
    state.busyOcr = false;
    $("photo").value = "";
  }
}

async function loadManuals() {
  const response = await fetch("data/manuals.json");
  if (!response.ok) throw new Error(`manuals.json: HTTP ${response.status}`);
  const data = await response.json();
  state.chunks = data.chunks;
  state.manuals = new Map(data.manuals.map((manual) => [manual.id, manual]));
  state.index = buildSearchIndex(data.chunks);
  state.manualData = data;
  renderManualMeta(data);
  renderBrowseList();
}

function renderManualMeta(data) {
  const lines = data.manuals.map((manual) => {
    const title = pick(manual.title).text;
    return `${title}${manual.revision ? ` · ${t(state.lang, "manualRevision")}: ${manual.revision}` : ""}`;
  });
  const readiness = state.swReady ? t(state.lang, "readyOffline") : t(state.lang, "notSavedYet");
  $("manualMeta").textContent = `${lines.join(" | ")} · ${t(state.lang, "offlineNote")} · ${readiness}`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const secure = window.isSecureContext;
  if (!secure) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "CACHE_READY") {
      state.swReady = true;
      updateStatus();
    }
  });
  navigator.serviceWorker.register("sw.js").then((registration) => {
    if (registration.active && navigator.serviceWorker.controller) {
      state.swReady = true;
      updateStatus();
    }
  }).catch((error) => console.warn("Offline cache not available", error));
}

function wireEvents() {
  $("searchBtn").addEventListener("click", () => runSearch());
  $("clearBtn").addEventListener("click", () => {
    $("query").value = "";
    setOcrStatus("");
    renderResults([], {});
    $("query").focus();
  });
  $("query").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) runSearch();
  });
  $("photo").addEventListener("change", (event) => handlePhoto(event.target.files?.[0]));
  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
}

async function init() {
  applyLanguage();
  wireEvents();
  registerServiceWorker();
  try {
    await loadManuals();
  } catch (error) {
    console.error(error);
    renderResults([], { notice: t(state.lang, "notSavedYet"), noticeWarning: true });
  }
  updateStatus();
}

init();

// Exposed for automated tests only.
window.faultAssistant = { search: (q) => (state.index ? search(state.index, q, { limit: 5 }) : []), setLanguage, STRINGS };
