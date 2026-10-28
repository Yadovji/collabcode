import type { FastifyInstance } from "fastify";
import { prisma } from "./db.js";
import { findRequestUser } from "./auth.js";
import { createStarterState } from "./workspaceStore.js";

function validRoomId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

export async function ensureWorkspaceAccess(roomId: string, userId: string): Promise<boolean> {
  if (!prisma) return false;
  await prisma.workspace.upsert({
    where: { id: roomId },
    create: { id: roomId, ownerId: userId, documentState: Buffer.from(createStarterState()) },
    update: {}
  });

  let workspace = await prisma.workspace.findUnique({ where: { id: roomId }, select: { ownerId: true } });
  if (!workspace) return false;
  // Existing Phase 2 rooms have no owner. The first authenticated user to open
  // a room claims it; after that, membership is enforced for every join.
  if (!workspace.ownerId) {
    await prisma.workspace.updateMany({ where: { id: roomId, ownerId: null }, data: { ownerId: userId } });
    workspace = await prisma.workspace.findUnique({ where: { id: roomId }, select: { ownerId: true } });
  }
  return hasWorkspaceAccess(roomId, userId);
}

async function hasWorkspaceAccess(roomId: string, userId: string): Promise<boolean> {
  if (!prisma) return false;
  const workspace = await prisma.workspace.findUnique({ where: { id: roomId }, select: { ownerId: true } });
  if (!workspace) return false;
  if (workspace.ownerId === userId) return true;
  const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: roomId, userId } }, select: { userId: true } });
  return membership !== null;
}

export function registerWorkspaceRoutes(app: FastifyInstance, revokeLiveAccess: (roomId: string, userId: string) => void) {
  app.get("/api/workspaces", async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "PostgreSQL is required for workspaces." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to continue." });
    const workspaces = await prisma.workspace.findMany({
      where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, ownerId: true }
    });
    return { workspaces: workspaces.map((workspace) => ({ ...workspace, role: workspace.ownerId === user.id ? "owner" : "member" })) };
  });

  app.get<{ Params: { roomId: string } }>("/api/workspaces/:roomId/members", async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "PostgreSQL is required for workspace members." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to continue." });
    if (!validRoomId(request.params.roomId) || !(await hasWorkspaceAccess(request.params.roomId, user.id))) {
      return reply.code(404).send({ error: "Workspace not found." });
    }
    const workspace = await prisma.workspace.findUnique({
      where: { id: request.params.roomId },
      select: {
        owner: { select: { id: true, name: true, email: true } },
        members: { select: { role: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } }
      }
    });
    if (!workspace) return reply.code(404).send({ error: "Workspace not found." });
    const canManage = workspace.owner?.id === user.id;
    return {
      canManage,
      // Only the owner needs the access directory; avoid exposing members'
      // email addresses to every invited collaborator.
      members: canManage ? [
        ...(workspace.owner ? [{ ...workspace.owner, role: "owner" }] : []),
        ...workspace.members.map(({ user: member, role }) => ({ ...member, role }))
      ] : []
    };
  });

  app.post<{ Params: { roomId: string }; Body: { email?: unknown } }>("/api/workspaces/:roomId/members", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "PostgreSQL is required for workspace invitations." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to continue." });
    const roomId = request.params.roomId;
    if (!validRoomId(roomId)) return reply.code(400).send({ error: "Invalid workspace link." });
    const workspace = await prisma.workspace.findUnique({ where: { id: roomId }, select: { ownerId: true } });
    if (!workspace || workspace.ownerId !== user.id) return reply.code(403).send({ error: "Only the workspace owner can invite members." });
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: "Enter a valid email address." });
    }
    const invited = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
    if (!invited) return reply.code(404).send({ error: "That person needs to create an account before you can invite them." });
    if (invited.id === user.id) return reply.code(400).send({ error: "You already own this workspace." });
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: roomId, userId: invited.id } },
      create: { workspaceId: roomId, userId: invited.id },
      update: {}
    });
    return reply.code(201).send({ member: invited, message: `${invited.email} can now open this workspace.` });
  });

  app.delete<{ Params: { roomId: string; memberUserId: string } }>("/api/workspaces/:roomId/members/:memberUserId", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "PostgreSQL is required for workspace access changes." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to continue." });
    const { roomId, memberUserId } = request.params;
    if (!validRoomId(roomId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(memberUserId)) {
      return reply.code(400).send({ error: "Invalid workspace or member." });
    }
    const workspace = await prisma.workspace.findUnique({ where: { id: roomId }, select: { ownerId: true } });
    if (!workspace || workspace.ownerId !== user.id) {
      return reply.code(403).send({ error: "Only the workspace owner can remove members." });
    }
    if (memberUserId === user.id) return reply.code(400).send({ error: "The owner cannot remove themselves from this workspace." });

    const removed = await prisma.workspaceMember.deleteMany({ where: { workspaceId: roomId, userId: memberUserId } });
    if (removed.count === 0) return reply.code(404).send({ error: "That account is not a member of this workspace." });
    revokeLiveAccess(roomId, memberUserId);
    return reply.code(204).send();
  });
}
