CREATE TABLE "AiUsage" (
    "id" VARCHAR(30) NOT NULL,
    "workspaceId" VARCHAR(80) NOT NULL,
    "userId" VARCHAR(30) NOT NULL,
    "conversationId" VARCHAR(30) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");
CREATE INDEX "AiUsage_workspaceId_createdAt_idx" ON "AiUsage"("workspaceId", "createdAt");

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
