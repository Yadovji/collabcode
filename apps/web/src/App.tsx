import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Code2, FilePlus2, Folder, LockKeyhole, MousePointer2, Network, Play, Radio, Sparkles, Users, Wifi, WifiOff } from "lucide-react";
import { DEFAULT_ROOM_ID, isSafeFilePath } from "@collab/shared";
import { AuthPage } from "./AuthPage";
import { apiRequest, useAuth } from "./auth";
import { useWorkspace } from "./useWorkspace";
import { CollaborativeEditor } from "./CollaborativeEditor";
import { buildWebsitePreview, WEBSITE_STARTER_FILES } from "./websitePreview";

function makeRoomId() {
  return `room-${crypto.randomUUID().slice(0, 8)}`;
}

function Home() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [workspaceError, setWorkspaceError] = useState("");
  useEffect(() => {
    apiRequest("/api/workspaces")
      .then(async (response) => {
        const result = await response.json() as { workspaces?: Array<{ id: string; name: string; role: string }>; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not load workspaces.");
        setWorkspaces(result.workspaces || []);
      })
      .catch((error: unknown) => setWorkspaceError(error instanceof Error ? error.message : "Could not load workspaces."));
  }, []);
  return <main className="landing">
    <nav className="landing-nav"><div className="brand"><span className="brand-mark"><Code2 size={17} /></span>collab<span>code</span></div><div className="landing-account"><span>{user?.email}</span><button className="quiet-link signout-button" onClick={() => void logout()}>Sign out</button></div></nav>
    <section className="hero">
      <div className="eyebrow"><span className="eyebrow-dot" /> COLLABORATION AND WEBSITE PREVIEWS, PHASE FOUR</div>
      <h1>Build together.<br /><em>See every change.</em></h1>
      <p className="hero-copy">A shared coding room for your team. Edit the same files in real time, then run a sandboxed preview of your HTML, CSS, and JavaScript website.</p>
      <button className="primary large" onClick={() => navigate(`/room/${makeRoomId()}`)}>Create a workspace <ArrowRight size={16} /></button>
      <button className="text-button" onClick={() => navigate(`/room/${DEFAULT_ROOM_ID}`)}>Open the sample workspace</button>
    </section>
    <section className="feature-strip">
      <div><div className="feature-icon violet"><MousePointer2 size={17} /></div><b>Shared editing</b><span>Monaco + Yjs</span></div>
      <div><div className="feature-icon blue"><Users size={17} /></div><b>Live presence</b><span>See your team in the room</span></div>
      <div><div className="feature-icon green"><Network size={17} /></div><b>Room links</b><span>Share after inviting</span></div>
      <div><div className="feature-icon amber"><LockKeyhole size={17} /></div><b>Member access</b><span>Sign in and get invited</span></div>
    </section>
    <section className="workspace-list">
      <div className="workspace-list-heading"><div><b>Your workspaces</b><span>Rooms you own or have been invited to</span></div><span>{workspaces.length}</span></div>
      {workspaceError && <p className="workspace-list-error">{workspaceError}</p>}
      {workspaces.length ? workspaces.map((workspace) => <button className="workspace-card" key={workspace.id} onClick={() => navigate(`/room/${workspace.id}`)}><span className="workspace-card-icon"><Folder size={15} /></span><span className="workspace-card-info"><b>{workspace.name}</b><small>{workspace.id}</small></span><span className="workspace-role">{workspace.role}</span><ArrowRight size={14} /></button>) : !workspaceError && <p className="workspace-empty">No workspaces yet. Create one to get started.</p>}
    </section>
    <footer className="landing-footer">Built for focused collaboration <span>·</span> More workspace features are coming in later phases</footer>
  </main>;
}

