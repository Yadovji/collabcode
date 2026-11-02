import type { FastifyInstance } from "fastify";
import { isSafeFilePath } from "@collab/shared";
import { findRequestUser } from "./auth.js";
import { runLocalCode, type RunnableLanguage } from "./codeRunner.js";
import { getWorkspaceRole } from "./workspaceAccess.js";
import * as Y from "yjs";

type RoomLookup = (id: string) => Promise<{ doc: Y.Doc } | undefined>;

function requestBody(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function isLoopbackAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  return normalized === "::1" || normalized === "127.0.0.1";
}

export function registerCodeExecutionRoutes(app: FastifyInstance, getRoom: RoomLookup) {
  let activeRun = false;
  app.get("/api/code-execution/status", async (request) => ({
    enabled: process.env.CODE_EXECUTION_ENABLED === "true" && process.env.NODE_ENV !== "production" && isLoopbackAddress(request.ip)
  }));

  app.post<{ Params: { roomId: string } }>("/api/workspaces/:roomId/execute", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (process.env.CODE_EXECUTION_ENABLED !== "true" || process.env.NODE_ENV === "production") {
      return reply.code(503).send({ error: "The local Python/Java runner is disabled. Enable CODE_EXECUTION_ENABLED=true in your local API .env and restart the API. Code execution is unavailable on the hosted Render service." });
    }
    if (!isLoopbackAddress(request.ip)) return reply.code(403).send({ error: "For safety, the local code runner only accepts requests from this computer." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to run code." });
    const roomId = request.params.roomId;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId)) return reply.code(400).send({ error: "Invalid workspace link." });
    const role = await getWorkspaceRole(roomId, user.id);
    if (!role) return reply.code(404).send({ error: "Workspace not found." });
    if (role === "viewer") return reply.code(403).send({ error: "Viewer access cannot run code." });

    const filePath = requestBody(request.body).filePath;
    if (!isSafeFilePath(filePath)) return reply.code(400).send({ error: "Choose a valid workspace file." });
    const extension = filePath.split(".").pop()?.toLowerCase();
    const language: RunnableLanguage | null = extension === "py" ? "python" : extension === "java" ? "java" : null;
    if (!language) return reply.code(400).send({ error: "The local runner supports .py and .java files only." });

    const room = await getRoom(roomId);
    const source = room?.doc.getMap<Y.Text>("files").get(filePath)?.toString();
    if (source === undefined) return reply.code(404).send({ error: "That file is no longer in the workspace." });
    const mainClass = filePath.split("/").pop()?.slice(0, -".java".length);
    if (activeRun) return reply.code(429).send({ error: "Another code run is already in progress. Try again shortly." });

    activeRun = true;
    try {
      return await runLocalCode(language, source, mainClass);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The local code runner could not start.";
      request.log.warn({ roomId, filePath, error: message }, "Local code run unavailable or failed to start");
      return reply.code(503).send({ error: message });
    } finally {
      activeRun = false;
    }
  });
}
