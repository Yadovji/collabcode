import "./env.js";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server, type Socket } from "socket.io";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { isSafeFilePath, SOCKET_EVENTS } from "@collab/shared";
import { findUserForSessionToken, registerAuthRoutes, sessionIdForToken, sessionTokenFromCookieHeader } from "./auth.js";
import { persistenceEnabled, prisma } from "./db.js";
import { loadWorkspaceDocument, saveWorkspaceDocument } from "./workspaceStore.js";
import { ensureWorkspaceAccess, getWorkspaceRole, registerWorkspaceRoutes } from "./workspaceAccess.js";
import { registerAiRoutes } from "./ai.js";
import { registerCollaborationRoutes } from "./collaboration.js";
import { scheduleWorkspaceIndex } from "./workspaceIndex.js";

const port = Number(process.env.PORT || 4000);
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:5174";
const corsOrigins = webOrigin.startsWith("http://localhost:")
  ? [...new Set([webOrigin, "http://localhost:5173", "http://localhost:5174"])]
  : [webOrigin];
// The deployment uses one trusted reverse proxy (Render or the bundled Nginx).
// Keep proxy trust disabled unless that topology is in use so clients cannot
// spoof their IP address to bypass rate limits.
const trustProxy = process.env.TRUST_PROXY === "1";
const app = Fastify({ logger: true, bodyLimit: 1024 * 1024, trustProxy });
await app.register(cors, { origin: corsOrigins, credentials: true });
await app.register(rateLimit, { global: false });

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const serveFrontend = process.env.NODE_ENV === "production" && existsSync(path.join(webRoot, "index.html"));
if (serveFrontend) {
  await app.register(fastifyStatic, {
    root: webRoot,
    wildcard: false,
    index: false,
    cacheControl: false,
  });
  app.get("/", async (_request, reply) => reply.sendFile("index.html"));
}

app.get("/health", async (_request, reply) => {
  if (!prisma) return { status: "ok", service: "collab-api", persistence: "memory" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", service: "collab-api", persistence: "postgresql" };
  } catch {
    return reply.code(503).send({ status: "error", service: "collab-api", persistence: "unavailable" });
  }
});
type Room = {
  id: string;
  doc: Y.Doc;
  awareness: Awareness;
  sockets: Set<string>;
  persistTimer?: ReturnType<typeof setTimeout>;
  persistenceQueue: Promise<void>;
};
const rooms = new Map<string, Room>();
const roomLoads = new Map<string, Promise<Room>>();
const socketRooms = new Map<string, string>();
const socketAwarenessClients = new Map<string, number[]>();

type ChangeActor = { userId: string | null; name: string; type: "human" | "agent" };
type PendingChange = ChangeActor & { workspaceId: string; filePath: string; lineStart: number; lineEnd: number; operation: string; timer: ReturnType<typeof setTimeout> };
const pendingChanges = new Map<string, PendingChange>();
const lineActivityMergeWindowMs = 2 * 60 * 1000;

function changedLineRange(before: string, after: string): { lineStart: number; lineEnd: number } | null {
  if (before === after) return null;
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix++;
  let suffix = 0;
  while (suffix < beforeLines.length - prefix && suffix < afterLines.length - prefix
    && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]) suffix++;
  const lineStart = prefix + 1;
  const lineEnd = Math.max(lineStart, afterLines.length - suffix);
  return { lineStart, lineEnd };
}

function changeActorForOrigin(origin: unknown): ChangeActor | null {
  if (typeof origin === "string") {
    const socket = io.sockets.sockets.get(origin);
    const user = socket?.data.user as { id?: string; name?: string } | undefined;
    return user?.id ? { userId: user.id, name: user.name || "Collaborator", type: "human" } : null;
  }
  if (typeof origin === "object" && origin !== null && "kind" in origin && origin.kind === "agent") {
    const value = origin as { actorId?: unknown; actorName?: unknown };
    return { userId: typeof value.actorId === "string" ? value.actorId : null, name: typeof value.actorName === "string" ? value.actorName : "AI assistant", type: "agent" };
  }
  if (typeof origin === "object" && origin !== null && "kind" in origin && origin.kind === "human") {
    const value = origin as { actorId?: unknown; actorName?: unknown };
    return { userId: typeof value.actorId === "string" ? value.actorId : null, name: typeof value.actorName === "string" ? value.actorName : "Collaborator", type: "human" };
  }
  return null;
}

