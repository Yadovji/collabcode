import * as Y from "yjs";
import { STARTER_FILES } from "@collab/shared";
import { prisma } from "./db.js";

export function createStarterState(): Uint8Array {
  const doc = new Y.Doc();
  const files = doc.getMap<Y.Text>("files");
  doc.transact(() => {
    for (const [path, content] of Object.entries(STARTER_FILES)) {
      const text = new Y.Text();
      text.insert(0, content);
      files.set(path, text);
    }
  }, "starter-files");
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}

export async function loadWorkspaceDocument(id: string): Promise<Y.Doc> {
  const starterState = createStarterState();
  const saved = prisma
    ? await prisma.workspace.upsert({
        where: { id },
        create: { id, documentState: Buffer.from(starterState) },
        update: {},
        select: { documentState: true }
      })
    : null;

  const doc = new Y.Doc();
  Y.applyUpdate(doc, saved?.documentState ?? starterState, "database-load");
  return doc;
}

export async function saveWorkspaceDocument(id: string, doc: Y.Doc): Promise<void> {
  if (!prisma) return;
  await prisma.workspace.update({
    where: { id },
    data: { documentState: Buffer.from(Y.encodeStateAsUpdate(doc)) }
  });
}
