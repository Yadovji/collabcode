import { useEffect, useMemo, useRef, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { apiRequest } from "./auth";
import { isSafeFilePath } from "@collab/shared";

type Mode = "ask" | "edit";
type Proposal = { path: string; content: string; base: string };
type Message = { role: "user" | "assistant"; text: string };

export function AiAssistant({ roomId, activePath, open, readFile, applyFile, onClose }: {
  roomId: string; activePath: string; open: boolean; readFile: (path: string) => string | undefined;
  applyFile: (path: string, base: string, content: string) => boolean; onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("ask");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const language = useMemo(() => activePath.split(".").pop() || "plaintext", [activePath]);

  useEffect(() => {
    let alive = true;
    apiRequest("/api/ai/status").then((response) => response.json()).then((status: { enabled?: boolean; configured?: boolean }) => {
      if (alive) setAvailable(Boolean(status.enabled && status.configured));
    }).catch(() => { if (alive) setAvailable(false); });
    return () => { alive = false; };
  }, []);

  const submit = async () => {
    const question = prompt.trim();
    if (!question || busy) return;
    const baseAtRequest = readFile(activePath) ?? "";
    setPrompt(""); setError(""); setProposal(null); setBusy(true);
    setMessages((items) => [...items, { role: "user", text: question }, { role: "assistant", text: "" }]);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/ai/stream`, {
        method: "POST", signal: controller.signal,
        body: JSON.stringify({ prompt: question, mode, path: activePath })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "The AI request failed.");
      }
      if (!response.body) throw new Error("Streaming is unavailable in this browser.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let answer = "";
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n"); buffer = frames.pop() || "";
        for (const frame of frames) {
          const event = frame.match(/^event: (.+)$/m)?.[1];
          const payload = frame.match(/^data: (.+)$/m)?.[1];
          if (!event || !payload) continue;
          const data = JSON.parse(payload) as { text?: string; message?: string };
          if (event === "token" && data.text) {
            answer += data.text;
            setMessages((items) => items.map((item, i) => i === items.length - 1 ? { ...item, text: answer } : item));
          }
          if (event === "error") throw new Error(data.message || "AI request failed.");
        }
      }
      if (mode === "edit") {
        const match = answer.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (match) {
          const parsed = JSON.parse(match[1]) as { path?: unknown; content?: unknown };
          if (parsed.path === activePath && isSafeFilePath(parsed.path) && typeof parsed.content === "string") {
            setProposal({ path: parsed.path, content: parsed.content, base: baseAtRequest });
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "AI request failed.");
    } finally { setBusy(false); abortRef.current = null; }
  };

  const accept = () => {
    if (!proposal) return;
    if (!applyFile(proposal.path, proposal.base, proposal.content)) {
      setError("This file changed while the proposal was open. Ask AI to regenerate it, then review the new diff.");
      return;
    }
    setProposal(null); setError("");
  };

  return <aside className="ai-panel" aria-label="AI coding assistant" hidden={!open}>
    <header className="ai-header"><div><b>AI Assistant</b><small>Workspace context · Gemini</small></div><button className="ai-close" onClick={onClose} aria-label="Close AI assistant">×</button></header>
    <div className="ai-modes"><button className={mode === "ask" ? "selected" : ""} onClick={() => setMode("ask")}>Ask</button><button className={mode === "edit" ? "selected" : ""} onClick={() => setMode("edit")}>Edit</button></div>
    <div className="ai-context">Context: <code>{activePath}</code> and related workspace files</div>
    {available === false && <div className="ai-disabled" role="status">AI is unavailable. Enable `AI_ENABLED` and configure `GEMINI_API_KEY` on the API server.</div>}
    <div className="ai-messages" aria-live="polite">
      {!messages.length && <p className="ai-empty">Ask about your code or switch to Edit to request a proposed change. Changes are reviewed before they enter the shared workspace.</p>}
      {messages.map((message, index) => <article className={`ai-message ${message.role}`} key={index}><b>{message.role === "user" ? "You" : "Gemini"}</b><pre>{message.text || (busy ? "Thinking…" : "")}</pre></article>)}
      {proposal && <section className="ai-proposal"><div className="ai-proposal-title">Review change · <code>{proposal.path}</code></div><div className="ai-diff"><DiffEditor height="240px" language={language} theme="vs-dark" original={proposal.base} modified={proposal.content} options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, automaticLayout: true }} /></div><div className="ai-proposal-actions"><button onClick={() => setProposal(null)}>Reject</button><button className="accept" onClick={accept}>Accept change</button></div></section>}
      {error && <p className="ai-error" role="alert">{error}</p>}
    </div>
    <form className="ai-compose" onSubmit={(event) => { event.preventDefault(); void submit(); }}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} placeholder={mode === "ask" ? "Ask about this workspace…" : "Describe the change you want…"} /><div><span>Code is sent to Gemini when you submit.</span>{busy ? <button type="button" onClick={() => abortRef.current?.abort()}>Cancel</button> : <button type="submit" disabled={!prompt.trim() || available === false}>Send</button>}</div></form>
  </aside>;
}
