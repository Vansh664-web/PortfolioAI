"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award, Eye, FileText, Folder, PenLine, Plus, Sparkles, Zap } from "lucide-react";

type Profile = { fullName?: string | null; displayName?: string | null; college?: string | null; degree?: string | null; branch?: string | null; graduationYear?: number | null; about?: string | null; skills?: { id: string; name: string }[]; socialLinks?: Record<string, string> | null };
type Score = { overall: number; suggestions: { category: string; action: string }[] };
type Analytics = { visits: number; uniqueVisitors: number; trend: { date: string; visits: number }[] };
type Project = { id: string; name: string };

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [score, setScore] = useState<Score | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [hasResume, setHasResume] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then(r => r.ok ? r.json() : null),
      fetch("/api/projects").then(r => r.ok ? r.json() : null),
      fetch("/api/score").then(r => r.ok ? r.json() : null),
      fetch("/api/analytics?days=7").then(r => r.ok ? r.json() : null),
      fetch("/api/resume").then(r => r.ok ? r.json() : null),
    ]).then(([p, pr, s, a, r]) => {
      setProfile(p?.profile || null);
      setProjects(pr?.projects || []);
      setScore(s || null);
      setAnalytics(a || null);
      setHasResume(Boolean(r?.resume));
    }).finally(() => setLoading(false));
  }, []);

  const completionFields = [profile?.fullName, profile?.college, profile?.degree, profile?.branch, profile?.graduationYear, profile?.about, (profile?.skills?.length || 0) > 0, projects.length > 0, Object.keys(profile?.socialLinks || {}).length > 0];
  const completion = Math.round(completionFields.filter(Boolean).length / completionFields.length * 100);
  const name = profile?.displayName || profile?.fullName || "there";
  const bars = analytics?.trend.slice(-7) || [];
  const maxVisits = Math.max(1, ...bars.map(day => day.visits));

  return <>
    <div className="welcome-row"><div><h1>Welcome back, {name} <span style={{color:"#a387fa"}}>✳</span></h1><p>Your portfolio progress and next steps, based on your saved profile.</p></div><Link className="primary-action" href="/dashboard/editor"><Plus size={14}/>Open portfolio editor</Link></div>
    <div className="grid stats-grid">
      <div className="card completion-card"><div><h3>Portfolio completion</h3><p>{completion === 100 ? "Your profile has the core details saved." : "Complete more of your profile to strengthen your portfolio."}</p><Link href="/onboarding">Update your profile ↗</Link></div><div className="progress-ring"><strong>{loading ? "—" : completion}<small>%</small></strong></div></div>
      <div className="card score-card"><div className="stat-heading">Portfolio score <span className="stat-icon"><Award size={15}/></span></div><div className="stat-value">{loading ? "—" : score?.overall ?? 0}<span style={{fontSize:11,color:"var(--muted)"}}> / 100</span></div><div className="score-line"><i style={{width:`${score?.overall || 0}%`}}/></div><div className="stat-foot">Calculated from saved portfolio information</div></div>
      <Stat icon={Eye} label="Portfolio views" value={loading ? "—" : analytics?.visits ?? 0} foot="consented visits, last 7 days"/>
      <Stat icon={Folder} label="Projects" value={loading ? "—" : projects.length} foot="saved to your account"/>
      <Stat icon={Zap} label="Skills" value={loading ? "—" : profile?.skills?.length ?? 0} foot="saved to your profile"/>
      <div className="card stat-card"><div className="stat-heading">Resume status <span className="stat-icon"><FileText size={15}/></span></div><div className="stat-value" style={{fontSize:17}}>{loading ? "Loading…" : hasResume ? "Resume saved" : "Not created yet"}</div><div className="stat-foot"><Link href="/dashboard/resume" style={{color:"var(--purple)"}}>{hasResume ? "Edit resume ↗" : "Build a resume ↗"}</Link></div></div>
    </div>
    <div className="grid dashboard-main-grid">
      <div><div className="card chart-card"><div className="section-heading"><h3>Portfolio visits</h3><span className="chart-legend">Last 7 days</span></div>{bars.length && bars.some(day => day.visits > 0) ? <div className="chart">{bars.map(day => <i key={day.date} title={`${day.date}: ${day.visits} visits`} style={{height:`${Math.max(4, day.visits / maxVisits * 100)}%`}}/>)}</div> : <div className="no-events">No consented visits recorded in the last 7 days.</div>}<div className="chart-labels"><span>Visits come from your published portfolio</span><Link href="/dashboard/analytics">Analytics ↗</Link></div></div>
        <div className="card recommendation"><div className="recommendation-head"><Sparkles size={15}/> Suggested next steps</div>{score?.suggestions?.length ? score.suggestions.slice(0, 3).map(item => <p key={item.category}><b>{item.category}:</b> {item.action}</p>) : <p>{loading ? "Checking your saved portfolio…" : "Your portfolio has no scored gaps right now. Keep your saved information current."}</p>}<Link href="/dashboard/score">View score details ↗</Link></div>
      </div>
      <div className="card"><div className="section-heading"><h3>Recent activity</h3></div><div className="analytics-empty"><Eye size={18}/><b>{analytics?.visits ? `${analytics.visits} consented visit${analytics.visits === 1 ? "" : "s"} this week` : "No recent tracked activity"}</b><span>Activity only appears after visitors opt in to analytics on your published portfolio.</span></div><Link href="/dashboard/analytics">Open analytics ↗</Link></div>
    </div>
    <div style={{marginTop:17}}><div className="section-heading"><h3>Quick actions</h3></div><div className="quick-grid"><Quick icon={Plus} title="Add a project" desc="Manage your project records" href="/dashboard/projects"/><Quick icon={PenLine} title="Improve your writing" desc="Edit portfolio copy with AI" href="/dashboard/writing"/><Quick icon={Sparkles} title="Start portfolio interview" desc="Build a draft from your answers" href="/dashboard/interview"/><Quick icon={FileText} title="Build your resume" desc="Create and edit a resume" href="/dashboard/resume"/></div></div>
  </>;
}

function Stat({ icon: Icon, label, value, foot }: { icon: React.ElementType; label: string; value: string | number; foot: string }) {
  return <div className="card stat-card"><div className="stat-heading">{label}<span className="stat-icon"><Icon size={15}/></span></div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></div>;
}
function Quick({ icon: Icon, title, desc, href }: { icon: React.ElementType; title: string; desc: string; href: string }) {
  return <Link className="quick-action" href={href}><Icon/><b>{title}</b><small>{desc}</small></Link>;
}
