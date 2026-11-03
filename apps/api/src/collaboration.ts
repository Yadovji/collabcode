import type { FastifyInstance } from "fastify";
import * as Y from "yjs";
import { isSafeFilePath } from "@collab/shared";
import { findRequestUser } from "./auth.js";
import { prisma } from "./db.js";
import { getWorkspaceRole } from "./workspaceAccess.js";

type RoomLookup = (id: string) => Promise<{ doc: Y.Doc } | undefined>;

function validRoomId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

function bodyRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

export function registerCollaborationRoutes(app: FastifyInstance, getRoom: RoomLookup) {
  app.get<{ Params: { roomId: string }; Querystring: { filePath?: string } }>("/api/workspaces/:roomId/reviews", async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "Review threads require PostgreSQL." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to view reviews." });
    const { roomId } = request.params;
    const role = validRoomId(roomId) ? await getWorkspaceRole(roomId, user.id) : null;
    if (!role) return reply.code(404).send({ error: "Workspace not found." });
    const filePath = typeof request.query.filePath === "string" ? request.query.filePath : undefined;
    if (filePath && !isSafeFilePath(filePath)) return reply.code(400).send({ error: "Invalid file path." });
    const reviews = await prisma.workspaceReview.findMany({
      where: { workspaceId: roomId, ...(filePath ? { filePath } : {}) },
      orderBy: { createdAt: "desc" }, take: 100,
      include: {
        author: { select: { id: true, name: true } },
        replies: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } }
      }
    });
    return { reviews };
  });

  app.post<{ Params: { roomId: string } }>("/api/workspaces/:roomId/reviews", { config: { rateLimit: { max: 40, timeWindow: "1 hour" } } }, async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "Review threads require PostgreSQL." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to add a review comment." });
    const { roomId } = request.params;
    const role = validRoomId(roomId) ? await getWorkspaceRole(roomId, user.id) : null;
    if (!role) return reply.code(404).send({ error: "Workspace not found." });
    const body = bodyRecord(request.body);
    const filePath = typeof body.filePath === "string" ? body.filePath : "";
    const lineStart = body.lineStart;
    const lineEnd = body.lineEnd;
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    const suggestion = body.suggestion === null || body.suggestion === undefined
      ? null : typeof body.suggestion === "string" ? body.suggestion : undefined;
    if (!isSafeFilePath(filePath) || !Number.isSafeInteger(lineStart) || !Number.isSafeInteger(lineEnd)
      || (lineStart as number) < 1 || (lineEnd as number) < (lineStart as number)
      || (lineEnd as number) > 100_000 || !comment || comment.length > 4000
      || suggestion === undefined || (suggestion !== null && suggestion.length > 30_000)) {
      return reply.code(400).send({ error: "Select valid lines, add a comment, and keep any suggestion under 30 KB." });
    }
    const room = await getRoom(roomId);
    const text = room?.doc.getMap<Y.Text>("files").get(filePath);
    if (!text) return reply.code(404).send({ error: "That file is not in the workspace." });
    const lines = text.toString().split("\n");
    if ((lineEnd as number) > lines.length) return reply.code(409).send({ error: "Those lines changed. Select the lines again and retry." });
    const originalText = lines.slice((lineStart as number) - 1, lineEnd as number).join("\n");
    const review = await prisma.workspaceReview.create({
      data: { workspaceId: roomId, authorId: user.id, filePath, lineStart: lineStart as number, lineEnd: lineEnd as number, originalText, comment, suggestion }
    });
    return reply.code(201).send({ review });
  });

  app.post<{ Params: { roomId: string; reviewId: string } }>("/api/workspaces/:roomId/reviews/:reviewId/replies", { config: { rateLimit: { max: 60, timeWindow: "1 hour" } } }, async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "Review threads require PostgreSQL." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to reply." });
    const { roomId, reviewId } = request.params;
    if (!validRoomId(roomId) || !(await getWorkspaceRole(roomId, user.id))) return reply.code(404).send({ error: "Workspace not found." });
    const body = bodyRecord(request.body);
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text || text.length > 4000) return reply.code(400).send({ error: "Write a reply under 4,000 characters." });
    const review = await prisma.workspaceReview.findFirst({ where: { id: reviewId, workspaceId: roomId }, select: { id: true, status: true } });
    if (!review) return reply.code(404).send({ error: "Review thread not found." });
    if (review.status !== "open") return reply.code(409).send({ error: "This review thread is already closed." });
    const replyRecord = await prisma.workspaceReviewReply.create({ data: { reviewId, authorId: user.id, body: text }, include: { author: { select: { id: true, name: true } } } });
    return reply.code(201).send({ reply: replyRecord });
  });

  app.patch<{ Params: { roomId: string; reviewId: string } }>("/api/workspaces/:roomId/reviews/:reviewId", async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "Review threads require PostgreSQL." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to update a review." });
    const { roomId, reviewId } = request.params;
    const role = validRoomId(roomId) ? await getWorkspaceRole(roomId, user.id) : null;
    if (!role) return reply.code(404).send({ error: "Workspace not found." });
    const status = bodyRecord(request.body).status;
    if (status !== "open" && status !== "resolved") return reply.code(400).send({ error: "Choose open or resolved." });
    const review = await prisma.workspaceReview.findFirst({ where: { id: reviewId, workspaceId: roomId }, select: { id: true, authorId: true } });
    if (!review) return reply.code(404).send({ error: "Review thread not found." });
    if (review.authorId !== user.id && role !== "owner") return reply.code(403).send({ error: "Only the comment author or workspace owner can close this thread." });
    const updated = await prisma.workspaceReview.update({ where: { id: reviewId }, data: { status, resolvedAt: status === "resolved" ? new Date() : null } });
    return { review: updated };
  });

  app.post<{ Params: { roomId: string; reviewId: string } }>("/api/workspaces/:roomId/reviews/:reviewId/apply", async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "Review suggestions require PostgreSQL." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to apply a suggestion." });
    const { roomId, reviewId } = request.params;
    const role = validRoomId(roomId) ? await getWorkspaceRole(roomId, user.id) : null;
    if (!role) return reply.code(404).send({ error: "Workspace not found." });
    if (role === "viewer") return reply.code(403).send({ error: "Viewer access cannot apply code suggestions." });
    const review = await prisma.workspaceReview.findFirst({ where: { id: reviewId, workspaceId: roomId }, select: { id: true, filePath: true, lineStart: true, lineEnd: true, originalText: true, suggestion: true, status: true } });
    if (!review || review.suggestion === null) return reply.code(404).send({ error: "An open code suggestion was not found." });
    if (review.status !== "open") return reply.code(409).send({ error: "This review thread is already closed." });
    const room = await getRoom(roomId);
    if (!room) return reply.code(404).send({ error: "The workspace is no longer available." });
    const text = room.doc.getMap<Y.Text>("files").get(review.filePath);
    if (!text) return reply.code(404).send({ error: "The suggested file is no longer in the workspace." });
    const current = text.toString().split("\n");
    if (review.lineEnd > current.length || current.slice(review.lineStart - 1, review.lineEnd).join("\n") !== review.originalText) {
      return reply.code(409).send({ error: "The suggested lines changed. Reopen the review and prepare a fresh suggestion." });
    }
    const replacement = review.suggestion === "" ? [] : review.suggestion.split("\n");
    const updatedLines = [...current.slice(0, review.lineStart - 1), ...replacement, ...current.slice(review.lineEnd)];
    const updatedText = updatedLines.join("\n");
    room.doc.transact(() => {
      text.delete(0, text.length);
      if (updatedText) text.insert(0, updatedText);
    }, { kind: "human", actorId: user.id, actorName: user.name });
    await prisma.workspaceReview.update({ where: { id: review.id }, data: { status: "resolved", resolvedAt: new Date() } });
    return { applied: true, filePath: review.filePath, lineStart: review.lineStart, lineEnd: review.lineStart + Math.max(0, replacement.length - 1) };
  });

  app.get<{ Params: { roomId: string }; Querystring: { filePath?: string } }>("/api/workspaces/:roomId/history", async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "Workspace history requires PostgreSQL." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to view workspace history." });
    const { roomId } = request.params;
    const role = validRoomId(roomId) ? await getWorkspaceRole(roomId, user.id) : null;
    if (!role) return reply.code(404).send({ error: "Workspace not found." });
    const filePath = typeof request.query.filePath === "string" ? request.query.filePath : undefined;
    if (filePath && !isSafeFilePath(filePath)) return reply.code(400).send({ error: "Invalid file path." });
    const changes = await prisma.workspaceChange.findMany({
      where: { workspaceId: roomId, ...(filePath ? { filePath } : {}) },
      orderBy: { createdAt: "desc" }, take: 60,
      select: { id: true, userId: true, actorName: true, actorType: true, filePath: true, lineStart: true, lineEnd: true, operation: true, createdAt: true }
    });
    return { changes };
  });
}