function flushPendingChange(key: string): Promise<void> {
  const pending = pendingChanges.get(key);
  if (!pending) return Promise.resolve();
  clearTimeout(pending.timer);
  pendingChanges.delete(key);
  if (!prisma) return Promise.resolve();
  const { timer: _timer, name, type, ...change } = pending;
  const data = { ...change, actorName: name, actorType: type };
  const cutoff = new Date(Date.now() - lineActivityMergeWindowMs);
  return prisma.workspaceChange.findFirst({
    where: {
      workspaceId: data.workspaceId,
      userId: data.userId,
      actorName: data.actorName,
      actorType: data.actorType,
      filePath: data.filePath,
      operation: data.operation,
      createdAt: { gte: cutoff }
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, lineStart: true, lineEnd: true }
  }).then((previous) => previous
    ? prisma!.workspaceChange.update({
      where: { id: previous.id },
      data: {
        lineStart: Math.min(previous.lineStart, data.lineStart),
        lineEnd: Math.max(previous.lineEnd, data.lineEnd),
        createdAt: new Date()
      }
    })
    : prisma!.workspaceChange.create({ data })
  ).then(() => undefined).catch((error: unknown) => {
    app.log.warn({ error, workspaceId: data.workspaceId }, "Could not save workspace line activity");
  });
}

function queueLineActivity(workspaceId: string, filePath: string, range: { lineStart: number; lineEnd: number }, actor: ChangeActor, operation = "edit") {
  if (!prisma) return;
  const key = `${workspaceId}\0${filePath}\0${actor.type}\0${actor.userId || actor.name}`;
  const existing = pendingChanges.get(key);
  if (existing) {
    existing.lineStart = Math.min(existing.lineStart, range.lineStart);
    existing.lineEnd = Math.max(existing.lineEnd, range.lineEnd);
    existing.operation = existing.operation === operation ? operation : "edit";
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => flushPendingChange(key), 1800);
    return;
  }
  const pending: PendingChange = {
    workspaceId, filePath, ...range, ...actor, operation,
    timer: setTimeout(() => flushPendingChange(key), 1800)
  };
  pendingChanges.set(key, pending);
}

function asUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

function persistRoom(room: Room): Promise<void> {
  if (room.persistTimer) clearTimeout(room.persistTimer);
  room.persistTimer = undefined;
  if (!persistenceEnabled) return Promise.resolve();

  room.persistenceQueue = room.persistenceQueue
    .catch(() => undefined)
    .then(() => saveWorkspaceDocument(room.id, room.doc))
    .catch((error: unknown) => {
      app.log.error({ error, roomId: room.id }, "Could not save workspace snapshot");
    });
  return room.persistenceQueue;
}

function schedulePersistence(room: Room) {
  if (!persistenceEnabled) return;
  if (room.persistTimer) clearTimeout(room.persistTimer);
  room.persistTimer = setTimeout(() => {
    room.persistTimer = undefined;
    void persistRoom(room);
  }, 750);
}

async function getRoom(roomId: string, io: Server): Promise<Room> {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const inProgress = roomLoads.get(roomId);
  if (inProgress) return inProgress;

  const loading = (async () => {
    const doc = await loadWorkspaceDocument(roomId);
    const awareness = new Awareness(doc);
    const room: Room = { id: roomId, doc, awareness, sockets: new Set(), persistenceQueue: Promise.resolve() };
    const files = doc.getMap<Y.Text>("files");
    const textObservers = new Map<Y.Text, { path: string; contents: string; observer: (event: Y.YTextEvent, transaction: Y.Transaction) => void }>();
    const syncTextObservers = () => {
      const activeTexts = new Set(files.values());
      for (const [text, tracked] of textObservers) {
        if (activeTexts.has(text)) continue;
        text.unobserve(tracked.observer);
        textObservers.delete(text);
      }
      for (const [filePath, text] of files) {
        const tracked = textObservers.get(text);
        if (tracked) { tracked.path = filePath; continue; }
        const entry = { path: filePath, contents: text.toString(), observer: (_event: Y.YTextEvent, _transaction: Y.Transaction) => undefined };
        entry.observer = (_event, transaction) => {
          const nextContents = text.toString();
          const changed = changedLineRange(entry.contents, nextContents);
          entry.contents = nextContents;
          const actor = changeActorForOrigin(transaction.origin);
          if (changed && actor) queueLineActivity(roomId, entry.path, changed, actor);
        };
        textObservers.set(text, entry);
        text.observe(entry.observer);
      }
    };
    files.observe((event: Y.YMapEvent<Y.Text>) => {
      const actor = changeActorForOrigin(event.transaction.origin);
      if (actor) {
        for (const [filePath, change] of event.keys) {
          if (change.action === "add") {
            const text = files.get(filePath);
            if (text) queueLineActivity(roomId, filePath, { lineStart: 1, lineEnd: Math.max(1, text.toString().split("\n").length) }, actor, "create");
          } else if (change.action === "delete" && change.oldValue instanceof Y.Text) {
            queueLineActivity(roomId, filePath, { lineStart: 1, lineEnd: Math.max(1, change.oldValue.toString().split("\n").length) }, actor, "delete");
          }
        }
      }
      syncTextObservers();
    });
    syncTextObservers();
    const scheduleIndex = () => scheduleWorkspaceIndex(roomId, () => {
      return [...files.entries()].map(([path, text]) => [path, text.toString()] as [string, string]);
    });

    doc.on("update", (update: Uint8Array) => {
      // Yjs updates are idempotent, so echoing to the sender is safe. This also
      // returns server-created file operations to the client that requested them.
      for (const socketId of room.sockets) {
        io.to(socketId).emit(SOCKET_EVENTS.documentUpdate, update);
      }
      schedulePersistence(room);
      scheduleIndex();
    });
    awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changed = [...added, ...updated, ...removed];
      if (changed.length === 0) return;
      if (typeof origin === "string") {
        const clientIds = new Set(socketAwarenessClients.get(origin) || []);
        changed.forEach((id) => clientIds.add(id));
        socketAwarenessClients.set(origin, [...clientIds]);
      }
      const update = encodeAwarenessUpdate(awareness, changed);
      const senderId = typeof origin === "string" ? origin : undefined;
      for (const socketId of room.sockets) {
        if (socketId !== senderId) io.to(socketId).emit(SOCKET_EVENTS.awarenessUpdate, update);
      }
    });
    rooms.set(roomId, room);
    scheduleIndex();
    return room;
  })();
  roomLoads.set(roomId, loading);
  try {
    return await loading;
  } finally {
    roomLoads.delete(roomId);
  }
}

