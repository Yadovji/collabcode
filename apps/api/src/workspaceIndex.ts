import { createHash, randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "./db.js";
import { analyzeWorkspaceSource, isWorkspaceFileIndexable } from "./workspaceContext.js";

const indexingEnabled = process.env.AI_ENABLED === "true" && Boolean(process.env.GEMINI_API_KEY);
const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const embeddingDimensions = 768;
const maxChunkCharacters = 1_200;
const chunkOverlapCharacters = 100;
const maxWorkspaceChunks = 600;
const batchSize = 24;
const debounceMs = 1_500;

type WorkspaceFile = { path: string; content: string };
type PreparedChunk = {
  path: string;
  chunkIndex: number;
  fileHash: string;
  content: string;
  embeddingText: string;
  lineStart: number;
  lineEnd: number;
  symbols: string[];
  imports: string[];
};

const pendingProviders = new Map<string, () => Iterable<[string, string]>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const running = new Set<string>();
let gemini: GoogleGenAI | undefined;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function vectorLiteral(values: number[]): string {
  if (values.length !== embeddingDimensions || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Gemini returned an invalid code embedding.");
  }
  return `[${values.join(",")}]`;
}

function splitIntoChunks(path: string, content: string, fileHash: string): PreparedChunk[] {
  if (!content.length) return [];
  const { symbols, imports } = analyzeWorkspaceSource(content);
  const symbolNames = symbols.slice(0, 12).map((symbol) => `${symbol.kind}:${symbol.name}@${symbol.line}`);
  const symbolContext = symbolNames.join(", ").slice(0, 200);
  const importContext = imports.slice(0, 10).join(", ").slice(0, 200);
  const chunks: PreparedChunk[] = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(content.length, start + maxChunkCharacters);
    if (end < content.length) {
      const newline = content.lastIndexOf("\n", end);
      if (newline > start + Math.floor(maxChunkCharacters * 0.55)) end = newline + 1;
    }
    if (end <= start) end = Math.min(content.length, start + maxChunkCharacters);
    const chunkContent = content.slice(start, end);
    const lineStart = content.slice(0, start).split("\n").length;
    const lineEnd = content.slice(0, end).split("\n").length;
    chunks.push({
      path,
      chunkIndex: chunks.length,
      fileHash,
      content: chunkContent,
      embeddingText: `File: ${path.slice(0, 200)}\nSymbols: ${symbolContext}\nImports: ${importContext}\n\n${chunkContent}`,
      lineStart,
      lineEnd,
      symbols: symbolNames,
      imports
    });
    if (end === content.length) break;
    start = Math.max(start + 1, end - chunkOverlapCharacters);
  }
  return chunks;
}

async function embed(contents: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
  if (!gemini) gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await gemini.models.embedContent({
    model: embeddingModel,
    contents,
    config: { outputDimensionality: embeddingDimensions, taskType, abortSignal: AbortSignal.timeout(30_000) }
  });
  const vectors = response.embeddings?.map((item) => item.values || []) || [];
  if (vectors.length !== contents.length || vectors.some((item) => item.length !== embeddingDimensions)) {
    throw new Error("Gemini returned an incomplete embedding batch.");
  }
  return vectors;
}

async function setIndexStatus(workspaceId: string, values: {
  status: string; fileCount?: number; chunkCount?: number; truncated?: boolean; lastError?: string | null; indexedAt?: Date | null;
}) {
  if (!prisma) return;
  await prisma.aiWorkspaceIndex.upsert({
    where: { workspaceId },
    create: {
      workspaceId, embeddingModel, status: values.status,
      fileCount: values.fileCount ?? 0, chunkCount: values.chunkCount ?? 0,
      truncated: values.truncated ?? false, lastError: values.lastError ?? null,
      indexedAt: values.indexedAt ?? null
    },
    update: {
      embeddingModel, status: values.status,
      ...(values.fileCount === undefined ? {} : { fileCount: values.fileCount }),
      ...(values.chunkCount === undefined ? {} : { chunkCount: values.chunkCount }),
      ...(values.truncated === undefined ? {} : { truncated: values.truncated }),
      ...(values.lastError === undefined ? {} : { lastError: values.lastError }),
      ...(values.indexedAt === undefined ? {} : { indexedAt: values.indexedAt })
    }
  });
}