function Room() {
  const { roomId = DEFAULT_ROOM_ID } = useParams();
  const { user: authenticatedUser } = useAuth();
  const navigate = useNavigate();
  const workspace = useWorkspace(roomId, authenticatedUser?.name || "CollabCode user");
  const [accessMembers, setAccessMembers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [canManageAccess, setCanManageAccess] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [activeFile, setActiveFile] = useState("src/index.ts");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("Explorer");
  const [chatOpen, setChatOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [previewRunId, setPreviewRunId] = useState(0);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const previewNeedsStarter = previewWarnings.some((warning) => warning.startsWith("Add index.html"));
  const refreshAccess = useCallback(async () => {
    try {
      const response = await apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/members`);
      const result = await response.json() as { members?: Array<{ id: string; name: string; email: string; role: string }>; canManage?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load workspace access.");
      setAccessMembers(result.members || []);
      setCanManageAccess(Boolean(result.canManage));
      setAccessError("");
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Could not load workspace access.");
    }
  }, [roomId]);
  useEffect(() => { void refreshAccess(); }, [refreshAccess]);
  useEffect(() => {
    if (workspace.filePaths.length && !workspace.filePaths.includes(activeFile)) setActiveFile(workspace.filePaths[0]);
  }, [workspace.filePaths, activeFile]);

  const createFile = () => {
    const name = window.prompt("New file path (for example: src/utils.ts)");
    if (name?.trim()) {
      const path = name.trim();
      if (!isSafeFilePath(path)) {
        window.alert("Use a relative file path with letters, numbers, dots, dashes, underscores, and slashes.");
        return;
      }
      workspace.createFile(path);
      setActiveFile(path);
    }
  };
  const shareRoom = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { window.prompt("Copy this workspace link", window.location.href); }
  };
  const inviteMember = async () => {
    if (!canManageAccess) return;
    const email = window.prompt("Enter the email of a teammate who already has a CollabCode account.");
    if (!email?.trim()) return;
    try {
      const response = await apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/members`, { method: "POST", body: JSON.stringify({ email }) });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not invite that account.");
      await refreshAccess();
      window.alert(result.message || "Member added. Share the room link with them.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not invite that account.");
    }
  };
  const removeMember = async (member: { id: string; name: string; email: string }) => {
    if (!canManageAccess || !window.confirm(`Remove ${member.name} (${member.email}) from this workspace? Their active room connection will be closed.`)) return;
    try {
      const response = await apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/members/${encodeURIComponent(member.id)}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not remove that member.");
      await refreshAccess();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not remove that member.");
    }
  };
  const activeText = workspace.files.get(activeFile);

  const runWebsitePreview = () => {
    const snapshot = Object.create(null) as Record<string, string>;
    for (const path of workspace.filePaths) snapshot[path] = workspace.files.get(path)?.toString() || "";
    const result = buildWebsitePreview(snapshot);
    setPreviewHtml(result.html);
    setPreviewWarnings(result.warnings);
    setPreviewErrors([]);
    setPreviewRunId((current) => current + 1);
    setPreviewOpen(true);
  };

  const createWebsiteStarter = () => {
    for (const [path, contents] of Object.entries(WEBSITE_STARTER_FILES)) workspace.createFile(path, contents);
    setActiveFile("index.html");
    setPreviewOpen(false);
  };

  useEffect(() => {
    const onPreviewMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== previewFrameRef.current?.contentWindow) return;
      if (typeof event.data !== "object" || event.data === null) return;
      const data = event.data as { type?: unknown; message?: unknown };
      if (data.type !== "collabcode-preview-error" || typeof data.message !== "string") return;
      const message = data.message;
      setPreviewErrors((current) => [...current.slice(-3), message.slice(0, 500)]);
    };
    window.addEventListener("message", onPreviewMessage);
    return () => window.removeEventListener("message", onPreviewMessage);
  }, []);

  if (workspace.error) return <main className="auth-denied"><div className="auth-denied-card"><div className="auth-icon"><LockKeyhole size={20} /></div><p className="auth-eyebrow">WORKSPACE ACCESS</p><h1>Unable to open this room</h1><p>{workspace.error}</p><button className="primary auth-submit" onClick={() => navigate("/")}>Back to workspaces <ArrowRight size={15} /></button></div></main>;

  return <div className="ide-shell">
    <header className="topbar">
      <a className="brand compact" href="/"><span className="brand-mark"><Code2 size={16} /></span>collab<span>code</span></a>
      <div className="crumb"><span className="crumb-divider">/</span><span className="crumb-project">Untitled workspace</span><span className="room-chip">{roomId}</span></div>
      <div className="top-actions">
        <div className={`connection ${workspace.connected ? "is-connected" : "is-offline"}`}>{workspace.connected ? <Wifi size={14} /> : <WifiOff size={14} />}<span>{workspace.connected ? "Connected" : "Reconnecting"}</span></div>
        <div className="avatar-stack" title={`${workspace.users.length} people in this room`}>
          {workspace.users.slice(0, 3).map((user, index) => <span className="avatar" style={{ background: user.color, zIndex: 4 - index }} key={`${user.name}-${index}`}>{user.name.slice(0, 1).toUpperCase()}</span>)}
          <span className="people-count"><Users size={12} /> {workspace.users.length}</span>
        </div>
        <button className="share-button" onClick={shareRoom}>{copied ? "Link copied" : "Share room"}<ArrowRight size={13} /></button>
      </div>
    </header>

    <div className="workspace-grid">
      <aside className="activitybar">
        <button className={tab === "Explorer" ? "activity active" : "activity"} title="Explorer" onClick={() => setTab("Explorer")}><Folder size={19} /></button>
        <button className={tab === "Collaboration" ? "activity active" : "activity"} title="Collaboration" onClick={() => setTab("Collaboration")}><Users size={19} /></button>
        <div className="activity-spacer" />
        <div className="activity-logo"><Code2 size={17} /></div>
      </aside>

      <aside className="sidebar">
        <div className="side-heading"><span>{tab === "Explorer" ? "EXPLORER" : "COLLABORATION"}</span><button className="icon-button" title="New file" onClick={createFile}><FilePlus2 size={15} /></button></div>
        {tab === "Explorer" ? <>
          <div className="project-row"><Folder size={14} fill="currentColor" /><b>COLLAB WORKSPACE</b><button className="icon-button tiny" onClick={createFile}><FilePlus2 size={14} /></button></div>
          <div className="file-list">
            {workspace.filePaths.map((path) => <div key={path} className={`file-row ${activeFile === path ? "selected" : ""}`} onClick={() => setActiveFile(path)}>
              <span className={`file-dot ${path.endsWith(".ts") ? "ts" : path.endsWith(".json") ? "json" : "md"}`}>{path.endsWith(".ts") ? "TS" : path.endsWith(".json") ? "{}" : "M"}</span><span>{path}</span>
              {workspace.filePaths.length > 1 && <button className="delete-file" title={`Delete ${path}`} onClick={(event) => { event.stopPropagation(); if (window.confirm(`Delete ${path}?`)) workspace.deleteFile(path); }}>×</button>}
            </div>)}
          </div>
        </> : <div className="collab-panel">
          <p className="section-label">IN THIS ROOM <span>{workspace.users.length}</span></p>
          {workspace.users.map((user, index) => <div className="person-row" key={`${user.name}-${index}`}><span className="avatar small-avatar" style={{ background: user.color }}>{user.name.slice(0, 1).toUpperCase()}</span><span>{user.name}{index === 0 ? <small> · you</small> : null}</span><i className="online-dot" /></div>)}
          <div className="access-management">
            <p className="section-label">WORKSPACE ACCESS <span>{canManageAccess ? accessMembers.length : "—"}</span></p>
            {accessError && <p className="access-error">{accessError}</p>}
            {canManageAccess ? accessMembers.map((member) => <div className="access-member-row" key={member.id}>
              <span className="access-member-info"><b>{member.name}</b><small>{member.email} · {member.role}</small></span>
              {member.role !== "owner" && <button className="remove-member" title={`Remove ${member.name}`} aria-label={`Remove ${member.name}`} onClick={() => void removeMember(member)}>Remove</button>}
            </div>) : <p className="access-hint">Only the workspace owner can manage invited accounts.</p>}
            {canManageAccess && <button className="invite-wide" onClick={inviteMember}>Invite a registered member</button>}
          </div>
        </div>}
        <div className="sidebar-bottom"><div className="bottom-user"><span className="avatar small-avatar self-avatar">{workspace.user.name.slice(0, 1).toUpperCase()}</span><span className="user-meta"><b>{workspace.user.name}</b><small>Free workspace</small></span><button className="icon-button" title="Change display name" onClick={workspace.changeName}>···</button></div></div>
      </aside>

      <main className="editor-area">
        <div className="editor-tabs"><div className="editor-tab"><span className="tab-file-icon">{activeFile.endsWith(".ts") ? "TS" : activeFile.endsWith(".json") ? "{}" : "M"}</span>{activeFile}<span className="tab-dot" /></div><div className="editor-tab-actions"><span className="saving-indicator"><span /> All changes synced</span><button className="preview-run-button" onClick={runWebsitePreview} disabled={!workspace.synced} title="Run the shared HTML website in a sandboxed preview"><Play size={12} /> Run preview</button><button className="icon-button" title="Open collaboration panel" onClick={() => { setTab("Collaboration"); setChatOpen(!chatOpen); }}><Users size={15} /></button></div></div>
        <div className="editor-breadcrumb"><span>workspace</span><span>/</span><b>{activeFile}</b></div>
        <div className="monaco-wrap">
          {previewOpen ? <section className="website-preview">
            <div className="preview-toolbar"><div><b>Website preview</b><span>HTML · CSS · JavaScript · sandboxed</span></div><button className="preview-editor-button" onClick={() => setPreviewOpen(false)}><Code2 size={13} /> Back to editor</button></div>
            {previewHtml ? <iframe key={previewRunId} ref={previewFrameRef} className="preview-frame" title="Shared website preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={previewHtml} /> : <div className="preview-empty"><div className="preview-empty-mark"><Code2 size={18} /></div><h2>{previewNeedsStarter ? "Start with a website" : "Preview unavailable"}</h2><p>{previewNeedsStarter ? <>The app runs <code>index.html</code> and loads its linked CSS and JavaScript files from the same shared workspace.</> : previewWarnings.join(" ")}</p>{previewNeedsStarter && <><div className="preview-file-examples"><span>index.html</span><span>styles.css</span><span>script.js</span></div><button className="primary preview-starter-button" onClick={createWebsiteStarter}>Create a sample website <ArrowRight size={13} /></button></>}</div>}
            {(previewWarnings.length > 0 || previewErrors.length > 0) && <div className="preview-console" role="status">
              {previewWarnings.map((warning, index) => <div className="preview-warning" key={`warning-${index}`}>{warning}</div>)}
              {previewErrors.map((error, index) => <div className="preview-error" key={`error-${index}`}>JavaScript: {error}</div>)}
            </div>}
          </section> : activeText && workspace.synced ? <CollaborativeEditor key={activeFile} path={activeFile} text={activeText} awareness={workspace.awareness} /> : <div className="loading-editor"><div className="loader" />Connecting to shared workspace…</div>}
        </div>
        <div className="bottom-panel">
          <div className="panel-tabs"><button className="panel-tab active"><span className="terminal-glyph">&gt;_</span> OUTPUT</button><button className="panel-tab" onClick={() => setChatOpen(!chatOpen)}>COLLABORATION</button><span className="panel-status"><span className="status-green" /> WORKSPACE READY</span></div>
          {chatOpen ? <div className="panel-content"><div className="panel-message"><Sparkles size={15} /><span>Live editing is on. Only invited accounts can open this room.</span></div><button className="panel-action" onClick={inviteMember}>Invite a teammate <ArrowRight size={13} /></button></div> : <div className="panel-content"><div className="terminal-line"><span className="terminal-prompt">›</span><span>{previewOpen ? "Website preview is isolated in a browser sandbox." : "CollabCode Phase 4 ready"}</span></div><div className="terminal-hint">{previewOpen ? "Edits sync live. Press Run preview again to refresh the page." : "Use Run preview for a shared HTML, CSS, and JavaScript website. Server-side code execution is not enabled."}</div></div>}
        </div>
      </main>
      <aside className="right-rail">
        <div className="rail-heading"><span>LIVE ROOM</span><span className="live-pill"><Radio size={11} /> LIVE</span></div>
        <div className="room-status"><div className="pulse-icon"><Users size={19} /></div><b>{workspace.users.length} {workspace.users.length === 1 ? "person" : "people"} here</b><p>Everyone in this room can edit these files together.</p></div>
        <div className="rail-divider" />
        <div className="rail-section-title">COLLABORATORS <span>{workspace.users.length}</span></div>
        <div className="collaborators">
          {workspace.users.map((user, index) => <div className="collaborator" key={`${user.name}-${index}`}><span className="avatar small-avatar" style={{ background: user.color }}>{user.name.slice(0, 1).toUpperCase()}</span><span className="collaborator-name">{user.name}<small>{index === 0 ? "You" : "Editing"}</small></span><span className="online-dot" /></div>)}
          {canManageAccess && <button className="add-collaborator" onClick={inviteMember}><span>+</span> Invite by email</button>}
        </div>
        <div className="rail-divider" />
        <div className="phase-card"><div className="phase-card-icon"><Sparkles size={15} /></div><b>Build in the open</b><p>Share this room and work through the same code with your team.</p><button onClick={shareRoom}>Copy room link <ArrowRight size={12} /></button></div>
        <div className="rail-foot"><span><Wifi size={12} /> Live sync on</span><span>Yjs · Socket.IO</span></div>
      </aside>
    </div>
    <footer className="statusbar"><div><span className="status-green" /> Ready</div><div><span>Room: {roomId}</span><span>UTF-8</span><span>{previewOpen ? "HTML preview" : "TypeScript"}</span><span>Phase 4 prototype</span></div></footer>
  </div>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <main className="auth-loading"><div className="loader" />Checking your account…</main>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <main className="auth-loading"><div className="loader" />Checking your account…</main>;
  if (user) return <Navigate to="/" replace />;
  return <AuthPage />;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginRoute />} />
    <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
    <Route path="/room/:roomId" element={<RequireAuth><Room /></RequireAuth>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
