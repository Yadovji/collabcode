import { useCallback, useEffect, useState } from "react";
import { MessageSquare, RefreshCw, Send } from "lucide-react";
import { apiRequest } from "./auth";
import type { ReviewSelection } from "./CollaborativeEditor";

type Reply = { id: string; body: string; createdAt: string; author: { id: string; name: string } };
type Review = {
  id: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  comment: string;
  suggestion: string | null;
  status: string;
  createdAt: string;
  author: { id: string; name: string };
  replies: Reply[];
};
type LineChange = { id: string; actorName: string; actorType: string; filePath: string; lineStart: number; lineEnd: number; operation: string; createdAt: string };

async function requestResult<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

export function ReviewPanel({ roomId, filePath, selection, userId, canEdit, canManage }: {
  roomId: string;
  filePath: string;
  selection: ReviewSelection | null;
  userId: string;
  canEdit: boolean;
  canManage: boolean;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [changes, setChanges] = useState<LineChange[]>([]);
  const [comment, setComment] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [suggestionEnabled, setSuggestionEnabled] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams({ filePath });
      const [reviewResponse, historyResponse] = await Promise.all([
        apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/reviews?${params}`),
        apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/history?${params}`)
      ]);
      const reviewResult = await requestResult<{ reviews: Review[] }>(reviewResponse);
      const historyResult = await requestResult<{ changes: LineChange[] }>(historyResponse);
      setReviews(reviewResult.reviews || []);
      setChanges(historyResult.changes || []);
      setError("");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not load review activity.");
    }
  }, [roomId, filePath]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 7000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const createReview = async () => {
    if (!selection || !comment.trim()) return;
    setBusy(true);
    try {
      await requestResult(await apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/reviews`, {
        method: "POST",
        body: JSON.stringify({ filePath, lineStart: selection.lineStart, lineEnd: selection.lineEnd, comment, suggestion: suggestionEnabled ? suggestion : null })
      }));
      setComment("");
      setSuggestion("");
      setSuggestionEnabled(false);
      await refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not add the review comment.");
    } finally { setBusy(false); }
  };

  const applySuggestion = async (reviewId: string) => {
    setBusy(true);
    try {
      await requestResult(await apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/reviews/${encodeURIComponent(reviewId)}/apply`, { method: "POST" }));
      await refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not apply the suggestion.");
    } finally { setBusy(false); }
  };

  const sendReply = async (reviewId: string) => {
    const body = replyDrafts[reviewId]?.trim();
    if (!body) return;
    setBusy(true);
    try {
      await requestResult(await apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/reviews/${encodeURIComponent(reviewId)}/replies`, { method: "POST", body: JSON.stringify({ body }) }));
      setReplyDrafts((current) => ({ ...current, [reviewId]: "" }));
      await refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not send the reply.");
    } finally { setBusy(false); }
  };

  const updateStatus = async (review: Review) => {
    setBusy(true);
    try {
      await requestResult(await apiRequest(`/api/workspaces/${encodeURIComponent(roomId)}/reviews/${encodeURIComponent(review.id)}`, {
        method: "PATCH", body: JSON.stringify({ status: review.status === "open" ? "resolved" : "open" })
      }));
      await refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not update the review.");
    } finally { setBusy(false); }
  };

  return <div className="review-panel">
    <div className="review-selection"><b>Review this file</b><span>{filePath}</span>{selection && <small>Selected lines {selection.lineStart}{selection.lineEnd !== selection.lineStart ? `-${selection.lineEnd}` : ""}</small>}</div>
    <label className="review-label" htmlFor="review-comment">Comment</label>
    <textarea id="review-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={4000} placeholder={selection ? "Ask a question or leave a note..." : "Select a line in the editor first"} disabled={!selection || busy} />
    <label className="review-suggest-toggle"><input type="checkbox" checked={suggestionEnabled} onChange={(event) => setSuggestionEnabled(event.target.checked)} disabled={!selection || busy} /> Include a code suggestion <small>(can be empty to remove the selected lines)</small></label>
    <label className="review-label" htmlFor="review-suggestion">Suggested replacement</label>
    <textarea id="review-suggestion" className="review-code-input" value={suggestion} onChange={(event) => setSuggestion(event.target.value)} maxLength={30000} placeholder="Paste replacement text for the selected lines" disabled={!selection || !suggestionEnabled || busy} />
    <button className="review-submit" onClick={() => void createReview()} disabled={!selection || !comment.trim() || busy}><MessageSquare size={13} /> Add to shared review</button>
    {error && <p className="review-error" role="alert">{error}</p>}

    <div className="review-section-heading"><b>Review threads</b><button title="Refresh review activity" onClick={() => void refresh()}><RefreshCw size={12} /></button></div>
    {reviews.length === 0 ? <p className="review-empty">No comments on this file yet.</p> : reviews.map((review) => <article className="review-card" key={review.id}>
      <div className="review-card-meta"><b>{review.author.name}</b><span>lines {review.lineStart}-{review.lineEnd}</span><i className={review.status === "open" ? "review-status-open" : "review-status-closed"}>{review.status}</i></div>
      <p>{review.comment}</p>
      {review.suggestion !== null && <><small className="review-suggestion-title">Suggested replacement</small><pre className="review-suggestion-code">{review.suggestion || "(remove selected lines)"}</pre>{review.status === "open" && <button className="review-apply" onClick={() => void applySuggestion(review.id)} disabled={!canEdit || busy}>{canEdit ? "Apply suggestion" : "Editor access required to apply"}</button>}</>}
      {review.replies.map((reply) => <div className="review-reply" key={reply.id}><b>{reply.author.name}</b><span>{reply.body}</span></div>)}
      {review.status === "open" && <div className="review-reply-form"><input aria-label="Reply to review" value={replyDrafts[review.id] || ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [review.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") void sendReply(review.id); }} placeholder="Reply..." maxLength={4000} disabled={busy} /><button title="Send reply" onClick={() => void sendReply(review.id)} disabled={!replyDrafts[review.id]?.trim() || busy}><Send size={12} /></button></div>}
      {(review.author.id === userId || canManage) && <button className="review-resolve" onClick={() => void updateStatus(review)} disabled={busy}>{review.status === "open" ? "Resolve thread" : "Reopen thread"}</button>}
    </article>)}

    <details className="line-history" open>
      <summary>Recent line activity</summary>
      {changes.length === 0 ? <p className="review-empty">Edits will appear here with their author and line range.</p> : changes.map((change) => <div className="line-history-row" key={change.id}>
        <b>{change.actorType === "agent" ? `${change.actorName} (AI)` : change.actorName}</b>
        <span>{change.operation} lines {change.lineStart}-{change.lineEnd}</span>
        <small>{new Date(change.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
      </div>)}
    </details>
  </div>;
}
