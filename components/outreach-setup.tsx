"use client";

import { useState } from "react";
import { type Session, type SupabaseClient } from "@supabase/supabase-js";
import { Check, CircleAlert, Database, Download, LoaderCircle, LockKeyhole, Settings, ShieldCheck, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type OutreachUserSettings = {
  user_id: string;
  display_name: string | null;
  professional_summary: string | null;
  target_roles: string[];
  target_locations: string[];
  target_companies: string[];
  message_preferences: Record<string, unknown>;
  invitation_withdrawal_days: number;
  follow_up_grace_hours: number;
  onboarding_completed: boolean;
};

type StoredCloudConfig = { url: string; publishableKey: string };
const CONFIG_KEY = "outreach.cloud.config.v1";
const MODE_KEY = "outreach.storage.mode.v1";

export function getStoredCloudConfig(): StoredCloudConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(CONFIG_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<StoredCloudConfig>;
    return typeof parsed.url === "string" && typeof parsed.publishableKey === "string"
      ? { url: parsed.url, publishableKey: parsed.publishableKey }
      : null;
  } catch { return null; }
}

export function isDemoMode() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}
export function enterDemoMode() {
  window.localStorage.removeItem(MODE_KEY);
  const url = new URL(window.location.href);
  url.searchParams.set("demo", "1");
  window.location.assign(url.toString());
}
export function openPrivateWorkspace() {
  window.localStorage.setItem(MODE_KEY, "cloud");
  const url = new URL(window.location.href);
  url.searchParams.delete("demo");
  window.location.assign(url.toString());
}

function splitValues(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

export function WorkspaceConnectionDialog() {
  const storedConfig = getStoredCloudConfig();
  const [url, setUrl] = useState(storedConfig?.url ?? "");
  const [publishableKey, setPublishableKey] = useState(storedConfig?.publishableKey ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    const normalizedUrl = url.trim().replace(/\/$/, "");
    const normalizedKey = publishableKey.trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(normalizedUrl)) return setError("Enter a valid Supabase project URL.");
    if (!normalizedKey.startsWith("sb_publishable_")) return setError("Use a modern browser-safe publishable key, never a secret, legacy service-role token, or database password.");
    setBusy(true); setError(null);
    try {
      const response = await fetch(`${normalizedUrl}/auth/v1/settings`, { headers: { apikey: normalizedKey } });
      if (!response.ok) throw new Error("Supabase rejected this project URL or publishable key.");
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: normalizedUrl, publishableKey: normalizedKey }));
      openPrivateWorkspace();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "The connection could not be verified.");
      setBusy(false);
    }
  }

  return <Dialog><DialogTrigger asChild><Button variant="outline" size="sm" className="workspace-connect"><LockKeyhole />Private workspace</Button></DialogTrigger>
    <DialogContent className="workspace-dialog"><DialogHeader><DialogTitle>Connect your private workspace</DialogTitle><DialogDescription>This is a one-time setup in this browser. Outreach stores only your project URL and browser-safe publishable key here.</DialogDescription></DialogHeader>
    {storedConfig && <div className="workspace-connected"><ShieldCheck size={17} /><div><strong>Workspace connection saved</strong><span>Return to your private sign-in and data.</span></div><Button size="sm" onClick={openPrivateWorkspace}>Open workspace</Button></div>}
    <div className="workspace-steps"><span><b>1</b>Create Supabase and apply the repository migrations.</span><span><b>2</b>Connect with the project URL and publishable key.</span><span><b>3</b>Sign in to claim the new installation.</span></div>
    <Card className="setup-form-card"><div className="setup-form-heading"><Database size={18} /><div><strong>{storedConfig ? "Update connection" : "My Supabase project"}</strong><span>Saved only in this browser unless your deployment provides environment values.</span></div></div>
      <label htmlFor="setup-url">Project URL</label><Input id="setup-url" inputMode="url" placeholder="https://your-project.supabase.co" value={url} onChange={(event) => setUrl(event.target.value)} />
      <label htmlFor="setup-key">Publishable key</label><Input id="setup-key" type="password" autoComplete="off" placeholder="sb_publishable_…" value={publishableKey} onChange={(event) => setPublishableKey(event.target.value)} />
      {error && <p className="form-error"><CircleAlert size={14} />{error}</p>}
      <Button className="setup-primary" disabled={busy || !url.trim() || !publishableKey.trim()} onClick={connect}>{busy ? <LoaderCircle className="spin" /> : <LockKeyhole />}{busy ? "Verifying…" : "Connect private workspace"}</Button>
    </Card>
    <p className="setup-security"><ShieldCheck size={14} />Secret keys, database passwords and LinkedIn credentials are rejected and must never be entered here.</p>
  </DialogContent></Dialog>;
}

