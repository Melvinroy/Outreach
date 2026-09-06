"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { DropdownMenu, Popover } from "radix-ui";
import { ArrowRight, ChevronDown, Database, LayoutDashboard, LogOut, Send, Settings2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import "./application-shell.css";

export function OutreachBrand() {
  return <span className="outreach-brand"><Send aria-hidden="true" size={28}/><strong>Outreach</strong></span>;
}

export function WorkspaceStatus({ demo, failed, pending, readOnly }: { demo: boolean; failed: boolean; pending: number; readOnly: boolean }) {
  const label = demo ? "Sample data" : failed ? "Data connection needs attention" : pending ? "Updating live data" : "Live data connected";
  const detail = demo ? label : `${label}.${pending ? ` ${pending} changes pending.` : ""}${readOnly ? " New workflow sending is not enabled. Existing outreach continues in the original workspace." : ""}`;
  return <Popover.Root><Popover.Trigger asChild><button className="workspace-status-trigger" aria-label={detail} title={detail}><span className={`workspace-status-dot ${demo ? "sample" : failed ? "failed" : pending ? "pending" : "connected"}`} aria-hidden="true"/></button></Popover.Trigger><Popover.Portal><Popover.Content className="workspace-status-popover" sideOffset={6} align="end" collisionPadding={12}><strong>{label}</strong><p>{demo ? "You are viewing sample records." : readOnly ? "New workflow sending is not enabled. Existing outreach continues in the original workspace." : "Your workspace is connected."}</p>{pending > 0 && <p>{pending} recent changes are updating.</p>}{readOnly && !demo && <a href="?legacy=1">Open original workspace</a>}</Popover.Content></Popover.Portal></Popover.Root>;
}

export function LandingPage() {
  return <main className="outreach-public">
    <header className="landing-header"><OutreachBrand/><a className="public-secondary" href="?view=sign-in">Sign in</a></header>
    <section className="landing-hero" aria-labelledby="landing-title">
      <p className="landing-eyebrow">BUILD MEANINGFUL CONNECTIONS</p>
      <h1 id="landing-title">Turn conversations<br/>into <span>opportunities</span></h1>
      <p className="landing-description">Track your LinkedIn outreach — from first connection to real opportunities.</p>
      <a className="public-primary" href="?view=sign-in">Get started <ArrowRight size={18}/></a>
    </section>
    <footer className="landing-footer"><span>Outreach · Relationships, with intention</span><a href="?demo=1">Explore sample workspace <ArrowRight size={14}/></a></footer>
  </main>;
}

export function ApplicationSidebar({ profileTriggerRef, view, onNavigate, userName, demo, onSettings, workspaceControls, onLogout }: {
  profileTriggerRef: RefObject<HTMLButtonElement | null>;
  view: string; onNavigate: (view: "overview" | "people") => void; userName: string; demo: boolean;
  onSettings: () => void; workspaceControls: ReactNode; onLogout: () => void;
}) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const initials = userName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <>
    <aside className="outreach-sidebar">
      <button type="button" className="sidebar-brand" aria-label="Outreach overview" onClick={() => onNavigate("overview")}><OutreachBrand/></button>
      <nav className="sidebar-navigation" aria-label="Main views">
        <button aria-current={view === "overview" ? "page" : undefined} onClick={() => onNavigate("overview")}><LayoutDashboard size={18}/><span>Overview</span></button>
        <button aria-current={view === "people" ? "page" : undefined} onClick={() => onNavigate("people")}><Users size={18}/><span>People</span></button>
      </nav>
      <div className="sidebar-profile">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild><button ref={profileTriggerRef} className="profile-trigger" aria-label={`User menu: ${userName}`}><span className="profile-initials">{initials}</span><span className="profile-name">{userName}</span><ChevronDown size={15}/></button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content className="profile-menu" side="top" align="start" sideOffset={8} collisionPadding={12}>
            <DropdownMenu.Label className="profile-menu-label">{demo ? "Sample workspace" : userName}</DropdownMenu.Label>
            <DropdownMenu.Item onSelect={onSettings}><Settings2 size={16}/>Settings</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => setWorkspaceOpen(true)}><Database size={16}/>Workspace &amp; Data</DropdownMenu.Item>
            <DropdownMenu.Separator/>
            <DropdownMenu.Item onSelect={onLogout}><LogOut size={16}/>Log out</DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </aside>
    <Dialog open={workspaceOpen} onOpenChange={setWorkspaceOpen}><DialogContent className="shell-workspace-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); profileTriggerRef.current?.focus(); }}><DialogHeader><DialogTitle>Workspace &amp; Data</DialogTitle><DialogDescription>{demo ? "You are exploring a sample workspace. Open your private workspace to use your own data." : "Manage your existing private workspace, account, and data."}</DialogDescription></DialogHeader><div className="shell-workspace-controls">{workspaceControls}</div></DialogContent></Dialog>
  </>;
}
