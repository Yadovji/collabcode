-- The vector(768) column is queried exactly at the workspace's bounded index size.
-- Prisma does not model pgvector HNSW operator-class indexes, so leaving one here
-- would make `prisma migrate dev` propose removing it on every run.
DROP INDEX IF EXISTS "AiCodeChunk_embedding_hnsw_idx";