export function WorkspaceConnectionGate() {
  return <main className="gate-shell"><section className="gate-card" aria-labelledby="workspace-connection-title">
    <div className="gate-icon"><Database size={24} /></div><p className="kicker">PRIVATE WORKSPACE</p>
    <h1 id="workspace-connection-title">Connect Outreach once.</h1>
    <p className="gate-copy">This browser needs your Supabase project URL and browser-safe publishable key before it can open the password sign-in. The connection stays on this device.</p>
    <WorkspaceConnectionDialog />
    <Button variant="outline" onClick={enterDemoMode}><Sparkles />Open synthetic demo</Button>
    <div className="gate-security"><ShieldCheck size={15} />Passwords and private data stay protected by Supabase Auth and row-level security</div>
  </section></main>;
}

export function ProfileSetup({ session, client, settings, onComplete }: { session: Session; client: SupabaseClient; settings: OutreachUserSettings | null; onComplete: (settings: OutreachUserSettings) => void }) {
  const [displayName, setDisplayName] = useState(settings?.display_name ?? "");
  const [summary, setSummary] = useState(settings?.professional_summary ?? "");
  const [roles, setRoles] = useState((settings?.target_roles ?? []).join(", "));
  const [locations, setLocations] = useState((settings?.target_locations ?? []).join(", "));
  const [companies, setCompanies] = useState((settings?.target_companies ?? []).join(", "));
  const [avoid, setAvoid] = useState(String(settings?.message_preferences?.avoid ?? ""));
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!summary.trim() || !roles.trim() || !locations.trim()) return setError("Add a short background, at least one target role and at least one location.");
    const next: OutreachUserSettings = {
      user_id: session.user.id, display_name: displayName.trim() || null,
      professional_summary: summary.trim(), target_roles: splitValues(roles), target_locations: splitValues(locations), target_companies: splitValues(companies),
      message_preferences: { avoid: avoid.trim() }, invitation_withdrawal_days: settings?.invitation_withdrawal_days ?? 14,
      follow_up_grace_hours: settings?.follow_up_grace_hours ?? 6, onboarding_completed: true,
    };
    setBusy(true); setError(null);
    const result = await client.from("outreach_user_settings").upsert({ ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select().single();
    setBusy(false);
    if (result.error) return setError(result.error.message);
    onComplete(result.data as OutreachUserSettings);
  }
  return <main className="setup-shell"><section className="profile-setup-card"><div className="setup-badge"><Settings size={16} />Private personalization</div><p className="kicker">FINAL SETUP STEP</p><h1>Teach Outreach what fits you.</h1><p className="setup-lede">These preferences are saved only in your Supabase project. They are never committed to the public code or demo.</p>
    <div className="profile-grid"><label>Display name<Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Optional" /></label><label className="profile-wide">Professional background<Textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="A concise career summary used to personalize outreach" /></label><label>Target roles<Input value={roles} onChange={(event) => setRoles(event.target.value)} placeholder="Staff Analytics, Fraud Strategy" /></label><label>Target locations<Input value={locations} onChange={(event) => setLocations(event.target.value)} placeholder="Seattle, Bay Area" /></label><label className="profile-wide">Target companies<Input value={companies} onChange={(event) => setCompanies(event.target.value)} placeholder="Optional, comma separated" /></label><label className="profile-wide">Language or phrases to avoid<Input value={avoid} onChange={(event) => setAvoid(event.target.value)} placeholder="Optional writing preferences" /></label></div>
    {error && <p className="form-error"><CircleAlert size={14} />{error}</p>}<Button className="setup-primary" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="spin" /> : <Check />}{busy ? "Saving…" : "Finish private setup"}</Button>
  </section></main>;
}

export function PrivacyDialog({ onExport, onDelete }: { onExport: () => Promise<void>; onDelete: () => Promise<string | null> }) {
  const [confirmation, setConfirmation] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function remove() { setBusy(true); setError(null); const result = await onDelete(); setBusy(false); if (result) setError(result); }
  return <Dialog><DialogTrigger asChild><Button size="sm" variant="ghost"><ShieldCheck />Privacy</Button></DialogTrigger><DialogContent className="privacy-dialog"><DialogHeader><DialogTitle>Privacy and data controls</DialogTitle><DialogDescription>Export your workspace or permanently delete relationship data. Credentials are never included in an export.</DialogDescription></DialogHeader>
    <div className="privacy-action"><div><strong>Export workspace JSON</strong><span>Contacts, recommendations, activities, tasks and preferences. The downloaded file is private and contains personal data.</span></div><Button variant="outline" onClick={onExport}><Download />Export</Button></div>
    <div className="privacy-danger"><div><Trash2 size={18} /><div><strong>Delete all outreach data</strong><span>This permanently removes relationship records and personalization. Authentication and the installation ownership record remain so another signed-in user cannot take over.</span></div></div><label>Type <code>DELETE ALL OUTREACH DATA</code><Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>{error && <p className="form-error"><CircleAlert size={14} />{error}</p>}<Button variant="destructive" disabled={busy || confirmation !== "DELETE ALL OUTREACH DATA"} onClick={remove}>{busy ? <LoaderCircle className="spin" /> : <Trash2 />}{busy ? "Deleting…" : "Permanently delete data"}</Button></div>
  </DialogContent></Dialog>;
}
