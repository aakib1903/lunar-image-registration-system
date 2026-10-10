#!/usr/bin/env node
// Assembles the deployable offline app in public/:
//   public/js/lib, public/js/app   <- src/lib, src/app (browser ES modules)
//   public/vendor/...              <- OCR runtime, Gujarati/English data, font (from node_modules)
//   public/sw.js                   <- service worker stamped with a content-based build id
//   public/asset-manifest.json     <- every file the service worker precaches
//
// Run after `npm install` and `npm run build:manuals`.

import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const modules = (name) => join(root, "node_modules", name);

const VENDOR_FILES = [
  // Tesseract.js main-thread module and worker script.
  [modules("tesseract.js/dist/tesseract.esm.min.js"), "vendor/tesseract/tesseract.esm.min.js"],
  [modules("tesseract.js/dist/worker.min.js"), "vendor/tesseract/worker.min.js"],
  // Tesseract core WebAssembly, all LSTM variants (browser feature detection picks one).
  ...["tesseract-core-simd-lstm", "tesseract-core-lstm", "tesseract-core-relaxedsimd-lstm"].flatMap((name) => [
    [modules(`tesseract.js-core/${name}.wasm.js`), `vendor/tesseract-core/${name}.wasm.js`],
    [modules(`tesseract.js-core/${name}.wasm`), `vendor/tesseract-core/${name}.wasm`],
  ]),
  // Best integer LSTM traineddata, gzipped, English and Gujarati.
  [modules("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"), "vendor/lang/eng.traineddata.gz"],
  [modules("@tesseract.js-data/guj/4.0.0_best_int/guj.traineddata.gz"), "vendor/lang/guj.traineddata.gz"],
];

const FONT_SUBSETS = ["gujarati-400", "gujarati-700", "latin-400", "latin-700"];
const FONT_FILES = FONT_SUBSETS.flatMap((subset) => [
  [modules(`@fontsource/noto-sans-gujarati/${subset}.css`), `vendor/fonts/${subset}.css`],
  [
    modules(`@fontsource/noto-sans-gujarati/files/noto-sans-gujarati-${subset}-normal.woff2`),
    `vendor/fonts/files/noto-sans-gujarati-${subset}-normal.woff2`,
  ],
]);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(path)));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

async function copyVendor() {
  for (const [source, target] of [...VENDOR_FILES, ...FONT_FILES]) {
    if (!(await exists(source))) {
      throw new Error(`Missing ${source}. Run "npm install" first.`);
    }
    const destination = join(publicDir, target);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }
}

async function main() {
  if (!(await exists(join(publicDir, "data", "manuals.json")))) {
    throw new Error("public/data/manuals.json is missing. Run \"npm run build:manuals\" first.");
  }
  // Clear generated output only; sources (index.html, styles.css, data/) are kept.
  for (const generated of ["js", "vendor", "sw.js", "asset-manifest.json"]) {
    await rm(join(publicDir, generated), { recursive: true, force: true });
  }

  await cp(join(root, "src", "lib"), join(publicDir, "js", "lib"), { recursive: true });
  await cp(join(root, "src", "app"), join(publicDir, "js", "app"), {
    recursive: true,
    filter: (source) => !source.endsWith("sw.template.js"),
  });
  await copyVendor();

  const files = (await listFiles(publicDir))
    .map((path) => relative(publicDir, path).split("\\").join("/"))
    .filter((path) => path !== "sw.js" && path !== "asset-manifest.json")
    .sort();

  const hash = createHash("sha256");
  let bytes = 0;
  for (const file of files) {
    const content = await readFile(join(publicDir, file));
    bytes += content.length;
    hash.update(file);
    hash.update(content);
  }
  const buildId = hash.digest("hex").slice(0, 16);

  const template = await readFile(join(root, "src", "app", "sw.template.js"), "utf8");
  await writeFile(join(publicDir, "sw.js"), template.replace("__BUILD_ID__", buildId), "utf8");
  await writeFile(
    join(publicDir, "asset-manifest.json"),
    `${JSON.stringify({ buildId, files: ["index.html", ...files.filter((f) => f !== "index.html")] }, null, 2)}\n`,
    "utf8",
  );

  const swStat = await stat(join(publicDir, "sw.js"));
  console.log(`Build ${buildId}: ${files.length} files precached, ${(bytes / 1048576).toFixed(1)} MiB (sw.js ${swStat.size} B)`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
