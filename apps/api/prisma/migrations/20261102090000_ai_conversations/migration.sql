CREATE TABLE "AiConversation" (
    "id" VARCHAR(30) NOT NULL,
    "workspaceId" VARCHAR(80) NOT NULL,
    "userId" VARCHAR(30) NOT NULL,
    "title" VARCHAR(120) NOT NULL DEFAULT 'New conversation',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiMessage" (
    "id" VARCHAR(30) NOT NULL,
    "conversationId" VARCHAR(30) NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "mode" VARCHAR(10) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiConversation_workspaceId_userId_updatedAt_idx"
ON "AiConversation"("workspaceId", "userId", "updatedAt");

CREATE INDEX "AiMessage_conversationId_createdAt_idx"
ON "AiMessage"("conversationId", "createdAt");

ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
