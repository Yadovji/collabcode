import { createRequire } from "node:module";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monacoPackage = path.dirname(require.resolve("monaco-editor/package.json"));
const source = path.join(monacoPackage, "min", "vs");
const destination = path.join(webRoot, "public", "monaco", "vs");

await mkdir(path.dirname(destination), { recursive: true });
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
console.log("Copied Monaco editor assets into the local web app.");
