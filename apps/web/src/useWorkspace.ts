import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { isSafeFilePath, SOCKET_EVENTS, type Collaborator } from "@collab/shared";

const apiUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:4000" : "");
const palette = ["#9380ff", "#e66b9b", "#46b6a4", "#e7a34d", "#61a2e8", "#d172d6"];

function asUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError("Expected a binary Yjs update.");
}

function getUser(authenticatedName: string) {
  const name = authenticatedName;
  localStorage.setItem("collabcode-name", name);
  let color = localStorage.getItem("collabcode-color");
  if (!color) {
    color = palette[Math.floor(Math.random() * palette.length)];
    localStorage.setItem("collabcode-color", color);
  }
  return { name, color };
}

export function useWorkspace(roomId: string, authenticatedName: string) {
  const [user, setUser] = useState(() => getUser(authenticatedName));
  const doc = useMemo(() => new Y.Doc(), [roomId]);
  const awareness = useMemo(() => new Awareness(doc), [doc]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<Collaborator[]>([]);
  const syncedRef = useRef(false);
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const files = doc.getMap<Y.Text>("files");

  useEffect(() => {
    awareness.setLocalStateField("user", user);
  }, [awareness, user]);

  useEffect(() => {
    const client = io(apiUrl || window.location.origin, { transports: ["websocket", "polling"], reconnection: true, withCredentials: true });
    setSocket(client);
    const refreshFiles = () => setFilePaths([...files.keys()].sort((a, b) => a.localeCompare(b)));
    const refreshUsers = () => setUsers([...awareness.getStates().values()].map((state) => state.user as Collaborator | undefined).filter((item): item is Collaborator => !!item?.name));
    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      refreshFiles();
      if (origin !== "remote" && origin !== "starter-files" && client.connected && syncedRef.current) client.emit(SOCKET_EVENTS.documentUpdate, update);
    };
    const onAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin !== "remote" && client.connected) {
        const changed = [...added, ...updated, ...removed];
        if (changed.length) client.emit(SOCKET_EVENTS.awarenessUpdate, encodeAwarenessUpdate(awareness, changed));
      }
    };
    const onConnect = () => {
      setConnected(true);
      setError("");
      setSynced(false);
      syncedRef.current = false;
      client.emit(SOCKET_EVENTS.join, { roomId });
    };
    const onDisconnect = () => { setConnected(false); setSynced(false); syncedRef.current = false; };
    const onSync = (payload: unknown) => {
      const update = asUint8Array(payload);
      try { Y.applyUpdate(doc, update, "remote"); }
      catch (error) { console.error("Could not apply the shared document update.", error); return; }
      refreshFiles();
      setSynced(true);
      syncedRef.current = true;
      client.emit(SOCKET_EVENTS.documentUpdate, Y.encodeStateAsUpdate(doc));
      const userClientId = awareness.clientID;
      client.emit(SOCKET_EVENTS.awarenessUpdate, encodeAwarenessUpdate(awareness, [userClientId]));
    };
    const onRemoteUpdate = (payload: unknown) => Y.applyUpdate(doc, asUint8Array(payload), "remote");
    const onAwareness = (payload: unknown) => applyAwarenessUpdate(awareness, asUint8Array(payload), "remote");
    client.on("connect", onConnect);
    client.on("disconnect", onDisconnect);
    client.on(SOCKET_EVENTS.documentSync, onSync);
    client.on(SOCKET_EVENTS.documentUpdate, onRemoteUpdate);
    client.on(SOCKET_EVENTS.awarenessSync, onAwareness);
    client.on(SOCKET_EVENTS.awarenessUpdate, onAwareness);
    const onWorkspaceError = (message: string) => setError(message || "Could not join this workspace.");
    const onConnectError = (reason: Error) => setError(reason.message || "Could not connect. Please sign in again.");
    client.on(SOCKET_EVENTS.error, onWorkspaceError);
    client.on("connect_error", onConnectError);
    doc.on("update", onDocUpdate);
    files.observe(refreshFiles);
    awareness.on("update", onAwarenessUpdate);
    awareness.on("update", refreshUsers);
    refreshUsers();
    return () => {
      client.off("connect", onConnect);
      client.off("disconnect", onDisconnect);
      client.off(SOCKET_EVENTS.documentSync, onSync);
      client.off(SOCKET_EVENTS.documentUpdate, onRemoteUpdate);
      client.off(SOCKET_EVENTS.awarenessSync, onAwareness);
      client.off(SOCKET_EVENTS.awarenessUpdate, onAwareness);
      client.off(SOCKET_EVENTS.error, onWorkspaceError);
      client.off("connect_error", onConnectError);
      doc.off("update", onDocUpdate);
      files.unobserve(refreshFiles);
      awareness.off("update", onAwarenessUpdate);
      awareness.off("update", refreshUsers);
      client.disconnect();
      awareness.destroy();
      doc.destroy();
    };
  // A new document and socket are created when changing rooms.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, doc, awareness]);

  const createFile = useCallback((path: string, contents = "") => {
    if (!isSafeFilePath(path) || !socket) return;
    socket.emit(SOCKET_EVENTS.fileCreate, { path, contents });
  }, [socket]);
  const deleteFile = useCallback((path: string) => socket?.emit(SOCKET_EVENTS.fileDelete, path), [socket]);
  const changeName = useCallback(() => {
    const nextName = window.prompt("Choose a display name", user.name)?.trim();
    if (!nextName || nextName.length > 32) return;
    localStorage.setItem("collabcode-name", nextName);
    const next = { ...user, name: nextName };
    setUser(next);
    awareness.setLocalStateField("user", next);
  }, [awareness, user]);

  return { doc, awareness, files, filePaths, users, user, connected, synced, error, createFile, deleteFile, changeName };
}
