# Fault Assistant — offline troubleshooting for maintenance technicians

A phone-friendly web app that works **fully on the device with no network**. A technician describes a fault (in English or Gujarati), types a fault code, or photographs the fault display or label. The app returns the matching troubleshooting procedure from the manuals stored on the device, with safety notes, numbered steps and page or section references.

Everything runs locally:

- **Search**: BM25 retrieval over a prebuilt manual index, with a bilingual glossary (a Gujarati query finds English text and vice versa) and exact fault-code matching.
- **Photos**: on-device OCR (Tesseract.js, LSTM engine) with English and Gujarati language data. Photos are never uploaded.
- **Offline**: a service worker precaches the whole app (about 24 MiB), including the OCR runtime, both language data files, the Gujarati font and the manual index.
- **No runtime dependencies on the internet**: no CDNs, fonts, analytics or APIs.

> **The included manual is a SAMPLE.** The equipment (“MP-200 Motor-Pump Set”), fault codes and procedures are invented to demonstrate the app. Replace them with your site-approved manual before field use. The app is an advisory aid and does not replace permit, isolation and lock-out procedures.

## Quick start

Requires Node.js 20+ (build time only; the device needs just a browser).

```bash
cd fault-assistant
npm install            # build dependencies and OCR runtime/language data
npm run build          # manuals -> public/data/manuals.json; assets -> public/
npm start              # serves public/ on http://0.0.0.0:3000 (PORT=... to change)
npm test               # unit tests (node:test, no browser needed)
```

Open the app once **with a network connection** (for example at the depot Wi-Fi). It downloads and caches everything. After that it works with no connection, including after a page reload. The header shows “Ready for offline use” when the cache is complete.

### Running the offline browser test

```bash
CHROME_PATH=/path/to/chromium npm run test:e2e
```

The test starts its own server, loads the app in Chromium, runs several searches online, cuts the network, reloads, runs code and cross-language searches, runs OCR on rendered English and Gujarati “photos”, and fails on any console or network error.

### Getting the app onto technicians’ phones

`public/` is static. Copy it to any static host on the site network, or serve it locally with `npm start` on a laptop or a site server. Phones on the same network can open it at `http://<host>:3000`. For an offline-only install, open it once online, then keep using it offline.

## Adding or updating manuals

Put source files in `manuals/` and run `npm run build`. Two formats are supported.

### 1. Bilingual Markdown (recommended for authored procedures)

```markdown
---
title: MP-200 Motor-Pump Set | MP-200 મોટર-પંપ સેટ
revision: 2026-01
---
## FAULT-02 | Motor overheats | મોટર વધુ ગરમ થાય છે
codes: E-21
symptom: Casing too hot to hold | કેસિંગ પકડી ન શકાય તેટલું ગરમ છે
safety: Let the motor cool before touching it | મોટર ઠંડી થાય ત્યાં સુધી અડશો નહીં
1. Check the cooling fan and the air grille. | કૂલિંગ પંખો અને હવાની ગ્રિલ તપાસો.
2. Measure running current against nameplate. | નેમપ્લેટ સામે ચાલુ કરંટ માપો.
note: If still hot, stop the set and report. | હજી ગરમ હોય તો સેટ બંધ કરી જાણ કરો.
```

Rules:

- `## ID | English heading | Gujarati heading`. The ID is optional.
- `codes:` takes display codes exactly as shown on the equipment.
- `symptom:`, `safety:`, `note:` and numbered steps take `English | Gujarati`. A line with only one language is accepted; the script decides which.
- Continuation lines join the previous step.
- The build prints warnings for missing Gujarati or English text, sections with no steps, duplicate IDs and similar problems. `npm run build:manuals -- --strict` fails on any warning, which is useful in CI.

### 2. PDF (for long existing manuals)

Put the `.pdf` in `manuals/`. Text is extracted page by page at build time (pdf.js, Node side only). Passages are split at numbered headings such as `4.2 Low discharge pressure` and at about 900 characters. Running headers, footers and page numbers are removed, and each result shows its page range.

