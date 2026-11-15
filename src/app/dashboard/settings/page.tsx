"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, Save } from "lucide-react";

type SettingsProfile = { fullName: string; displayName: string; college: string; degree: string; branch: string; academicYear: string; graduationYear: string; careerInterests: string; email: string };
const empty: SettingsProfile = { fullName: "", displayName: "", college: "", degree: "", branch: "", academicYear: "", graduationYear: "", careerInterests: "", email: "" };

export default function SettingsPage() {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([fetch("/api/profile").then(r => r.json()), fetch("/api/auth/me").then(r => r.json())]).then(([profileData, authData]) => {
      const p = profileData.profile || {};
      setForm({ fullName: p.fullName || "", displayName: p.displayName || "", college: p.college || "", degree: p.degree || "", branch: p.branch || "", academicYear: p.academicYear || "", graduationYear: p.graduationYear ? String(p.graduationYear) : "", careerInterests: (p.careerInterests || []).join(", "), email: authData.user?.email || "" });
    }).catch(() => setError("Settings could not be loaded.")).finally(() => setBusy(false));
  }, []);
  function update(key: keyof SettingsProfile, value: string) { setForm(current => ({ ...current, [key]: value })); setMessage(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: form.fullName, displayName: form.displayName, college: form.college, degree: form.degree, branch: form.branch, academicYear: form.academicYear, graduationYear: form.graduationYear ? Number(form.graduationYear) : null, careerInterests: form.careerInterests.split(",").map(item => item.trim()).filter(Boolean) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Settings could not be saved."); setMessage("Profile settings saved.");
    } catch (cause) { setError((cause as Error).message); } finally { setSaving(false); }
  }
  const field = (label: string, key: keyof SettingsProfile, placeholder: string, type = "text") => <label className="setting-field">{label}<input type={type} value={form[key]} placeholder={placeholder} onChange={event => update(key, event.target.value)} disabled={busy || key === "email"}/></label>;

  return <div className="settings-page"><div className="page-title"><div><h1>Settings</h1><p>Manage your account and the profile information used across PortfolioAI.</p></div></div>{error && <p role="alert" className="project-error">{error}</p>}{message && <p role="status" className="publish-message"><Check size={14}/>{message}</p>}<form className="card account-settings" onSubmit={save}><h2>Student profile</h2><p>Changes are saved to your account and used by your portfolio, resume, and AI tools.</p><div className="settings-form-grid">{field("Full name", "fullName", "Your full name")}{field("Preferred name", "displayName", "How visitors should address you")}{field("Email address", "email", "", "email")}{field("College or university", "college", "Institution")}{field("Degree", "degree", "Degree")}{field("Branch", "branch", "Field of study")}{field("Academic year", "academicYear", "Current year")}{field("Graduation year", "graduationYear", "2027", "number")}{field("Career interests", "careerInterests", "Software engineering, data science…")}</div><button className="primary-action" disabled={busy || saving}>{saving ? <LoaderCircle size={14}/> : <Save size={14}/>}Save profile</button></form></div>;
}