async function replaceFileChunks(workspaceId: string, path: string, chunks: Array<PreparedChunk & { vector: number[] }>) {
  if (!prisma) return;
  await prisma.$transaction(async (tx) => {
    await tx.aiCodeChunk.deleteMany({ where: { workspaceId, path } });
    for (const chunk of chunks) {
      const vector = vectorLiteral(chunk.vector);
      await tx.$executeRaw`
        INSERT INTO "AiCodeChunk" (
          "id", "workspaceId", "path", "chunkIndex", "fileHash", "content", "lineStart", "lineEnd",
          "symbols", "imports", "embedding", "embeddingModel", "updatedAt"
        ) VALUES (
          ${randomUUID().replaceAll("-", "").slice(0, 30)}, ${workspaceId}, ${path}, ${chunk.chunkIndex}, ${chunk.fileHash},
          ${chunk.content}, ${chunk.lineStart}, ${chunk.lineEnd}, ${JSON.stringify(chunk.symbols)}::jsonb,
          ${JSON.stringify(chunk.imports)}::jsonb, ${vector}::vector(768), ${embeddingModel}, NOW()
        )`;
    }
  });
}

async function indexSnapshot(workspaceId: string, entries: Iterable<[string, string]>) {
  if (!prisma || !indexingEnabled) return;
  await setIndexStatus(workspaceId, { status: "indexing", lastError: null });

  const files = new Map([...entries].filter(([path, content]) => isWorkspaceFileIndexable(path, content)));
  const prior = await prisma.aiCodeChunk.findMany({
    where: { workspaceId }, select: { path: true, fileHash: true, embeddingModel: true }
  });
  const priorPaths = new Set(prior.map((row) => row.path));
  for (const path of priorPaths) {
    if (!files.has(path)) await prisma.aiCodeChunk.deleteMany({ where: { workspaceId, path } });
  }

  const hashByPath = new Map<string, string>();
  const chunksByPath = new Map<string, PreparedChunk[]>();
  const unchangedPaths = new Set<string>();
  let truncated = false;
  for (const [path, content] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const fileHash = hash(content);
    hashByPath.set(path, fileHash);
    const oldChunks = prior.filter((row) => row.path === path);
    if (oldChunks.length > 0 && oldChunks.every((row) => row.fileHash === fileHash && row.embeddingModel === embeddingModel)) {
      unchangedPaths.add(path);
      continue;
    }
    chunksByPath.set(path, splitIntoChunks(path, content, fileHash));
  }

  let prepared = [...chunksByPath.values()].flat();
  const unchangedChunkCount = prior.filter((row) => unchangedPaths.has(row.path)).length;
  const availableChunkSlots = Math.max(0, maxWorkspaceChunks - unchangedChunkCount);
  if (prepared.length > availableChunkSlots) {
    prepared = prepared.slice(0, availableChunkSlots);
    truncated = true;
  }
  const embeddedByPath = new Map<string, Array<PreparedChunk & { vector: number[] }>>();
  for (let offset = 0; offset < prepared.length; offset += batchSize) {
    const batch = prepared.slice(offset, offset + batchSize);
    const vectors = await embed(batch.map((chunk) => chunk.embeddingText), "RETRIEVAL_DOCUMENT");
    batch.forEach((chunk, index) => {
      const fileChunks = embeddedByPath.get(chunk.path) || [];
      fileChunks.push({ ...chunk, vector: vectors[index] });
      embeddedByPath.set(chunk.path, fileChunks);
    });
  }

  for (const [path, chunks] of chunksByPath) {
    const hashValue = hashByPath.get(path)!;
    const oldChunks = prior.filter((row) => row.path === path);
    const unchanged = oldChunks.length > 0 && oldChunks.every((row) => row.fileHash === hashValue && row.embeddingModel === embeddingModel);
    if (unchanged) continue;
    const newChunks = embeddedByPath.get(path) || [];
    await replaceFileChunks(workspaceId, path, newChunks);
  }

  const indexedPaths = new Set(embeddedByPath.keys());
  for (const path of files.keys()) {
    const oldChunks = prior.filter((row) => row.path === path);
    if (oldChunks.length && oldChunks.every((row) => row.fileHash === hashByPath.get(path) && row.embeddingModel === embeddingModel)) indexedPaths.add(path);
  }
  const actualChunkCount = await prisma.aiCodeChunk.count({ where: { workspaceId } });
  await setIndexStatus(workspaceId, {
    status: "ready", fileCount: indexedPaths.size,
    chunkCount: actualChunkCount,
    truncated, indexedAt: new Date(), lastError: null
  });
}

