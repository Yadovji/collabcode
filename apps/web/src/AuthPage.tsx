import { useState, type FormEvent } from "react";
import { ArrowRight, Code2, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

export function AuthPage() {
  const { login, register } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const returnTo = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "register") await register({ name, email, password });
      else await login({ email, password });
      navigate(returnTo?.pathname ? `${returnTo.pathname}${returnTo.search || ""}${returnTo.hash || ""}` : "/", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="auth-page">
    <a className="brand auth-brand" href="/"><span className="brand-mark"><Code2 size={17} /></span>collab<span>code</span></a>
    <section className="auth-card">
      <div className="auth-icon"><ShieldCheck size={20} /></div>
      <p className="auth-eyebrow">YOUR TEAM WORKSPACE</p>
      <h1>{mode === "register" ? "Create your account" : "Welcome back"}</h1>
      <p className="auth-copy">{mode === "register" ? "Sign up to create private coding workspaces and invite teammates." : "Sign in to open your workspaces and continue collaborating."}</p>
      <div className="auth-switch" role="tablist" aria-label="Account action">
        <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "selected" : ""} onClick={() => { setMode("register"); setError(""); }}>Sign up</button>
        <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setError(""); }}>Log in</button>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === "register" && <label>Display name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label>}
        <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
        <label>Password<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 8 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 8 characters" : "Your password"} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary auth-submit" type="submit" disabled={submitting}>{submitting ? "Please wait…" : mode === "register" ? "Create account" : "Log in"}<ArrowRight size={15} /></button>
      </form>
      <p className="auth-footnote">Your password is stored as a one-way hash. Workspace access is checked by the server.</p>
    </section>
  </main>;
}
