"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

type AuthFlowMode = "forgot" | "reset" | "verify";

export default function AuthFlow({ mode, initialToken = "" }: { mode: AuthFlowMode; initialToken?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(mode === "verify" && Boolean(initialToken));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [developmentLink, setDevelopmentLink] = useState("");

  useEffect(() => {
    if (mode !== "verify" || !initialToken) return;
    fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: initialToken }) })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setMessage(data.message); })
      .catch(cause => setError((cause as Error).message || "Verification failed."))
      .finally(() => setBusy(false));
  }, [initialToken, mode]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage(""); setDevelopmentLink("");
    try {
      if (mode === "reset" && password !== confirmation) throw new Error("The passwords do not match.");
      const endpoint = mode === "forgot" ? "/api/auth/forgot-password" : mode === "reset" ? "/api/auth/reset-password" : "/api/auth/verification-email";
      const payload = mode === "reset" ? { token, password } : mode === "verify" ? { email } : { email };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed.");
      setMessage(data.message || "Request complete.");
      setDevelopmentLink(data.developmentLink || "");
    } catch (cause) { setError((cause as Error).message || "The request failed."); }
    finally { setBusy(false); }
  }

  const title = mode === "forgot" ? "Reset your password" : mode === "reset" ? "Choose a new password" : initialToken ? "Verify your email" : "Verify your email";
  return <main className="auth-flow-page"><div className="auth-flow-card card"><Link href="/" className="brand"><span className="brand-mark"><Sparkles size={14}/></span>portfolio<span className="brand-ai">ai</span></Link><h1>{title}</h1><p className="auth-flow-description">{mode === "forgot" ? "Enter your account email. If it exists, we’ll send a single-use reset link." : mode === "reset" ? "Reset links expire after 30 minutes and work once." : "Verify your email to enable sign-in."}</p>
    {mode === "verify" && initialToken ? <div aria-live="polite">{busy ? <p>Verifying your link…</p> : error ? <p role="alert" className="auth-flow-error">{error}</p> : <p role="status" className="auth-flow-success">{message}</p>}</div> : <form onSubmit={submit}>
      {mode !== "reset" && <label className="auth-label">Email<input type="email" name="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)}/></label>}
      {mode === "reset" && <><label className="auth-label">Reset token<input required value={token} onChange={event => setToken(event.target.value)} autoComplete="one-time-code"/></label><label className="auth-label">New password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)}/></label><label className="auth-label">Confirm password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)}/></label></>}
      {error && <p role="alert" className="auth-flow-error">{error}</p>}{message && <p role="status" className="auth-flow-success">{message}</p>}
      {developmentLink && <p className="auth-development-note">Development mode only: no email was delivered. <a href={developmentLink}>Open the test link</a></p>}
      <button className="primary-action auth-flow-submit" disabled={busy}>{busy ? "Please wait…" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Update password" : "Send verification link"}</button>
    </form>}
    {mode === "verify" && !initialToken && <p className="auth-flow-resend-note">Already verified? <Link href="/dashboard">Open your workspace</Link></p>}
    <p className="auth-flow-footer"><Link href="/dashboard">Return to your workspace</Link></p>
  </div></main>;
}
