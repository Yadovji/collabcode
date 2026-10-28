import "./env.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { databaseUrl } from "./env.js";

export const prisma = databaseUrl
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  : null;

export const persistenceEnabled = prisma !== null;
