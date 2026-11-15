"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Activity, Award, Bell, BriefcaseBusiness, ChartNoAxesCombined, Compass, FileText, FolderKanban, Globe2, LayoutDashboard, Menu, MessageSquareText, Moon, Palette, PanelLeftClose, PenLine, Search, Settings, Sparkles, Sun, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const links = [
  ["Overview", "/dashboard", LayoutDashboard],
  ["My Portfolio", "/dashboard/editor", BriefcaseBusiness],
  ["AI Portfolio Interview", "/dashboard/interview", MessageSquareText],
  ["AI Writing Assistant", "/dashboard/writing", PenLine],
  ["Theme Studio", "/dashboard/themes", Palette],
  ["Project Manager", "/dashboard/projects", FolderKanban],
  ["Resume Builder", "/dashboard/resume", FileText],
  ["AI Career Mentor", "/dashboard/mentor", Compass],
  ["Portfolio Score", "/dashboard/score", Award],
  ["Analytics", "/dashboard/analytics", ChartNoAxesCombined],
  ["Publish portfolio", "/dashboard/publish", Globe2],
  ["Settings", "/dashboard/settings", Settings],
] as const;
const mobileLinks: [string, string, LucideIcon][] = [["Home", "/dashboard", LayoutDashboard], ["Portfolio", "/dashboard/editor", BriefcaseBusiness], ["Projects", "/dashboard/projects", FolderKanban], ["AI tools", "/dashboard/interview", Sparkles], ["Settings", "/dashboard/settings", Settings]];

export default function DashboardFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [student, setStudent] = useState<{ name?: string; email?: string }>({});
  const current = links.find(([, href]) => href === path) || links[0];
  const filteredLinks = useMemo(() => links.filter(([label]) => label.toLowerCase().includes(query.toLowerCase())), [query]);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => setStudent({ name: d.user?.profile?.displayName || d.user?.profile?.fullName || "Student", email: d.user?.email })).catch(() => undefined);
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key === "Escape") { setSearchOpen(false); setProfileOpen(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return <div className={`app ${dark ? "dark" : ""}`}>
    <aside className={`sidebar ${collapsed ? "closed" : ""}`}>
      <div className="side-brand"><Link href="/dashboard" className="brand"><span className="brand-mark"><Sparkles size={15}/></span>{!collapsed && <>portfolio<span className="brand-ai">ai</span></>}</Link></div>
      {!collapsed && <div className="workspace-switch"><div><b>{student.name || "Student workspace"}</b><small>Personal workspace</small></div><Activity size={14}/></div>}
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-links">{links.slice(0, 11).map(([label, href, Icon]) => <Link key={href} href={href} title={collapsed ? label : undefined} className={`side-link ${path === href ? "active" : ""}`}><Icon size={16}/>{!collapsed && label}</Link>)}</nav>
      <div className="sidebar-bottom"><Link href="/dashboard/settings" className={`side-link ${path === "/dashboard/settings" ? "active" : ""}`}><Settings size={16}/>{!collapsed && "Settings"}</Link><div className="profile-row"><div className="avatar">{(student.name || "S").slice(0, 1).toUpperCase()}</div>{!collapsed && <div><b>{student.name || "Student"}</b><small>{student.email || "PortfolioAI account"}</small></div>}</div></div>
    </aside>
    <div className="main-area">
      <header className="topbar">
        <div className="top-left"><button className="icon-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}><PanelLeftClose size={15}/></button><span className="crumb">Workspace <span>›</span> <b>{current[0]}</b></span></div>
        <div className="mobile-header"><button className="icon-button" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle navigation"><Menu size={16}/></button><Link href="/dashboard" className="brand"><span className="brand-mark"><Sparkles size={13}/></span>portfolio<span className="brand-ai">ai</span></Link></div>
        <div className="top-actions"><button className="search-box" onClick={() => setSearchOpen(true)}><Search size={14}/><span>Search pages...</span><kbd>⌘ K</kbd></button><button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle color theme">{dark ? <Sun size={15}/> : <Moon size={15}/>}</button><Link className="icon-button" href="/dashboard/analytics" aria-label="View analytics"><Bell size={15}/></Link><button className="icon-button" onClick={() => setProfileOpen(!profileOpen)} aria-label="Open account menu"><div className="avatar" style={{width:22,height:22,fontSize:8,borderRadius:6}}>{(student.name || "S").slice(0, 1).toUpperCase()}</div></button></div>
        {profileOpen && <div className="profile-menu"><b>{student.name || "Student"}</b><p style={{fontSize:10,color:"var(--muted)"}}>{student.email}</p><Link className="side-link" href="/dashboard/settings">Account settings</Link><button className="side-link" onClick={signOut}>Sign out</button></div>}
      </header>
      <main className="content">{children}</main>
    </div>
    <nav className="mobile-nav">{mobileLinks.map(([label,href,Icon]) => <Link key={href} href={href} className={path === href ? "active" : ""}><Icon size={17}/>{label}</Link>)}</nav>
    {searchOpen && <div className="search-overlay" onClick={() => setSearchOpen(false)}><div className="search-modal" onClick={event => event.stopPropagation()}><div style={{display:"flex",alignItems:"center"}}><Search size={16}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search dashboard pages…"/><button className="icon-button" onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={14}/></button></div><div className="search-results"><small>QUICK NAVIGATION</small>{filteredLinks.map(([label,href,Icon]) => <Link href={href} key={href} onClick={() => setSearchOpen(false)}><Icon size={14} style={{verticalAlign:"middle",marginRight:10,color:"var(--purple)"}}/>{label}</Link>)}</div></div></div>}
  </div>;
}
