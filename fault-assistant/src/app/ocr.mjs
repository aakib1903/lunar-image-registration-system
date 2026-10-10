// On-device OCR for fault photos using Tesseract.js (LSTM engine) with English and
// Gujarati data. Everything is loaded from same-origin files vendored by
// scripts/build-assets.mjs. Nothing is sent to a server.
//
// The vendored files live at <app>/vendor/, two levels above this module
// (deployed as js/app/ocr.mjs).

const VENDOR = new URL("../../vendor/", import.meta.url);
const LANGUAGES = "eng+guj";

let workerPromise = null;
let progressListener = null;

function reportProgress(message) {
  if (!progressListener || !message) return;
  const percent = Math.round((message.progress ?? 0) * 100);
  if (message.status === "recognizing text") progressListener(percent);
}

async function loadTesseract() {
  // The ESM bundle exposes the CommonJS module object as its default export.
  const module = await import(new URL("tesseract/tesseract.esm.min.js", VENDOR).href);
  return module.default ?? module;
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = loadTesseract().then(async ({ createWorker, OEM }) => {
      const worker = await createWorker(LANGUAGES, OEM.LSTM_ONLY, {
        workerPath: new URL("tesseract/worker.min.js", VENDOR).href,
        corePath: new URL("tesseract-core/", VENDOR).href,
        langPath: new URL("lang/", VENDOR).href,
        gzip: true,
        cacheMethod: "none",
        workerBlobURL: false,
        logger: reportProgress,
      });
      return worker;
    });
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/**
 * Downscales the photo and stretches its contrast to help OCR on phone photos.
 * Returns a canvas.
 */
export async function preparePhoto(file, maxSide = 1800) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const luma = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = luma;
    histogram[luma] += 1;
  }
  // Stretch between the 1st and 99th percentile of luminance.
  const total = width * height;
  let low = 0;
  let high = 255;
  let seen = 0;
  for (let v = 0; v < 256; v += 1) {
    seen += histogram[v];
    if (low === 0 && seen >= total * 0.01) low = v;
    if (seen >= total * 0.99) {
      high = v;
      break;
    }
  }
  const range = Math.max(1, high - low);
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.min(255, Math.max(0, Math.round(((data[i] - low) * 255) / range)));
    data[i] = data[i + 1] = data[i + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Reads text from a photo on this device.
 * @param {File|Blob} file
 * @param {(percent: number) => void} [onProgress]
 * @returns {Promise<{ text: string, confidence: number }>}
 */
export async function recognizePhoto(file, onProgress) {
  progressListener = onProgress ?? null;
  const canvas = await preparePhoto(file);
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  progressListener = null;
  return { text: data.text ?? "", confidence: data.confidence ?? 0 };
}
