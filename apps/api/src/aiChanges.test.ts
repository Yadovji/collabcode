import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { applyFileChanges } from "./aiChanges.js";

function createDoc() {
  const doc = new Y.Doc(); const files = doc.getMap<Y.Text>("files");
  const text = new Y.Text(); text.insert(0, "old source"); files.set("src/main.ts", text);
  return { doc, files };
}

test("applies existing and new files together in one accepted changeset", () => {
  const { doc, files } = createDoc();
  const result = applyFileChanges(doc, [
    { path: "src/main.ts", base: "old source", content: "updated source" },
    { path: "src/new.ts", base: null, content: "export {};" }
  ]);
  assert.deepEqual(result, { ok: true, applied: ["src/main.ts", "src/new.ts"] });
  assert.equal(files.get("src/main.ts")?.toString(), "updated source");
  assert.equal(files.get("src/new.ts")?.toString(), "export {};");
  doc.destroy();
});

test("rejects stale base versions without partially applying any file", () => {
  const { doc, files } = createDoc();
  const result = applyFileChanges(doc, [
    { path: "src/main.ts", base: "old source", content: "should not apply" },
    { path: "src/new.ts", base: "unexpected", content: "also should not apply" }
  ]);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.status, 409);
  assert.equal(files.get("src/main.ts")?.toString(), "old source");
  assert.equal(files.has("src/new.ts"), false);
  doc.destroy();
});

test("rejects unsafe paths and oversized proposals", () => {
  const { doc, files } = createDoc();
  const unsafe = applyFileChanges(doc, [{ path: "../outside", base: null, content: "x" }]);
  const oversized = applyFileChanges(doc, [{ path: "src/large.ts", base: null, content: "x".repeat(50_001) }]);
  assert.equal(unsafe.ok, false);
  assert.equal(oversized.ok, false);
  assert.equal(files.has("src/large.ts"), false);
  doc.destroy();
});