const io = new Server(app.server, {
  cors: { origin: corsOrigins, methods: ["GET", "POST"], credentials: true },
  maxHttpBufferSize: 1e6,
  transports: ["websocket", "polling"]
});

registerAuthRoutes(app, (userId, sessionId) => {
  for (const socket of io.sockets.sockets.values()) {
    const socketUser = socket.data.user as { id?: string } | undefined;
    if (socketUser?.id !== userId || (sessionId && socket.data.sessionId !== sessionId)) continue;
    socket.emit(SOCKET_EVENTS.error, "Your sign-in session was revoked. Please sign in again.");
    socket.disconnect(true);
  }
});

registerAiRoutes(app, async (roomId) => await getRoom(roomId, io));
registerCollaborationRoutes(app, async (roomId) => await getRoom(roomId, io));

registerWorkspaceRoutes(app, (roomId, userId) => {
  for (const socket of io.sockets.sockets.values()) {
    const connectedRoomId = socketRooms.get(socket.id);
    const socketUser = socket.data.user as { id?: string } | undefined;
    if (connectedRoomId !== roomId || socketUser?.id !== userId) continue;
    socket.emit(SOCKET_EVENTS.error, "Your access to this workspace was revoked by its owner.");
    socket.disconnect(true);
  }
});

io.use(async (socket, next) => {
  try {
    const token = sessionTokenFromCookieHeader(socket.handshake.headers.cookie);
    const user = await findUserForSessionToken(token);
    if (!user) return next(new Error("Sign in to connect to a workspace."));
    socket.data.user = user;
    socket.data.sessionId = token ? sessionIdForToken(token) : undefined;
    next();
  } catch (error) {
    app.log.error({ error }, "Could not validate a socket session");
    next(new Error("Could not validate your session. Please sign in again."));
  }
});