Limits:

- PDFs need a text layer. Scanned pages are reported as warnings and are not guessed. Run OCR on them beforehand, or type the notes into a Markdown file.
- Gujarati PDF text depends on how the PDF encodes its fonts. Check the extracted text for each Gujarati PDF before use.
- PDF passages have no structured steps; they are shown as text.

## How search works

1. The query is normalised: Unicode NFC, Gujarati digits (`૫૨`) converted to ASCII, case folded.
2. Fault codes (`E-14`, `e 21`, `F201`) are extracted. An exact match against a section’s codes gets a large boost and a green “Fault code match” badge.
3. Tokens and light stems are scored with BM25 against each section’s English and Gujarati text, headings, codes and manual title. Headings count twice.
4. Glossary groups (`src/lib/glossary.mjs`) add related terms at half weight. For example, `overheat` ↔ `વધુ ગરમ`, `pressure` ↔ `દબાણ`, `leak` ↔ `ટપકવું`.
5. Results below a score threshold are not shown as confident matches. The app says so and points to the browse list.

Tune the glossary and the threshold with real technician queries; the unit tests in `tests/unit/search.test.mjs` are a good place to add cases.

## Photos

Tap **Photo of fault or code** to take a photo (the camera opens on phones) or choose one from the gallery. The image is downscaled and contrast-stretched on the device, then read with OCR. The recognised text appears in the search box so the technician can correct it before the search runs. Low-confidence reads show a prompt to retake the photo.

Photos work best for printed codes, labels, nameplates and clear display text. The app does not recognise damage or part condition from images.

## Project layout

```
manuals/                     source manuals (.md, .pdf)
src/lib/                     shared, browser-safe logic: text, glossary, search, i18n, manual and PDF parsing
src/app/                     browser UI (app.mjs), on-device OCR (ocr.mjs), service worker template
src/build/pdf-extract.mjs    Node-only PDF text extraction
scripts/build-index.mjs      manuals -> public/data/manuals.json
scripts/build-assets.mjs     copies libs and vendors OCR/fonts; writes sw.js and asset-manifest.json
scripts/serve.mjs            static server on 0.0.0.0
public/                      static app (index.html, styles.css, fonts.css, manifest, icon)
tests/unit/                  node:test unit tests (text, glossary, parser, search, PDF)
tests/e2e/                   offline browser test (playwright-core + CHROME_PATH)
tests/fixtures/              generated PDF fixture and its generator script
```

Generated output is git-ignored: `public/data/`, `public/vendor/`, `public/js/`, `public/sw.js`, `public/asset-manifest.json`, `node_modules/`.

## Before field use — checklist

- [ ] Replace the sample manual with the site-approved manual(s) for each equipment type.
- [ ] Have a Gujarati-speaking technician review all Gujarati text (manuals and `src/lib/i18n.mjs`) and glossary terms.
- [ ] Check OCR on real photos of your panels and labels in poor light; adjust `src/app/ocr.mjs` if needed.
- [ ] Test searches with real technician phrasing and fault codes; add cases to `tests/unit/search.test.mjs`.
- [ ] Run `npm run test:e2e` on the target phone browsers, with the network disabled.
- [ ] Confirm the device has enough storage (about 25 MiB plus manuals) and that the “Ready for offline use” indicator shows.
- [ ] Keep the assistant advisory: follow permit, isolation and lock-out rules.

## Known limitations

- The sample content is fictional. Gujarati wording has not been reviewed by a native speaker.
- OCR accuracy on real photos is not yet measured. The browser test uses clean rendered text.
- The first OCR call in a session takes a few seconds while the engine loads.
- Only exact fault-code and text-based matching is implemented. There is no image recognition of the equipment.
- Multiple manuals are searched together and results are not filtered by equipment model. Add a model field before using several models at one site.
