CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "AiCodeChunk" (
    "id" VARCHAR(30) NOT NULL,
    "workspaceId" VARCHAR(80) NOT NULL,
    "path" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "fileHash" VARCHAR(64) NOT NULL,
    "content" TEXT NOT NULL,
    "lineStart" INTEGER NOT NULL,
    "lineEnd" INTEGER NOT NULL,
    "symbols" JSONB NOT NULL,
    "imports" JSONB NOT NULL,
    "embedding" vector(768),
    "embeddingModel" VARCHAR(100) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiCodeChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiCodeChunk_workspaceId_path_chunkIndex_key"
ON "AiCodeChunk"("workspaceId", "path", "chunkIndex");

CREATE INDEX "AiCodeChunk_workspaceId_path_idx"
ON "AiCodeChunk"("workspaceId", "path");

CREATE INDEX "AiCodeChunk_embedding_hnsw_idx"
ON "AiCodeChunk" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE "AiWorkspaceIndex" (
    "workspaceId" VARCHAR(80) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "embeddingModel" VARCHAR(100) NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "indexedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiWorkspaceIndex_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "AiCodeChunk" ADD CONSTRAINT "AiCodeChunk_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiWorkspaceIndex" ADD CONSTRAINT "AiWorkspaceIndex_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
