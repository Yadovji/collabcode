import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(apiRoot, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://collab:collab_dev_password@localhost:5432/collabcode?schema=public"
  }
});
