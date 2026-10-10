// End-to-end test: the app must work with the network fully disconnected.
//
// Requires a Chromium/Chrome executable:  CHROME_PATH=/path/to/chrome npm run test:e2e
// If BASE_URL is set, that server is used; otherwise this script starts scripts/serve.mjs.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const executablePath = process.env.CHROME_PATH;
if (!executablePath) {
  console.error("Set CHROME_PATH to a Chromium/Chrome executable to run the browser test.");
  process.exit(2);
}

let server = null;
let baseUrl = process.env.BASE_URL;
if (!baseUrl) {
  const port = process.env.E2E_PORT ?? "4173";
  server = spawn(process.execPath, [join(root, "scripts", "serve.mjs")], {
    env: { ...process.env, PORT: port, HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve) => server.stdout.once("data", resolve));
  baseUrl = `http://127.0.0.1:${port}/`;
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

/** Waits until OCR has started and finished (status shows a message without a percentage). */
async function waitForOcrDone(page) {
  await page.waitForFunction(() => {
    const text = document.querySelector("#ocrStatus")?.textContent ?? "";
    return text.length > 0 && !text.includes("%");
  }, null, { timeout: 180_000 });
}

const failures = [];
const log = (message) => console.log(`ok  ${message}`);

try {
  const context = await browser.newContext({ serviceWorkers: "allow", viewport: { width: 390, height: 844 }, locale: "en-IN" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
  });

  // 1. First visit online: the app installs its service worker and caches the shell.
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 60_000 });
  await page.waitForSelector("#status.is-ready, #status:not(.is-offline)", { timeout: 60_000 });
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    if (!keys.length) return false;
    const cache = await caches.open(keys[0]);
    return Boolean(await cache.match("data/manuals.json"));
  }, null, { timeout: 60_000 });
  log("service worker controls the page and the manual index is cached");

  // 2. Online search in English.
  await page.fill("#query", "motor overheating");
  await page.click("#searchBtn");
  await page.waitForSelector("#results article h2");
  const firstEnglish = await page.textContent("#results article h2");
  assert.match(firstEnglish, /Motor overheats/);
  log(`English search -> ${firstEnglish.trim()}`);

  // 3. Switch to Gujarati and search in Gujarati.
  await page.click("#langToggle button[lang='gu']");
  await page.fill("#query", "મોટર વધુ ગરમ થાય છે");
  await page.click("#searchBtn");
  await page.waitForSelector("#results article h2");
  const firstGujarati = await page.textContent("#results article h2");
  assert.match(firstGujarati, /મોટર વધુ ગરમ થાય છે/);
  log(`Gujarati search -> ${firstGujarati.trim()}`);

  // 4. Cut the network and reload: the app must still load from the device cache.
  await context.setOffline(true);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("#langToggle button");
  await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("is-offline"));
  const offlineStatus = await page.textContent("#status");
  assert.match(offlineStatus, /Offline|ઑફલાઇન/);
  log(`offline reload loads the app; status: ${offlineStatus.trim()}`);

  // 5. Offline search with a fault code and with a cross-language description.
  await page.fill("#query", "E-14");
  await page.click("#searchBtn");
  await page.waitForSelector("#results article.is-exact");
  assert.match(await page.textContent("#results article.is-exact h2"), /Motor does not start|મોટર શરૂ થતી નથી/);
  log("offline fault-code search E-14 -> exact match");

  await page.fill("#query", "pump has low pressure");
  await page.click("#searchBtn");
  await page.waitForSelector("#results article h2");
  assert.match(await page.textContent("#results article h2"), /Low discharge pressure|ડિસ્ચાર્જ/);
  log("offline English query -> Gujarati-titled section (bilingual section)");

  // 6. Offline photo OCR. Render a photo-like image with an on-screen fault code.
  const englishPhoto = await page.evaluate(async () => {
    await document.fonts.ready;
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 120px Arial, Helvetica, sans-serif";
    ctx.fillText("E-21", 60, 170);
    ctx.font = "44px Arial, Helvetica, sans-serif";
    ctx.fillText("MOTOR OVERHEAT", 60, 250);
    return canvas.toDataURL("image/png");
  });
  const englishPhotoPath = join(await mkdtemp(join(tmpdir(), "fa-ocr-")), "english.png");
  await writeFile(englishPhotoPath, Buffer.from(englishPhoto.split(",")[1], "base64"));
  await page.fill("#query", "");
  await page.setInputFiles("#photo", englishPhotoPath);
  await waitForOcrDone(page);
  await page.waitForSelector("#results article h2", { timeout: 60_000 });
  const ocrText = await page.inputValue("#query");
  const ocrResult = await page.textContent("#results article h2");
  assert.match(ocrText, /E-?21/i, `OCR text was: "${ocrText}"; status: "${await page.textContent("#ocrStatus")}"; errors: ${consoleErrors.join(" | ")}`);
  assert.match(ocrResult, /Motor overheats|મોટર વધુ ગરમ/);
  log(`offline OCR of English photo -> "${ocrText.replace(/\s+/g, " ").trim()}" -> ${ocrResult.trim()}`);

  // 7. Offline OCR of a Gujarati photo, using the vendored Gujarati language data.
  await page.click("#langToggle button[lang='gu']");
  const gujaratiPhoto = await page.evaluate(async () => {
    await document.fonts.ready;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 260;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    ctx.font = "72px 'Noto Sans Gujarati', sans-serif";
    ctx.fillText("મોટર શરૂ થતી નથી", 40, 150);
    return canvas.toDataURL("image/png");
  });
  const gujaratiPhotoPath = join(await mkdtemp(join(tmpdir(), "fa-ocr-gu-")), "gujarati.png");
  await writeFile(gujaratiPhotoPath, Buffer.from(gujaratiPhoto.split(",")[1], "base64"));
  await page.setInputFiles("#photo", gujaratiPhotoPath);
  await waitForOcrDone(page);
  await page.waitForSelector("#results article h2", { timeout: 60_000 });
  const guOcrText = await page.inputValue("#query");
  const guOcrResult = await page.textContent("#results article h2");
  assert.match(guOcrResult, /મોટર શરૂ થતી નથી|Motor does not start/, `OCR text was: ${guOcrText}`);
  log(`offline OCR of Gujarati photo -> "${guOcrText.trim()}" -> ${guOcrResult.trim()}`);

  // 8. Browsing a fault works offline too.
  await page.click("#browse summary");
  await page.click("#faultList button >> nth=2");
  await page.waitForSelector("#results article");
  log("offline browse list opens a procedure");

  // 9. Nothing outside this origin was requested while offline.
  const external = consoleErrors.filter((entry) => /ERR_INTERNET_DISCONNECTED|net::ERR/.test(entry));
  assert.equal(external.length, 0, `network errors while offline: ${external.join("; ")}`);
  assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join("; ")}`);
  log("no console or network errors while offline");

  await context.close();
} catch (error) {
  failures.push(error);
} finally {
  await browser.close();
  if (server) server.kill();
}

if (failures.length) {
  console.error(failures[0]);
  process.exit(1);
}
console.log("All browser checks passed.");
