import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { ECOMMERCE_STARTER_FILES, STARTER_FILES } from "@collab/shared";
import { prisma } from "./db.js";
import { findRequestUser } from "./auth.js";
import { createStarterState } from "./workspaceStore.js";

function validRoomId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

export type WorkspaceRole = "owner" | "editor" | "viewer";

export async function ensureWorkspaceAccess(roomId: string, userId: string): Promise<boolean> {
  if (!prisma) return false;
  await prisma.workspace.upsert({
    where: { id: roomId },
    create: { id: roomId, ownerId: userId, documentState: Buffer.from(createStarterState()) },
    update: {}
  });

  const workspace = await prisma.workspace.findUnique({ where: { id: roomId }, select: { ownerId: true } });
  if (!workspace) return false;
  // Existing Phase 2 rooms have no owner. The first authenticated user to open
  // a room claims it; after that, membership is enforced for every join.
  if (!workspace.ownerId) {
    await prisma.workspace.updateMany({ where: { id: roomId, ownerId: null }, data: { ownerId: userId } });
  }
  return (await getWorkspaceRole(roomId, userId)) !== null;
}

export async function getWorkspaceRole(roomId: string, userId: string): Promise<WorkspaceRole | null> {
  if (!prisma) return null;
  const workspace = await prisma.workspace.findUnique({
    where: { id: roomId },
    select: { ownerId: true, members: { where: { userId }, select: { role: true }, take: 1 } }
  });
  if (!workspace) return null;
  if (workspace.ownerId === userId) return "owner";
  const role = workspace.members[0]?.role;
  if (!role) return null;
  return role === "viewer" ? "viewer" : "editor";
}

export function registerWorkspaceRoutes(app: FastifyInstance, revokeLiveAccess: (roomId: string, userId: string) => void) {
  app.get("/api/workspaces", async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "PostgreSQL is required for workspaces." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to continue." });
    const workspaces = await prisma.workspace.findMany({
      where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, ownerId: true, members: { where: { userId: user.id }, select: { role: true }, take: 1 } }
    });
    return { workspaces: workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, role: workspace.ownerId === user.id ? "owner" : workspace.members[0]?.role === "viewer" ? "viewer" : "editor" })) };
  });

  app.post<{ Body: { name?: unknown; template?: unknown } }>("/api/workspaces", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "PostgreSQL is required to create a workspace." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to create a workspace." });
    const template = request.body?.template === undefined ? "typescript" : request.body.template;
    if (template !== "typescript" && template !== "ecommerce") return reply.code(400).send({ error: "Choose a supported project template." });
    const defaultName = template === "ecommerce" ? "E-commerce storefront" : "Untitled workspace";
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : defaultName;
    if (!name || name.length > 120) return reply.code(400).send({ error: "Project names must be between 1 and 120 characters." });
    const id = `room-${randomUUID()}`;
    const starterFiles = template === "ecommerce" ? ECOMMERCE_STARTER_FILES : STARTER_FILES;
    const workspace = await prisma.workspace.create({
      data: { id, name, ownerId: user.id, documentState: Buffer.from(createStarterState(starterFiles)) },
      select: { id: true, name: true }
    });
    return reply.code(201).send({ workspace: { ...workspace, role: "owner" as const } });
  });

  app.get<{ Params: { roomId: string } }>("/api/workspaces/:roomId/members", async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "PostgreSQL is required for workspace members." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to continue." });
    const currentRole = await getWorkspaceRole(request.params.roomId, user.id);
    if (!validRoomId(request.params.roomId) || !currentRole) {
      return reply.code(404).send({ error: "Workspace not found." });
    }
    const workspace = await prisma.workspace.findUnique({
      where: { id: request.params.roomId },
      select: {
        name: true,
        owner: { select: { id: true, name: true, email: true } },
        members: { select: { role: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } }
      }
    });
    if (!workspace) return reply.code(404).send({ error: "Workspace not found." });
    const canManage = workspace.owner?.id === user.id;
    return {
      canManage,
      currentRole,
      workspaceName: workspace.name,
      // Only the owner needs the access directory; avoid exposing members'
      // email addresses to every invited collaborator.
      members: canManage ? [
        ...(workspace.owner ? [{ ...workspace.owner, role: "owner" }] : []),
        ...workspace.members.map(({ user: member, role }) => ({ ...member, role }))
      ] : []
    };
  });

  app.post<{ Params: { roomId: string }; Body: { email?: unknown; role?: unknown } }>("/api/workspaces/:roomId/members", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "PostgreSQL is required for workspace invitations." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to continue." });
    const roomId = request.params.roomId;
    if (!validRoomId(roomId)) return reply.code(400).send({ error: "Invalid workspace link." });
    const workspace = await prisma.workspace.findUnique({ where: { id: roomId }, select: { ownerId: true } });
    if (!workspace || workspace.ownerId !== user.id) return reply.code(403).send({ error: "Only the workspace owner can invite members." });
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const role = request.body?.role === undefined ? "editor" : request.body.role;
    if (role !== "editor" && role !== "viewer") return reply.code(400).send({ error: "Choose editor or viewer access." });
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: "Enter a valid email address." });
    }
    const invited = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
    if (!invited) return reply.code(404).send({ error: "That person needs to create an account before you can invite them." });
    if (invited.id === user.id) return reply.code(400).send({ error: "You already own this workspace." });
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: roomId, userId: invited.id } },
      create: { workspaceId: roomId, userId: invited.id, role },
      update: { role }
    });
    revokeLiveAccess(roomId, invited.id);
    return reply.code(201).send({ member: { ...invited, role }, message: `${invited.email} can now open this workspace as a ${role}.` });
  });

  app.patch<{ Params: { roomId: string; memberUserId: string }; Body: { role?: unknown } }>("/api/workspaces/:roomId/members/:memberUserId", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (request, reply) => {
    if (!prisma) return reply.code(503).send({ error: "PostgreSQL is required for workspace access changes." });
    const user = await findRequestUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to continue." });
    const { roomId, memberUserId } = request.params;
    const role = request.body?.role;
    if (!validRoomId(roomId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(memberUserId) || (role !== "editor" && role !== "viewer")) {
      return reply.code(400).send({ error: "Choose editor or viewer access." });
    }
    const workspace = await prisma.workspace.findUnique({ where: { id: roomId }, select: { ownerId: true } });
    if (!workspace || workspace.ownerId !== user.id) return reply.code(403).send({ error: "Only the workspace owner can change member roles." });
    const updated = await prisma.workspaceMember.updateMany({ where: { workspaceId: roomId, userId: memberUserId }, data: { role } });
    if (updated.count === 0) return reply.code(404).send({ error: "That account is not a member of this workspace." });
    revokeLiveAccess(roomId, memberUserId);
    return { role, message: `Member role changed to ${role}. Their room connection will reconnect with the new access.` };
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
