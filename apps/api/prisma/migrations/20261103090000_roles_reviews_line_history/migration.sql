ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" SET DEFAULT 'editor';
UPDATE "WorkspaceMember" SET "role" = 'editor' WHERE "role" = 'member';

CREATE TABLE "WorkspaceChange" (
    "id" VARCHAR(30) NOT NULL,
    "workspaceId" VARCHAR(80) NOT NULL,
    "userId" VARCHAR(30),
    "actorName" VARCHAR(100) NOT NULL,
    "actorType" VARCHAR(20) NOT NULL DEFAULT 'human',
    "filePath" TEXT NOT NULL,
    "lineStart" INTEGER NOT NULL,
    "lineEnd" INTEGER NOT NULL,
    "operation" VARCHAR(20) NOT NULL DEFAULT 'edit',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceReview" (
    "id" VARCHAR(30) NOT NULL,
    "workspaceId" VARCHAR(80) NOT NULL,
    "authorId" VARCHAR(30) NOT NULL,
    "filePath" TEXT NOT NULL,
    "lineStart" INTEGER NOT NULL,
    "lineEnd" INTEGER NOT NULL,
    "originalText" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "suggestion" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "WorkspaceReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceReviewReply" (
    "id" VARCHAR(30) NOT NULL,
    "reviewId" VARCHAR(30) NOT NULL,
    "authorId" VARCHAR(30) NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceReviewReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceChange_workspaceId_filePath_createdAt_idx" ON "WorkspaceChange"("workspaceId", "filePath", "createdAt");
CREATE INDEX "WorkspaceChange_userId_createdAt_idx" ON "WorkspaceChange"("userId", "createdAt");
CREATE INDEX "WorkspaceReview_workspaceId_filePath_status_createdAt_idx" ON "WorkspaceReview"("workspaceId", "filePath", "status", "createdAt");
CREATE INDEX "WorkspaceReviewReply_reviewId_createdAt_idx" ON "WorkspaceReviewReply"("reviewId", "createdAt");

ALTER TABLE "WorkspaceChange" ADD CONSTRAINT "WorkspaceChange_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceChange" ADD CONSTRAINT "WorkspaceChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkspaceReview" ADD CONSTRAINT "WorkspaceReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceReview" ADD CONSTRAINT "WorkspaceReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceReviewReply" ADD CONSTRAINT "WorkspaceReviewReply_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "WorkspaceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceReviewReply" ADD CONSTRAINT "WorkspaceReviewReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
