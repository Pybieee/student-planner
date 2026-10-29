import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDirectory = path.dirname(require.resolve("tesseract.js-core"));
const englishDirectory = path.resolve(root, "node_modules", "@tesseract.js-data", "eng", "4.0.0");
const workerFile = path.resolve(root, "node_modules", "tesseract.js", "dist", "worker.min.js");
const outputDirectory = path.resolve(root, "public", "ocr");
const languageOutputDirectory = path.join(outputDirectory, "tessdata");

mkdirSync(outputDirectory, { recursive: true });
mkdirSync(languageOutputDirectory, { recursive: true });
copyFileSync(workerFile, path.join(outputDirectory, "worker.min.js"));
copyFileSync(path.join(coreDirectory, "tesseract-core-lstm.wasm.js"), path.join(outputDirectory, "tesseract-core-lstm.wasm.js"));
copyFileSync(path.join(coreDirectory, "tesseract-core-lstm.wasm"), path.join(outputDirectory, "tesseract-core-lstm.wasm"));
copyFileSync(path.join(englishDirectory, "eng.traineddata.gz"), path.join(languageOutputDirectory, "eng.traineddata.gz"));
