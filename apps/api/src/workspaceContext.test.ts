import assert from "node:assert/strict";
import test from "node:test";
import { selectWorkspaceContext } from "./workspaceContext.js";

const asEntries = (files: Record<string, string>) => Object.entries(files).map(([path, text]) => [path, { toString: () => text }] as [string, { toString(): string }]);

test("workspace context excludes environment, credential, binary, and generated files", () => {
  const context = JSON.parse(selectWorkspaceContext(asEntries({
    "src/app.ts": "export const app = true;",
    ".env.local": "API_KEY=private",
    "keys/signing.pem": "private key",
    "config/credentials.json": "token",
    "dist/app.js": "built",
    "assets/blob.dat": "\0binary"
  }), "explain app", "src/app.ts", "")) as { files: Array<{ name: string }> };
  assert.deepEqual(context.files.map((file) => file.name), ["src/app.ts"]);
});

test("active file is always first and relevant files are ranked ahead of unrelated files", () => {
  const context = JSON.parse(selectWorkspaceContext(asEntries({
    "src/unrelated.ts": "plain text",
    "src/auth.ts": "export function validateSession() {}",
    "src/room.ts": "function connectRoom() {}"
  }), "explain session validation", "src/room.ts", "")) as { files: Array<{ name: string }> };
  assert.deepEqual(context.files.map((file) => file.name), ["src/room.ts", "src/auth.ts", "src/unrelated.ts"]);
});

test("workspace context bounds file count and per-file content", () => {
  const files = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`src/file${i}.ts`, "x".repeat(20000)]));
  const context = JSON.parse(selectWorkspaceContext(asEntries(files), "", "src/file0.ts", "y".repeat(15000))) as { selection: string; files: Array<{ text: string }> };
  assert.equal(context.files.length, 16);
  assert.equal(context.files[0].text.length, 16000);
  assert.equal(context.files[1].text.length, 1600);
  assert.equal(context.selection.length, 12000);
});