async function drain(workspaceId: string) {
  if (running.has(workspaceId)) return;
  running.add(workspaceId);
  try {
    while (pendingProviders.has(workspaceId)) {
      const provider = pendingProviders.get(workspaceId)!;
      pendingProviders.delete(workspaceId);
      try {
        await indexSnapshot(workspaceId, provider());
      } catch (error) {
        console.warn("Workspace code indexing failed", { workspaceId, error });
        try { await setIndexStatus(workspaceId, { status: "error", lastError: "Workspace indexing failed. Keyword retrieval remains available." }); }
        catch (statusError) { console.warn("Could not save workspace indexing status", { workspaceId, error: statusError }); }
      }
    }
  } finally {
    running.delete(workspaceId);
    if (pendingProviders.has(workspaceId)) void drain(workspaceId);
  }
}

export function scheduleWorkspaceIndex(workspaceId: string, getFiles: () => Iterable<[string, string]>) {
  if (!prisma || !indexingEnabled) return;
  pendingProviders.set(workspaceId, getFiles);
  const oldTimer = timers.get(workspaceId);
  if (oldTimer) clearTimeout(oldTimer);
  timers.set(workspaceId, setTimeout(() => {
    timers.delete(workspaceId);
    void drain(workspaceId);
  }, debounceMs));
}

export async function retrieveSemanticWorkspaceChunks(workspaceId: string, query: string, currentFiles: Iterable<[string, string]>) {
  if (!prisma || !indexingEnabled || !query.trim()) return [];
  try {
    const status = await prisma.aiWorkspaceIndex.findUnique({ where: { workspaceId }, select: { status: true, chunkCount: true } });
    if (status?.status !== "ready" || status.chunkCount === 0) return [];
    const [queryVector] = await embed([query.slice(0, 1_500)], "RETRIEVAL_QUERY");
    const vector = vectorLiteral(queryVector);
    const rows = await prisma.$queryRaw<Array<{
      path: string; content: string; lineStart: number; lineEnd: number;
      symbols: unknown; imports: unknown; fileHash: string; distance: number;
    }>>`
      SELECT "path", "content", "lineStart", "lineEnd", "symbols", "imports", "fileHash",
             "embedding" <=> ${vector}::vector(768) AS "distance"
      FROM "AiCodeChunk"
      WHERE "workspaceId" = ${workspaceId} AND "embeddingModel" = ${embeddingModel} AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${vector}::vector(768)
      LIMIT 16`;
    const liveHashes = new Map([...currentFiles]
      .filter(([path, content]) => isWorkspaceFileIndexable(path, content))
      .map(([path, content]) => [path, hash(content)]));
    return rows.filter((row) => liveHashes.get(row.path) === row.fileHash).slice(0, 10).map((row) => ({
      path: row.path, content: row.content, lineStart: row.lineStart, lineEnd: row.lineEnd,
      symbols: row.symbols, imports: row.imports, distance: row.distance
    }));
  } catch (error) {
    console.warn("Semantic workspace retrieval failed; using keyword context", { workspaceId, error });
    return [];
  }
}

export async function getWorkspaceIndexStatus(workspaceId: string) {
  if (!prisma) return null;
  return prisma.aiWorkspaceIndex.findUnique({
    where: { workspaceId },
    select: { status: true, embeddingModel: true, fileCount: true, chunkCount: true, truncated: true, indexedAt: true, lastError: true }
  });
}
