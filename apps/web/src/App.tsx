import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Archive, ArrowRight, Code2, Download, FilePlus2, Folder, LockKeyhole, MessageSquare, Play, Plus, Radio, Search, ShoppingBag, Sparkles, Upload, Users, Wifi, WifiOff, X } from "lucide-react";
import { strToU8, zipSync } from "fflate";
import { DEFAULT_ROOM_ID, isSafeFilePath } from "@collab/shared";
import { AuthPage } from "./AuthPage";
import { apiRequest, useAuth } from "./auth";
import { useWorkspace } from "./useWorkspace";
import { CollaborativeEditor, type ReviewSelection } from "./CollaborativeEditor";
import { buildWebsitePreview, WEBSITE_STARTER_FILES } from "./websitePreview";
import { AiAssistant } from "./AiAssistant";
import { ReviewPanel } from "./ReviewPanel";

function Home() {
  const navigate = useNavigate();
  const { user, logout, logoutEverywhere } = useAuth();
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [workspaceError, setWorkspaceError] = useState("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [projectSearch, setProjectSearch] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState<"typescript" | "ecommerce" | null>(null);
  const revokeSessions = async () => {
    if (!window.confirm("Sign out this account from every browser and device?")) return;
    try { await logoutEverywhere(); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Could not revoke sessions."); }
  };
  const loadWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true);
    setWorkspaceError("");
    try {
      const response = await apiRequest("/api/workspaces");
      const result = await response.json() as { workspaces?: Array<{ id: string; name: string; role: string }>; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load workspaces.");
      setWorkspaces(result.workspaces || []);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Could not load workspaces.");
    } finally {
      setLoadingWorkspaces(false);
    }
  }, []);
  useEffect(() => { void loadWorkspaces(); }, [loadWorkspaces]);
  const createWorkspace = async (template: "typescript" | "ecommerce") => {
    if (creatingTemplate) return;
    setCreatingTemplate(template);
    setWorkspaceError("");
    try {
      const response = await apiRequest("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ template, name: template === "ecommerce" ? "E-commerce storefront" : "Untitled workspace" })
      });
      const result = await response.json() as { workspace?: { id: string; name: string; role: string }; error?: string };
      if (!response.ok || !result.workspace) throw new Error(result.error || "Could not create the project. Please try again.");
      setWorkspaces((current) => [result.workspace!, ...current.filter((workspace) => workspace.id !== result.workspace!.id)]);
      navigate(`/room/${encodeURIComponent(result.workspace.id)}${template === "ecommerce" ? "?preview=1" : ""}`);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Could not create the project. Please try again.");
    } finally {
      setCreatingTemplate(null);
    }
  };
  const normalizedSearch = projectSearch.trim().toLowerCase();
  const visibleWorkspaces = workspaces.filter((workspace) => !normalizedSearch || `${workspace.name} ${workspace.id} ${workspace.role}`.toLowerCase().includes(normalizedSearch));
  return <main className="landing">
    <nav className="landing-nav"><div className="landing-brand-area"><div className="brand"><span className="brand-mark"><Code2 size={17} /></span>collab<span>code</span></div><span className="landing-nav-divider" /><span className="landing-tab-active"><Folder size={14} /> Projects</span></div><div className="landing-account"><span>{user?.email}</span><button className="quiet-link signout-button" onClick={() => void revokeSessions()}>Sign out everywhere</button><button className="quiet-link signout-button" onClick={() => void logout()}>Sign out</button></div></nav>
    <section className="projects-intro">
      <div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR COLLABCODE PROJECTS</div><h1>Your projects.<br /><em>Made together.</em></h1><p className="hero-copy">Open a workspace you own or were invited to, or start a new project from a ready-to-edit template.</p></div>
      <button className="primary project-create-button" onClick={() => void createWorkspace("typescript")} disabled={Boolean(creatingTemplate)}><Plus size={15} />{creatingTemplate === "typescript" ? "Creating…" : "New code workspace"}</button>
    </section>
    <section className="project-template-card" aria-labelledby="store-template-title">
      <div className="template-copy"><div className="template-tag"><ShoppingBag size={12} /> STARTER PROJECT <span>·</span> HTML, CSS &amp; JAVASCRIPT</div><h2 id="store-template-title">A storefront, ready<br />for your ideas.</h2><p>Explore a polished little shop with product details, a working demo bag, and a live preview. Make it your own, then invite a teammate to build with you.</p><button className="primary template-button" onClick={() => void createWorkspace("ecommerce")} disabled={Boolean(creatingTemplate)}>{creatingTemplate === "ecommerce" ? "Creating storefront…" : "Create e-commerce project"}<ArrowRight size={14} /></button><small>Creates a private copy in your projects. Checkout is a front-end demo.</small></div>
      <div className="template-art" aria-hidden="true"><div className="template-art-top"><span>FORM &amp; FIELD</span><span>THE EVERYDAY EDIT</span></div><div className="template-art-title">Useful things.<br /><em>Beautifully made.</em></div><div className="template-products"><div className="template-product template-product-one"><span>01</span><i /></div><div className="template-product template-product-two"><span>02</span><i /></div><div className="template-product template-product-three"><span>03</span><i /></div></div><div className="template-art-bottom">MADE FOR DAILY LIFE <span>·</span> LESS, BUT BETTER</div></div>
    </section>
    <section className="projects-section" aria-labelledby="projects-heading">
      <div className="projects-section-heading"><div><b id="projects-heading">All projects</b><span>Workspaces you own and projects shared with you</span></div><label className="project-search"><Search size={14} /><input type="search" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects" aria-label="Search projects" />{projectSearch && <button onClick={() => setProjectSearch("")} aria-label="Clear project search"><X size={13} /></button>}</label></div>
      {workspaceError && <div className="workspace-list-error" role="alert"><span>{workspaceError}</span><button onClick={() => void loadWorkspaces()}>Try again</button></div>}
      {loadingWorkspaces ? <p className="projects-empty" role="status">Loading your projects…</p> : visibleWorkspaces.length ? <div className="project-cards">{visibleWorkspaces.map((workspace) => <button className="project-card" key={workspace.id} onClick={() => navigate(`/room/${encodeURIComponent(workspace.id)}`)}><span className="project-card-icon"><Folder size={17} /></span><span className="project-card-info"><b>{workspace.name}</b><small>{workspace.id}</small></span><span className={`project-role ${workspace.role === "owner" ? "project-role-owner" : ""}`}>{workspace.role}</span><ArrowRight size={15} /></button>)}</div> : !workspaceError && <div className="projects-empty">{normalizedSearch ? <><Search size={19} /><b>No matching projects</b><span>Try a different project name or room ID.</span></> : <><Folder size={19} /><b>No projects yet</b><span>Create a blank workspace or start with the storefront template above.</span><button className="primary" onClick={() => void createWorkspace("typescript")} disabled={Boolean(creatingTemplate)}>Create your first project <ArrowRight size={13} /></button></>}</div>}
    </section>
    <footer className="landing-footer">Real-time shared editing <span>·</span> Private workspaces <span>·</span> Invite your team</footer>
  </main>;
}

