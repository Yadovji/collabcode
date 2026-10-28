CREATE TABLE "Workspace" (
    "id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL DEFAULT 'Untitled workspace',
    "documentState" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);