io.on("connection", (socket: Socket) => {
  socket.on(SOCKET_EVENTS.join, async (payload: { roomId?: unknown }) => {
    const roomId = typeof payload?.roomId === "string" ? payload.roomId : "";
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId)) {
      socket.emit(SOCKET_EVENTS.error, "Invalid room link.");
      return;
    }

    const user = socket.data.user as { id: string; email: string; name: string } | undefined;
    if (!user) {
      socket.emit(SOCKET_EVENTS.error, "Sign in to connect to a workspace.");
      return;
    }

    let room: Room;
    try {
      const authorized = await ensureWorkspaceAccess(roomId, user.id);
      if (!authorized) {
        socket.emit(SOCKET_EVENTS.error, "You do not have access to this workspace. Ask its owner to invite your account.");
        return;
      }
      const role = await getWorkspaceRole(roomId, user.id);
      if (!role) {
        socket.emit(SOCKET_EVENTS.error, "You do not have access to this workspace. Ask its owner to invite your account.");
        return;
      }
      socket.data.workspaceRole = role;
      room = await getRoom(roomId, io);
    } catch (error) {
      app.log.error({ error, roomId }, "Could not load workspace");
      socket.emit(SOCKET_EVENTS.error, "Could not load the workspace. Check the database connection and try again.");
      return;
    }
    room.sockets.add(socket.id);
    socketRooms.set(socket.id, roomId);
    socket.join(roomId);
    const initialUpdate = Y.encodeStateAsUpdate(room.doc);
    socket.emit(SOCKET_EVENTS.documentSync, initialUpdate);
    const peers = [...room.awareness.getStates().keys()];
    if (peers.length) socket.emit(SOCKET_EVENTS.awarenessSync, encodeAwarenessUpdate(room.awareness, peers));
  });

  socket.on(SOCKET_EVENTS.documentUpdate, (update: unknown) => {
    if (socket.data.workspaceRole === "viewer") return;
    const roomId = socketRooms.get(socket.id);
    const room = roomId && rooms.get(roomId);
    const bytes = asUint8Array(update);
    if (!bytes || bytes.byteLength > 900_000 || !room) return;
    try { Y.applyUpdate(room.doc, bytes, socket.id); }
    catch (error) { app.log.warn({ error, socketId: socket.id }, "Rejected invalid Yjs update"); }
  });

  socket.on(SOCKET_EVENTS.awarenessUpdate, (update: unknown) => {
    const roomId = socketRooms.get(socket.id);
    const room = roomId && rooms.get(roomId);
    const bytes = asUint8Array(update);
    if (!bytes || bytes.byteLength > 32_000 || !room) return;
    try {
      applyAwarenessUpdate(room.awareness, bytes, socket.id);
    } catch (error) { app.log.debug({ error }, "Ignored invalid awareness update"); }
  });

  socket.on(SOCKET_EVENTS.fileCreate, (payload: unknown) => {
    if (socket.data.workspaceRole === "viewer") return;
    const roomId = socketRooms.get(socket.id);
    const room = roomId && rooms.get(roomId);
    const input = typeof payload === "string" ? { path: payload, contents: "" } : payload;
    const path = typeof input === "object" && input !== null && "path" in input ? input.path : undefined;
    const contents = typeof input === "object" && input !== null && "contents" in input ? input.contents : "";
    if (typeof contents !== "string" || Buffer.byteLength(contents, "utf8") > 100_000) return;
    if (!room || !isSafeFilePath(path) || room.doc.getMap("files").size >= 100) return;
    const files = room.doc.getMap<Y.Text>("files");
    if (files.has(path)) return;
    const text = new Y.Text();
    if (contents) text.insert(0, contents);
    room.doc.transact(() => files.set(path, text), socket.id);
  });

  socket.on(SOCKET_EVENTS.fileDelete, (path: unknown) => {
    if (socket.data.workspaceRole === "viewer") return;
    const roomId = socketRooms.get(socket.id);
    const room = roomId && rooms.get(roomId);
    if (!room || !isSafeFilePath(path)) return;
    const files = room.doc.getMap("files");
    if (files.size <= 1 || !files.has(path)) return;
    room.doc.transact(() => files.delete(path), socket.id);
  });

  socket.on("disconnect", () => {
    const roomId = socketRooms.get(socket.id);
    const room = roomId && rooms.get(roomId);
    if (room) {
      room.sockets.delete(socket.id);
      schedulePersistence(room);
      const clientIds = socketAwarenessClients.get(socket.id) || [];
      if (clientIds.length) removeAwarenessStates(room.awareness, clientIds, socket.id);
    }
    socketRooms.delete(socket.id);
    socketAwarenessClients.delete(socket.id);
  });
});

if (prisma) {
  await prisma.$connect();
  app.log.info("PostgreSQL persistence enabled");
} else {
  app.log.warn("DATABASE_URL is unset; workspace data will only be kept in memory");
}

if (serveFrontend) {
  app.setNotFoundHandler((request, reply) => {
    const acceptsHtml = request.headers.accept?.includes("text/html");
    const isApiOrSocket = request.url === "/api" || request.url.startsWith("/api/")
      || request.url === "/socket.io" || request.url.startsWith("/socket.io/");
    if (request.method === "GET" && acceptsHtml && !isApiOrSocket) {
      return reply.type("text/html").sendFile("index.html");
    }
    return reply.code(404).send({ error: "Route not found" });
  });
}

await app.listen({ port, host: "0.0.0.0" });
app.log.info(`CollabCode API listening on 0.0.0.0:${port}`);

const shutdown = async () => {
  await io.close();
  await Promise.all([...pendingChanges.keys()].map((key) => flushPendingChange(key)));
  await Promise.all([...rooms.values()].map((room) => persistRoom(room)));
  await app.close();
  for (const room of rooms.values()) { room.awareness.destroy(); room.doc.destroy(); }
  await prisma?.$disconnect();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