function Room() {
  const { roomId = DEFAULT_ROOM_ID } = useParams();
  const { user: authenticatedUser } = useAuth();
  const navigate = useNavigate();
  const workspace = useWorkspace(roomId, authenticatedUser?.name || "CollabCode user");
  const [accessMembers, setAccessMembers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [canManageAccess, setCanManageAccess] = useState(false);
  const [currentRole, setCurrentRole] = useState<"owner" | "editor" | "viewer">("viewer");
  const [workspaceName, setWorkspaceName] = useState("Untitled workspace");
  const [accessError, setAccessError] = useState("");
  const [activeFile, setActiveFile] = useState("src/index.ts");
  const [editorSelection, setEditorSelection] = useState("");
  const [reviewSelection, setReviewSelection] = useState<ReviewSelection | null>(null);
  const [copied, setCopied] = useState(false);
  const [fileNotice, setFileNotice] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [quickSelection, setQuickSelection] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(() => new URLSearchParams(window.location.search).get("invite") === "1");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [tab, setTab] = useState("Explorer");
  const [chatOpen, setChatOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMounted, setAiMounted] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [previewRunId, setPreviewRunId] = useState(0);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const samplePreviewStarted = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickSearchInputRef = useRef<HTMLInputElement>(null);
  const previewNeedsStarter = previewWarnings.some((warning) => warning.startsWith("Add index.html"));
  const refreshAccess = useCallback(async () => {
    try {
      const response = await apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/members`);
      const result = await response.json() as { members?: Array<{ id: string; name: string; email: string; role: string }>; canManage?: boolean; currentRole?: "owner" | "editor" | "viewer"; workspaceName?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load workspace access.");
      setAccessMembers(result.members || []);
      setCanManageAccess(Boolean(result.canManage));
      setCurrentRole(result.currentRole || "viewer");
      if (result.workspaceName) setWorkspaceName(result.workspaceName);
      setAccessError("");
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Could not load workspace access.");
    }
  }, [roomId]);
  // A new room is created by the authenticated Socket.IO join. Wait for its
  // initial document sync before asking the access endpoint for its members.
  useEffect(() => { if (workspace.synced) void refreshAccess(); }, [workspace.synced, refreshAccess]);
  useEffect(() => {
    if (workspace.filePaths.length && !workspace.filePaths.includes(activeFile)) {
      setActiveFile(workspace.filePaths.includes("index.html") ? "index.html" : workspace.filePaths[0]);
    }
  }, [workspace.filePaths, activeFile]);
  useEffect(() => { setEditorSelection(""); setReviewSelection(null); }, [activeFile]);
  useEffect(() => {
    if (quickOpen) requestAnimationFrame(() => quickSearchInputRef.current?.focus());
  }, [quickOpen]);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setQuickSearch("");
        setQuickSelection(0);
        setQuickOpen(true);
      }
      if (event.key === "Escape") {
        setQuickOpen(false);
        setInviteOpen(false);
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const createFile = () => {
    if (currentRole === "viewer") return;
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
  const inviteMember = () => {
    if (!canManageAccess) return;
    setInviteEmail("");
    setInviteRole("editor");
    setInviteError("");
    setInviteFeedback("");
    setInviteOpen(true);
  };
  const submitInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageAccess || !inviteEmail.trim() || inviteBusy) return;
    setInviteBusy(true);
    setInviteError("");
    try {
      const response = await apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/members`, { method: "POST", body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }) });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not invite that account.");
      await refreshAccess();
      localStorage.setItem("collabcode-invite-completed", "true");
      setInviteFeedback(result.message || "Workspace access granted. Copy the room link and send it to your teammate.");
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Could not invite that account.");
    } finally {
      setInviteBusy(false);
    }
  };
  const changeMemberRole = async (member: { id: string; name: string }, role: "editor" | "viewer") => {
    if (!canManageAccess) return;
    try {
      const response = await apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/members/${encodeURIComponent(member.id)}`, { method: "PATCH", body: JSON.stringify({ role }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not change member role.");
      await refreshAccess();
    } catch (error) { window.alert(error instanceof Error ? error.message : "Could not change member role."); }
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
  const quickMatches = workspace.filePaths.filter((path) => path.toLowerCase().includes(quickSearch.trim().toLowerCase())).slice(0, 30);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadCurrentFile = () => {
    const text = workspace.files.get(activeFile)?.toString();
    if (text === undefined) return;
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), activeFile.split("/").pop() || "workspace-file.txt");
  };
  const downloadWorkspaceZip = () => {
    if (!workspace.filePaths.length) return;
    const files = Object.fromEntries(workspace.filePaths.map((path) => [path, strToU8(workspace.files.get(path)?.toString() || "")]));
    const archive = zipSync(files, { level: 6 });
    downloadBlob(new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" }), `${roomId}-workspace.zip`);
  };
  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (!selectedFiles.length) return;
    const occupied = new Set(workspace.filePaths);
    const additions: Array<{ path: string; contents: string }> = [];
    const skipped: string[] = [];
    for (const file of selectedFiles) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const path = relativePath.replace(/\\/g, "/").split("/")
        .map((part) => part.normalize("NFKC").replace(/\s+/g, "_").replace(/[^\w.-]/g, "_").replace(/^\.+/, "").replace(/\.+$/, ""))
        .filter(Boolean).join("/");
      if (!isSafeFilePath(path)) { skipped.push(`${file.name}: unsafe file name`); continue; }
      if (file.size > 100_000) { skipped.push(`${path}: over 100 KB`); continue; }
      if (occupied.has(path)) { skipped.push(`${path}: already exists`); continue; }
      if (workspace.filePaths.length + additions.length >= 100) { skipped.push(`${path}: workspace file limit reached`); continue; }
      const contents = await file.text();
      if (contents.includes("\u0000") || new TextEncoder().encode(contents).byteLength > 100_000) { skipped.push(`${path}: not a supported text file`); continue; }
      occupied.add(path);
      additions.push({ path, contents });
    }
    for (const file of additions) workspace.createFile(file.path, file.contents);
    if (additions.length) setActiveFile(additions[0].path);
    setFileNotice(`${additions.length} file${additions.length === 1 ? "" : "s"} added to the shared room${skipped.length ? ` · ${skipped.length} skipped (${skipped.slice(0, 2).join("; ")}${skipped.length > 2 ? "; …" : ""})` : ""}.`);
  };
  const selectFile = (path: string) => {
    setActiveFile(path);
    setQuickOpen(false);
    setMobileSidebarOpen(false);
  };

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

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("preview") !== "1" || !workspace.synced || !workspace.filePaths.includes("index.html") || samplePreviewStarted.current) return;
    samplePreviewStarted.current = true;
    setActiveFile("index.html");
    runWebsitePreview();
  }, [workspace.synced, workspace.filePaths]);

  const createWebsiteStarter = () => {
    if (currentRole === "viewer") return;
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
      <div className="crumb"><span className="crumb-divider">/</span><span className="crumb-project">{workspaceName}</span><span className="room-chip">{roomId}</span></div>
      <div className="top-actions">
        <div className={`connection ${!workspace.connected ? "is-offline" : workspace.synced ? "is-connected" : "is-syncing"}`} aria-label={!workspace.connected ? "Connection lost; reconnecting" : workspace.synced ? "Connected and all changes synced" : "Connected; loading shared workspace"} aria-live="polite" title={!workspace.connected ? "Trying to reconnect. Your local changes will sync when the connection returns." : workspace.synced ? "All changes are synced with the room." : "Connected; loading the shared workspace."}>
          {workspace.connected ? <Wifi size={14} /> : <WifiOff size={14} />}<span>{!workspace.connected ? workspace.error ? "Connection issue · retrying" : "Connecting…" : workspace.synced ? "Live · synced" : "Loading workspace…"}</span>
        </div>
        <div className="avatar-stack" title={`${workspace.users.length} people in this room`}>
          {workspace.users.slice(0, 3).map((user, index) => <span className="avatar" style={{ background: user.color, zIndex: 4 - index }} key={`${user.name}-${index}`}>{user.name.slice(0, 1).toUpperCase()}</span>)}
          <span className="people-count"><Users size={12} /> {workspace.users.length}</span>
        </div>
        <button className="share-button" onClick={shareRoom}>{copied ? "Link copied" : "Share room"}<ArrowRight size={13} /></button>
      </div>
    </header>

    <div className="workspace-grid">
      <aside className="activitybar">
        <button className={tab === "Explorer" ? "activity active" : "activity"} aria-label="Open file explorer" title="Explorer" onClick={() => { setMobileSidebarOpen((open) => tab === "Explorer" ? !open : true); setTab("Explorer"); }}><Folder size={19} /></button>
        <button className={tab === "Collaboration" ? "activity active" : "activity"} aria-label="Open collaboration and invitations" title="Collaboration" onClick={() => { setTab("Collaboration"); setMobileSidebarOpen(true); }}><Users size={19} /></button>
        <button className={tab === "Review" ? "activity active" : "activity"} aria-label="Open review and history" title="Review and history" onClick={() => { setTab("Review"); setMobileSidebarOpen(true); }}><MessageSquare size={18} /></button>
        <div className="activity-spacer" />
        <div className="activity-logo"><Code2 size={17} /></div>
      </aside>

      <aside className={`sidebar ${mobileSidebarOpen ? "mobile-open" : ""}`}>
        <div className="side-heading"><span>{tab === "Explorer" ? "EXPLORER" : tab === "Review" ? "REVIEW & HISTORY" : "COLLABORATION"}</span><button className="mobile-close icon-button" aria-label="Close side panel" onClick={() => setMobileSidebarOpen(false)}><X size={15} /></button></div>
        {tab === "Explorer" ? <>
          <div className="project-row"><Folder size={14} fill="currentColor" /><b>COLLAB WORKSPACE</b></div>
          <div className="file-tools" role="group" aria-label="Workspace file actions">
            <button className="icon-button" aria-label="New file" title="New file" disabled={currentRole === "viewer"} onClick={createFile}><FilePlus2 size={14} /></button>
            <button className="icon-button" aria-label="Upload text files" title="Upload text/code files (up to 100 KB each)" disabled={currentRole === "viewer" || !workspace.synced} onClick={() => fileInputRef.current?.click()}><Upload size={14} /></button>
            <button className="icon-button" aria-label="Download selected file" title="Download selected file" disabled={!workspace.files.has(activeFile)} onClick={downloadCurrentFile}><Download size={14} /></button>
            <button className="icon-button" aria-label="Download workspace ZIP" title="Download all workspace files as ZIP" disabled={!workspace.filePaths.length} onClick={downloadWorkspaceZip}><Archive size={14} /></button>
            <button className="icon-button" aria-label="Find a file" title="Find a file (Ctrl+P)" onClick={() => { setQuickSearch(""); setQuickSelection(0); setQuickOpen(true); }}><Search size={14} /></button>
            <input ref={fileInputRef} className="visually-hidden" type="file" multiple accept="text/*,.html,.htm,.css,.js,.jsx,.ts,.tsx,.json,.xml,.svg,.yml,.yaml,.sql,.sh,.c,.cpp,.h,.hpp,.go,.rs,.rb,.php,.ipynb" onChange={(event) => void uploadFiles(event)} />
          </div>
          {fileNotice && <p className="file-notice" role="status">{fileNotice}</p>}
          <div className="file-list">
            {workspace.filePaths.map((path) => <div key={path} className={`file-row ${activeFile === path ? "selected" : ""}`}>
              <button type="button" className="file-open" aria-current={activeFile === path ? "page" : undefined} onClick={() => selectFile(path)}><span className={`file-dot ${path.endsWith(".ts") ? "ts" : path.endsWith(".json") ? "json" : "md"}`}>{path.endsWith(".ts") ? "TS" : path.endsWith(".json") ? "{}" : "M"}</span><span>{path}</span></button>
              {currentRole !== "viewer" && workspace.filePaths.length > 1 && <button className="delete-file" aria-label={`Delete ${path}`} title={`Delete ${path}`} onClick={() => { if (window.confirm(`Delete ${path}?`)) workspace.deleteFile(path); }}>×</button>}
            </div>)}
            {!workspace.filePaths.length && <div className="file-empty"><Folder size={19} /><b>This room has no files yet</b><span>Start with a website or create a blank file.</span><button onClick={createWebsiteStarter}>Create sample website</button><button onClick={createFile} disabled={currentRole === "viewer"}>Create a blank file</button></div>}
          </div>
        </> : tab === "Collaboration" ? <div className="collab-panel">
          <p className="section-label">IN THIS ROOM <span>{workspace.users.length}</span></p>
          {workspace.users.map((user, index) => <div className="person-row" key={`${user.name}-${index}`}><span className="avatar small-avatar" style={{ background: user.color }}>{user.name.slice(0, 1).toUpperCase()}</span><span>{user.name}{index === 0 ? <small> · you</small> : null}</span><i className="online-dot" /></div>)}
          <div className="access-management">
            <p className="section-label">WORKSPACE ACCESS <span>{canManageAccess ? accessMembers.length : "—"}</span></p>
            {accessError && <p className="access-error">{accessError}</p>}
            {canManageAccess ? accessMembers.map((member) => <div className="access-member-row" key={member.id}>
              <span className="access-member-info"><b>{member.name}</b><small>{member.email}</small></span>
              {member.role !== "owner" && <div className="access-member-actions"><select aria-label={`Role for ${member.name}`} value={member.role} onChange={(event) => void changeMemberRole(member, event.target.value as "editor" | "viewer")}><option value="editor">Editor</option><option value="viewer">Viewer</option></select><button className="remove-member" title={`Remove ${member.name}`} aria-label={`Remove ${member.name}`} onClick={() => void removeMember(member)}>Remove</button></div>}
            </div>) : <p className="access-hint">Only the workspace owner can manage invited accounts.</p>}
            {canManageAccess && <><p className="access-hint">Your teammate must have an account. Add their email, then share this room link.</p><button className="invite-wide" onClick={inviteMember}>Invite a registered member</button></>}
          </div>
        </div> : <ReviewPanel roomId={roomId} filePath={activeFile} selection={reviewSelection} userId={authenticatedUser?.id || ""} canEdit={currentRole !== "viewer"} canManage={canManageAccess} />}
        <div className="sidebar-bottom"><div className="bottom-user"><span className="avatar small-avatar self-avatar">{workspace.user.name.slice(0, 1).toUpperCase()}</span><span className="user-meta"><b>{workspace.user.name}</b><small>{currentRole} access</small></span><button className="icon-button" title="Change display name" onClick={workspace.changeName}>···</button></div></div>
      </aside>

      <main className="editor-area">
        <div className="editor-tabs"><div className="editor-tab"><span className="tab-file-icon">{activeFile.endsWith(".ts") ? "TS" : activeFile.endsWith(".json") ? "{}" : "M"}</span>{activeFile}<span className="tab-dot" /></div><div className="editor-tab-actions"><span className="saving-indicator"><span /> All changes synced</span><button className="preview-run-button" onClick={() => { setAiMounted(true); setAiOpen((open) => !open); }} title="Open AI assistant"><Sparkles size={12} /> AI</button><button className="preview-run-button" onClick={runWebsitePreview} disabled={!workspace.synced} title="Run the shared HTML website in a sandboxed preview"><Play size={12} /> Run preview</button><button className="icon-button" title="Open collaboration panel" onClick={() => { setTab("Collaboration"); setChatOpen(!chatOpen); }}><Users size={15} /></button></div></div>
        <div className="editor-breadcrumb"><span>workspace</span><span>/</span><b>{activeFile}</b></div>
        <div className="monaco-wrap">
          {previewOpen ? <section className="website-preview">
            <div className="preview-toolbar"><div><b>Website preview</b><span>HTML · CSS · JavaScript · sandboxed</span></div><button className="preview-editor-button" onClick={() => setPreviewOpen(false)}><Code2 size={13} /> Back to editor</button></div>
            {previewHtml ? <iframe key={previewRunId} ref={previewFrameRef} className="preview-frame" title="Shared website preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={previewHtml} /> : <div className="preview-empty"><div className="preview-empty-mark"><Code2 size={18} /></div><h2>{previewNeedsStarter ? "Start with a website" : "Preview unavailable"}</h2><p>{previewNeedsStarter ? <>The app runs <code>index.html</code> and loads its linked CSS and JavaScript files from the same shared workspace.</> : previewWarnings.join(" ")}</p>{previewNeedsStarter && <><div className="preview-file-examples"><span>index.html</span><span>styles.css</span><span>script.js</span></div><button className="primary preview-starter-button" onClick={createWebsiteStarter}>Create a sample website <ArrowRight size={13} /></button></>}</div>}
            {(previewWarnings.length > 0 || previewErrors.length > 0) && <div className="preview-console" role="status">
              {previewWarnings.map((warning, index) => <div className="preview-warning" key={`warning-${index}`}>{warning}</div>)}
              {previewErrors.map((error, index) => <div className="preview-error" key={`error-${index}`}>JavaScript: {error}</div>)}
            </div>}
          </section> : activeText && workspace.synced ? <CollaborativeEditor key={activeFile} path={activeFile} text={activeText} awareness={workspace.awareness} readOnly={currentRole === "viewer"} onSelectionChange={setEditorSelection} onReviewSelectionChange={setReviewSelection} /> : <div className="loading-editor"><div className="loader" />Connecting to shared workspace…</div>}
        </div>
        <div className="bottom-panel">
          <div className="panel-tabs"><button className="panel-tab active"><span className="terminal-glyph">&gt;_</span> OUTPUT</button><button className="panel-tab" onClick={() => setChatOpen(!chatOpen)}>COLLABORATION</button><span className="panel-status" role="status" aria-live="polite"><span className={!workspace.connected ? "status-amber" : workspace.synced ? "status-green" : "status-amber"} />{!workspace.connected ? "RECONNECTING" : workspace.synced ? "ALL CHANGES SYNCED" : "SYNCING WORKSPACE"}</span></div>
          {chatOpen ? <div className="panel-content"><div className="panel-message"><Sparkles size={15} /><span>Live editing is on. Only invited accounts can open this room.</span></div>{canManageAccess ? <button className="panel-action" onClick={inviteMember}>Invite a teammate <ArrowRight size={13} /></button> : <div className="terminal-hint">Only the workspace owner can invite teammates.</div>}</div> : <div className="panel-content"><div className="terminal-line"><span className="terminal-prompt">›</span><span>{previewOpen ? "Website preview is isolated in a browser sandbox." : workspace.synced ? "Workspace is ready to edit." : "Connecting to the shared workspace…"}</span></div><div className="terminal-hint">{previewOpen ? "Edits sync live. Press Run preview again to refresh the page." : "Use Run preview for a shared HTML, CSS, and JavaScript website. Your edits sync to collaborators automatically."}</div></div>}
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
    {aiMounted && <AiAssistant roomId={roomId} activePath={activeFile} selection={editorSelection} open={aiOpen} readFiles={() => Object.fromEntries([...workspace.files.entries()].map(([path, text]) => [path, text.toString()]))} onClose={() => setAiOpen(false)} />}
    {quickOpen && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuickOpen(false); }}>
      <section className="quick-open-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-open-title">
        <div className="quick-open-title"><div><Search size={16} /><b id="quick-open-title">Open a file</b><small>Type part of a file name. Press Ctrl+P anytime.</small></div><button className="icon-button" aria-label="Close file search" onClick={() => setQuickOpen(false)}><X size={16} /></button></div>
        <input ref={quickSearchInputRef} type="search" value={quickSearch} placeholder="Search workspace files…" aria-label="Search workspace files" onChange={(event) => { setQuickSearch(event.target.value); setQuickSelection(0); }} onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setQuickSelection((index) => Math.min(index + 1, Math.max(0, quickMatches.length - 1))); }
          if (event.key === "ArrowUp") { event.preventDefault(); setQuickSelection((index) => Math.max(0, index - 1)); }
          if (event.key === "Enter" && quickMatches[quickSelection]) { event.preventDefault(); selectFile(quickMatches[quickSelection]); }
        }} />
        <div className="quick-open-results" role="listbox" aria-label="Matching files">
          {quickMatches.map((path, index) => <button key={path} id={`quick-file-${index}`} role="option" aria-selected={index === quickSelection} className={index === quickSelection ? "quick-file selected" : "quick-file"} onMouseEnter={() => setQuickSelection(index)} onClick={() => selectFile(path)}><span className="file-dot">{path.split(".").pop()?.toUpperCase().slice(0, 3)}</span>{path}<ArrowRight size={13} /></button>)}
          {!quickMatches.length && <p className="quick-open-empty">No files match “{quickSearch}”. Try another name or create a file.</p>}
        </div>
      </section>
    </div>}
    {inviteOpen && canManageAccess && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setInviteOpen(false); }}>
      <section className="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title">
        <div className="invite-dialog-heading"><div className="invite-dialog-icon"><Users size={17} /></div><button className="icon-button" aria-label="Close invitation dialog" onClick={() => setInviteOpen(false)}><X size={16} /></button></div>
        <p className="auth-eyebrow">WORKSPACE ACCESS</p><h2 id="invite-title">Invite a teammate</h2>
        <p className="invite-help">Add their CollabCode account email, then send them this room link. They need to sign up before you can add them.</p>
        <form onSubmit={(event) => void submitInvite(event)}>
          <label htmlFor="invite-email">Teammate’s account email</label>
          <input id="invite-email" autoFocus type="email" autoComplete="email" required maxLength={254} value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" />
          <label className="invite-role-label" htmlFor="invite-role">Access level</label>
          <select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")}><option value="editor">Editor · can edit files</option><option value="viewer">Viewer · can read files</option></select>
          {inviteError && <p className="dialog-error" role="alert">{inviteError}</p>}
          {inviteFeedback && <p className="dialog-success" role="status">{inviteFeedback}</p>}
          {!inviteFeedback && <button className="primary invite-submit" type="submit" disabled={inviteBusy || !inviteEmail.trim()}>{inviteBusy ? "Adding access…" : "Add teammate"}<ArrowRight size={14} /></button>}
        </form>
        {inviteFeedback && <div className="invite-dialog-actions"><button className="primary" onClick={() => void shareRoom()}>{copied ? "Link copied" : "Copy room link"}<ArrowRight size={14} /></button><button className="quiet-link" onClick={() => setInviteOpen(false)}>Done</button></div>}
      </section>
    </div>}
    <footer className="statusbar"><div><span className={workspace.connected ? "status-green" : "status-amber"} />{!workspace.connected ? "Reconnecting" : workspace.synced ? "Ready" : "Syncing"}</div><div><span>Room: {roomId}</span><span>UTF-8</span><span>{previewOpen ? "HTML preview" : activeFile.split(".").pop()?.toUpperCase() || "Text"}</span><span>CollabCode</span></div></footer>
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
