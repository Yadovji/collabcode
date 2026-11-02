import * as Y from "yjs";
import { isSafeFilePath } from "@collab/shared";

export type FileChange = { path: string; base: string | null; content: string };
export type ApplyResult = { ok: true; applied: string[] } | { ok: false; status: 400 | 409 | 413; error: string };

export function applyFileChanges(doc: Y.Doc, updates: FileChange[]): ApplyResult {
  if (!Array.isArray(updates) || updates.length < 1 || updates.length > 8) return { ok: false, status: 400, error: "A change must contain between 1 and 8 files." };
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const update of updates) {
    if (typeof update !== "object" || update === null) return { ok: false, status: 400, error: "Invalid file change." };
    if (!isSafeFilePath(update.path) || seen.has(update.path) || (update.base !== null && typeof update.base !== "string") || typeof update.content !== "string") return { ok: false, status: 400, error: "Invalid or duplicate file change." };
    const bytes = Buffer.byteLength(update.content, "utf8");
    if (bytes > 50_000) return { ok: false, status: 413, error: "Each proposed file must be 50 KB or smaller." };
    totalBytes += bytes;
    if (totalBytes > 100_000) return { ok: false, status: 413, error: "The complete changeset must be 100 KB or smaller." };
    seen.add(update.path);
  }
  const files = doc.getMap<Y.Text>("files");
  for (const update of updates) {
    const current = files.get(update.path);
    if (update.base === null ? Boolean(current) : !current || current.toString() !== update.base) return { ok: false, status: 409, error: `File ${update.path} changed since the proposal was generated. Regenerate and review the changes again.` };
  }
  if (updates.filter((item) => item.base === null).length + files.size > 100) return { ok: false, status: 409, error: "Workspace file limit reached." };
  doc.transact(() => {
    for (const update of updates) {
      const current = files.get(update.path);
      if (current) { current.delete(0, current.length); if (update.content) current.insert(0, update.content); }
      else { const text = new Y.Text(); if (update.content) text.insert(0, update.content); files.set(update.path, text); }
    }
  });
  return { ok: true, applied: updates.map((update) => update.path) };
}
