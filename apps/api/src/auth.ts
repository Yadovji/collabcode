import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./db.js";

const SESSION_COOKIE = "collabcode_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PublicUser = { id: string; email: string; name: string };

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of (header || "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    const key = item.slice(0, separator).trim();
    try { result[key] = decodeURIComponent(item.slice(separator + 1).trim()); }
    catch { /* Ignore malformed cookie values. */ }
  }
  return result;
}

export function sessionTokenFromCookieHeader(header: string | undefined): string | null {
  return parseCookies(header)[SESSION_COOKIE] || null;
}

export function sessionIdForToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derivePassword(password, salt);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltText, hashText] = stored.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, "base64url");
    const actual = await derivePassword(password, Buffer.from(saltText, "base64url"));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function setSessionCookie(reply: FastifyReply, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`);
  reply.header("Cache-Control", "no-store");
}

function clearSessionCookie(reply: FastifyReply) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  reply.header("Cache-Control", "no-store");
}

async function startSession(reply: FastifyReply, userId: string): Promise<void> {
  if (!prisma) throw new Error("PostgreSQL is required for account sessions.");
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      id: sessionIdForToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS)
    }
  });
  setSessionCookie(reply, token);
}

export async function findUserForSessionToken(token: string | null): Promise<PublicUser | null> {
  if (!prisma || !token) return null;
  const session = await prisma.session.findFirst({
    where: { id: sessionIdForToken(token), expiresAt: { gt: new Date() } },
    select: { user: { select: { id: true, email: true, name: true } } }
  });
  return session?.user ?? null;
}

export async function findUserForCookieHeader(header: string | undefined): Promise<PublicUser | null> {
  return findUserForSessionToken(sessionTokenFromCookieHeader(header));
}

export async function findRequestUser(request: FastifyRequest): Promise<PublicUser | null> {
  return findUserForCookieHeader(request.headers.cookie);
}

function bodyObject(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
}

function databaseRequired(reply: FastifyReply): boolean {
  if (prisma) return true;
  reply.code(503).send({ error: "Account services require PostgreSQL. Start the database and try again." });
  return false;
}

export function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    if (!databaseRequired(reply)) return;
    const body = bodyObject(request.body);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (name.length < 2 || name.length > 80) return reply.code(400).send({ error: "Name must be between 2 and 80 characters." });
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) return reply.code(400).send({ error: "Enter a valid email address." });
    if (password.length < 8 || password.length > 128) return reply.code(400).send({ error: "Password must be 8 to 128 characters." });

    try {
      const user = await prisma!.user.create({ data: { name, email, passwordHash: await hashPassword(password) }, select: { id: true, name: true, email: true } });
      await startSession(reply, user.id);
      return reply.code(201).send({ user });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        return reply.code(409).send({ error: "An account with that email already exists." });
      }
      request.log.error({ error }, "Account registration failed");
      return reply.code(500).send({ error: "Could not create the account. Try again." });
    }
  });

  app.post("/api/auth/login", { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } }, async (request, reply) => {
    if (!databaseRequired(reply)) return;
    const body = bodyObject(request.body);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (email.length > 254 || !EMAIL_PATTERN.test(email) || !password || password.length > 128) {
      return reply.code(401).send({ error: "Email or password is incorrect." });
    }
    const user = await prisma!.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "Email or password is incorrect." });
    }
    await startSession(reply, user.id);
    return { user: { id: user.id, name: user.name, email: user.email } };
  });

  app.get("/api/auth/me", async (request, reply) => {
    if (!databaseRequired(reply)) return;
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to continue." });
    reply.header("Cache-Control", "no-store");
    return { user };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    if (!databaseRequired(reply)) return;
    const token = sessionTokenFromCookieHeader(request.headers.cookie);
    if (token) await prisma!.session.deleteMany({ where: { id: sessionIdForToken(token) } });
    clearSessionCookie(reply);
    return reply.code(204).send();
  });
}
