"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import {
  BarChart3, Bot, BriefcaseBusiness, CalendarDays, Check, ChevronDown, ChevronUp, CircleAlert,
  Clock3, Copy, ExternalLink, GitPullRequest, KeyRound, ListChecks, LoaderCircle,
  LockKeyhole, LogOut, Mail, MessageSquareText, RefreshCw, Search, Send, ShieldCheck,
  Sparkles, UserRoundCheck, UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  enterDemoMode, getStoredCloudConfig, isDemoMode, PrivacyDialog,
  ProfileSetup, WorkspaceConnectionDialog, WorkspaceConnectionGate, type OutreachUserSettings,
} from "@/components/outreach-setup";
import { getDeploymentCloudConfig } from "@/lib/outreach-deployment";

type ContactStatus = "not_contacted" | "request_sent" | "connected" | "messaged" | "replied" | "meeting_scheduled" | "referred" | "withdrawn" | "closed";
type Contact = { id: string; full_name: string; employer: string; current_title: string | null; location: string | null; linkedin_profile_url: string; connection_status: ContactStatus };
type Recommendation = {
  id: number; run_id: string; contact_id: string; track: "hiring_manager" | "executive"; priority: number;
  relationship_to_opening: string | null; seniority_band: string | null; estimated_levels_above: number | null;
  opening_title: string | null; fit_assessment: string; genuine_gap: string | null;
  active_job_url: string | null; hiring_post_url: string | null; personalized_message: string; verified_at: string;
};
type OutreachRun = { id: string; run_date: string; generated_at_sgt: string; actual_hiring_managers: number; actual_executives: number; company_count: number };
type Activity = {
  id: number; contact_id: string;
  activity_type: "recommended" | "request_sent" | "connected" | "message_sent" | "reply_received" | "follow_up" | "meeting_scheduled" | "referral" | "invitation_withdrawn" | "closed" | "note";
  activity_at: string; evidence_source: "manual" | "browser_assisted" | "gmail_signal" | "import" | "system";
};
type QueueItem = Recommendation & { contact: Contact; run_date: string };
type BatchReceipt = { id: string; code: string; selectedCount: number; createdAt: string };
type GuardrailReason = "already_pending" | "already_connected" | "previously_contacted";
type GuardrailRecord = { contact_id: string; skip_reason: GuardrailReason; preflight_checked_at: string };
type DiscoveryDuplicate = { duplicate_reason: "linkedin_identity" | "name_employer_identity"; detected_at: string };
type RelationshipTask = { id: number; contact_id: string; task_type: "follow_up" | "withdraw_invitation"; status: "due" | "queued" | "completed" | "skipped" | "cancelled"; due_at: string; draft_message: string | null; source: "gmail_signal" | "browser_assisted" | "manual" | "system"; created_at: string };
type WorkflowRun = { id: string; workflow_type: "task_refresh" | "acceptance_reconciliation" | "follow_up_batch" | "withdrawal_batch"; status: "running" | "waiting_for_user" | "completed" | "partially_completed" | "failed"; last_node: string; checkpoint: Record<string, unknown>; started_at: string; updated_at: string };
type Phase4BatchReceipt = BatchReceipt & { actionType: "follow_up" | "withdraw_invitation" };
type ConversationTask = {
  id: number; contact_id: string; inbound_event_id: number | null;
  task_type: "proactive_follow_up" | "reply";
  status: "waiting" | "context_required" | "needs_review" | "approved" | "queued" | "completed" | "skipped" | "cancelled";
  due_at: string; inbound_message: string | null; draft_message: string | null;
  source: "gmail_signal" | "browser_assisted" | "manual" | "system";
  reviewed_at: string | null; created_at: string;
};
type Phase5WorkflowRun = { id: string; workflow_type: "acceptance_wait" | "inbound_message" | "draft_preparation" | "draft_review" | "proactive_follow_up_batch" | "reply_batch"; status: "running" | "waiting_for_user" | "completed" | "partially_completed" | "failed"; last_node: string; checkpoint: Record<string, unknown>; started_at: string; updated_at: string };
type Phase5BatchReceipt = BatchReceipt & { actionType: "proactive_follow_up" | "reply" };
type DashboardData = { run: OutreachRun; runs: OutreachRun[]; contacts: Contact[]; queue: QueueItem[]; activities: Activity[]; guardrails: GuardrailRecord[]; discoveryDuplicates: DiscoveryDuplicate[]; tasks: RelationshipTask[]; conversationTasks: ConversationTask[]; workflowRuns: WorkflowRun[]; phase5WorkflowRuns: Phase5WorkflowRun[]; activeBatch: BatchReceipt | null; activePhase4Batches: Phase4BatchReceipt[]; activePhase5Batches: Phase5BatchReceipt[]; settings: OutreachUserSettings | null };
type QueueScope = "today" | "unreached" | "recent" | "all" | "custom";

const runtimeEnv = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const storedCloudConfig = getStoredCloudConfig();
const deploymentCloudConfig = getDeploymentCloudConfig();
const SUPABASE_URL = runtimeEnv.VITE_SUPABASE_URL ?? deploymentCloudConfig?.url ?? storedCloudConfig?.url ?? "";
const SUPABASE_PUBLISHABLE_KEY = runtimeEnv.VITE_SUPABASE_PUBLISHABLE_KEY ?? deploymentCloudConfig?.publishableKey ?? storedCloudConfig?.publishableKey ?? "";
const supabase = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, detectSessionInUrl: true } })
  : null;

const statusLabels: Record<ContactStatus, string> = {
  not_contacted: "Ready to contact", request_sent: "Request sent", connected: "Connected", messaged: "Message sent",
  replied: "Replied", meeting_scheduled: "Meeting set", referred: "Referred", withdrawn: "Withdrawn", closed: "Closed",
};
const actionableStatuses: ContactStatus[] = ["request_sent", "connected", "messaged", "replied", "meeting_scheduled", "referred", "withdrawn", "closed"];
const activityForStatus: Record<Exclude<ContactStatus, "not_contacted">, Activity["activity_type"]> = {
  request_sent: "request_sent", connected: "connected", messaged: "message_sent", replied: "reply_received",
  meeting_scheduled: "meeting_scheduled", referred: "referral", closed: "closed",
  withdrawn: "invitation_withdrawn",
};
const nextActionLabels: Partial<Record<ContactStatus, string>> = {
  connected: "Send first message", messaged: "Awaiting reply", replied: "Continue conversation",
  meeting_scheduled: "Prepare for meeting", referred: "Track referral",
};
const guardrailLabels: Record<GuardrailReason, string> = {
  already_pending: "Already pending", already_connected: "Already connected", previously_contacted: "Previously contacted",
};
const formatDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const formatShortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dateKeyInTimeZone = (date = new Date(), timeZone = "Asia/Singapore") => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const shiftDateKey = (date: string, days: number) => {
  const shifted = new Date(`${date}T00:00:00Z`); shifted.setUTCDate(shifted.getUTCDate() + days); return shifted.toISOString().slice(0, 10);
};
const dayGap = (older: string, newer: string) => Math.max(0, Math.round((Date.parse(`${newer}T00:00:00Z`) - Date.parse(`${older}T00:00:00Z`)) / 86_400_000));
const uniqueActivityCount = (activities: Activity[], types: Activity["activity_type"][]) => new Set(activities.filter((activity) => types.includes(activity.activity_type)).map((activity) => activity.contact_id)).size;
const authRedirectUrl = () => `${window.location.origin}${window.location.pathname}`;
const friendlyAuthError = (message: string) => message.toLowerCase().includes("email rate limit")
  ? "The email service has reached its hourly limit. Wait about an hour, then try once. Password sign-in remains available."
  : message;

async function fetchAllRuns(client: SupabaseClient) {
  const rows: OutreachRun[] = []; const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await client.from("outreach_runs").select("id,run_date,generated_at_sgt,actual_hiring_managers,actual_executives,company_count").order("run_date", { ascending: false }).order("generated_at_sgt", { ascending: false }).range(from, from + pageSize - 1);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as OutreachRun[]; rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function fetchAllContacts(client: SupabaseClient) {
  const rows: Contact[] = []; const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await client.from("outreach_contacts").select("id,full_name,employer,current_title,location,linkedin_profile_url,connection_status").order("last_recommended_date", { ascending: false }).order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as Contact[]; rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function fetchAllRecommendations(client: SupabaseClient) {
  const rows: Recommendation[] = []; const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await client.from("outreach_recommendations")
      .select("id,run_id,contact_id,track,priority,relationship_to_opening,seniority_band,estimated_levels_above,opening_title,fit_assessment,genuine_gap,active_job_url,hiring_post_url,personalized_message,verified_at")
      .order("verified_at", { ascending: false }).order("id", { ascending: false }).range(from, from + pageSize - 1);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as Recommendation[]; rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function loadDashboard(client: SupabaseClient, session: Session) {
  const accessResult = await client.from("outreach_app_access").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (accessResult.error) throw accessResult.error;
  if (!accessResult.data) return { authorized: false as const };

  const refreshResult = await client.rpc("refresh_outreach_relationship_tasks");
  if (refreshResult.error) throw refreshResult.error;

  const [runs, contacts, recommendations, activitiesResult, guardrailsResult, discoveryDuplicatesResult, tasksResult, conversationTasksResult, workflowRunsResult, phase5WorkflowRunsResult, activeBatchResult, activePhase4BatchesResult, activePhase5BatchesResult, settingsResult] = await Promise.all([
    fetchAllRuns(client), fetchAllContacts(client), fetchAllRecommendations(client),
    client.from("outreach_activities").select("id,contact_id,activity_type,activity_at,evidence_source").order("activity_at", { ascending: false }),
    client.from("outreach_assist_sessions")
      .select("contact_id,skip_reason,preflight_checked_at")
      .eq("status", "skipped").not("skip_reason", "is", null)
      .order("preflight_checked_at", { ascending: false }),
    client.from("outreach_discovery_duplicates")
      .select("duplicate_reason,detected_at")
      .order("detected_at", { ascending: false }),
    client.from("outreach_relationship_tasks")
      .select("id,contact_id,task_type,status,due_at,draft_message,source,created_at")
      .in("status", ["due", "queued"]).order("due_at", { ascending: true }),
    client.from("outreach_conversation_tasks")
      .select("id,contact_id,inbound_event_id,task_type,status,due_at,inbound_message,draft_message,source,reviewed_at,created_at")
      .in("status", ["waiting", "context_required", "needs_review", "approved", "queued"]).order("due_at", { ascending: true }),
    client.from("outreach_phase4_workflow_runs")
      .select("id,workflow_type,status,last_node,checkpoint,started_at,updated_at")
      .order("started_at", { ascending: false }).limit(30),
    client.from("outreach_phase5_workflow_runs")
      .select("id,workflow_type,status,last_node,checkpoint,started_at,updated_at")
      .order("started_at", { ascending: false }).limit(30),
    client.from("outreach_assist_batches")
      .select("id,selected_count,created_at")
      .in("status", ["ready", "running", "awaiting_confirmation"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("outreach_phase4_batches")
      .select("id,action_type,selected_count,created_at")
      .in("status", ["ready", "running"]).order("created_at", { ascending: false }),
    client.from("outreach_phase5_batches")
      .select("id,action_type,selected_count,created_at")
      .in("status", ["ready", "running"]).order("created_at", { ascending: false }),
    client.from("outreach_user_settings")
      .select("user_id,display_name,professional_summary,target_roles,target_locations,target_companies,message_preferences,invitation_withdrawal_days,follow_up_grace_hours,onboarding_completed")
      .eq("user_id", session.user.id).maybeSingle(),
  ]);
  const error = activitiesResult.error ?? guardrailsResult.error ?? discoveryDuplicatesResult.error ?? tasksResult.error ?? conversationTasksResult.error ?? workflowRunsResult.error ?? phase5WorkflowRunsResult.error ?? activeBatchResult.error ?? activePhase4BatchesResult.error ?? activePhase5BatchesResult.error ?? settingsResult.error;
  if (error) throw error;

  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const runDateById = new Map(runs.map((run) => [run.id, run.run_date]));
  const latestRecommendationByContact = new Map<string, QueueItem>();
  for (const recommendation of recommendations) {
    const contact = contactsById.get(recommendation.contact_id); const runDate = runDateById.get(recommendation.run_id);
    if (!contact || !runDate) continue;
    const current = latestRecommendationByContact.get(recommendation.contact_id);
    if (!current || runDate > current.run_date || (runDate === current.run_date && recommendation.priority < current.priority)) latestRecommendationByContact.set(recommendation.contact_id, { ...recommendation, contact, run_date: runDate });
  }
  const queue = Array.from(latestRecommendationByContact.values()).sort((a, b) => b.run_date.localeCompare(a.run_date) || a.priority - b.priority);
  const fallbackRun = {
    id: "00000000-0000-0000-0000-000000000000", run_date: dateKeyInTimeZone(),
    generated_at_sgt: new Date().toISOString(), actual_hiring_managers: 0, actual_executives: 0, company_count: 0,
  } as OutreachRun;
  return { authorized: true as const, data: {
    run: runs[0] ?? fallbackRun, runs, contacts, queue,
    activities: (activitiesResult.data ?? []) as Activity[],
    guardrails: (guardrailsResult.data ?? []) as GuardrailRecord[],
    discoveryDuplicates: (discoveryDuplicatesResult.data ?? []) as DiscoveryDuplicate[],
    tasks: (tasksResult.data ?? []) as RelationshipTask[],
    conversationTasks: (conversationTasksResult.data ?? []) as ConversationTask[],
    workflowRuns: (workflowRunsResult.data ?? []) as WorkflowRun[],
    phase5WorkflowRuns: (phase5WorkflowRunsResult.data ?? []) as Phase5WorkflowRun[],
    activeBatch: activeBatchResult.data ? {
      id: activeBatchResult.data.id,
      code: activeBatchResult.data.id.replaceAll("-", "").slice(0, 8).toUpperCase(),
      selectedCount: activeBatchResult.data.selected_count,
      createdAt: activeBatchResult.data.created_at,
    } : null,
    activePhase4Batches: ((activePhase4BatchesResult.data ?? []) as { id: string; action_type: "follow_up" | "withdraw_invitation"; selected_count: number; created_at: string }[]).map((batch) => ({
      id: batch.id,
      code: batch.id.replaceAll("-", "").slice(0, 8).toUpperCase(),
      actionType: batch.action_type,
      selectedCount: batch.selected_count,
      createdAt: batch.created_at,
    })),
    activePhase5Batches: ((activePhase5BatchesResult.data ?? []) as { id: string; action_type: "proactive_follow_up" | "reply"; selected_count: number; created_at: string }[]).map((batch) => ({
      id: batch.id,
      code: batch.id.replaceAll("-", "").slice(0, 8).toUpperCase(),
      actionType: batch.action_type,
      selectedCount: batch.selected_count,
      createdAt: batch.created_at,
    })),
    settings: settingsResult.data as OutreachUserSettings | null,
  } };
}

function SignIn({ client }: { client: SupabaseClient }) {
  const [method, setMethod] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState<"magic" | "recovery" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function chooseMethod(nextMethod: "password" | "magic") { setMethod(nextMethod); setError(null); setSent(null); }
  async function signInWithPassword() {
    setBusy(true); setError(null);
    const result = await client.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (result.error) setError(friendlyAuthError(result.error.message));
  }
  async function requestLink() {
    setBusy(true); setError(null);
    const result = await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: authRedirectUrl(), shouldCreateUser: false } });
    setBusy(false);
    if (result.error) return setError(friendlyAuthError(result.error.message));
    setSent("magic");
  }
  async function requestPasswordReset() {
    if (!email.trim()) return setError("Enter your email address first.");
    setBusy(true); setError(null);
    const result = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl() });
    setBusy(false);
    if (result.error) return setError(friendlyAuthError(result.error.message));
    setSent("recovery");
  }
  return (
    <main className="gate-shell"><section className="gate-card sign-in-card" aria-labelledby="sign-in-title">
      <div className="gate-brand"><span className="gate-brand-name"><span className="brand-symbol"><Send size={18} /></span><span>Outreach</span></span><button type="button" className="gate-demo-link" onClick={enterDemoMode}><Sparkles size={13} />Demo</button></div>
      <div className="gate-icon"><LockKeyhole size={24} /></div><p className="kicker">PRIVATE WORKSPACE</p>
      <h1 id="sign-in-title">Open your workspace.</h1>
      <p className="gate-copy">Use your password or a one-time email link. Only approved accounts can access Outreach.</p>
      <div className="auth-methods" role="tablist" aria-label="Sign-in method">
        <button role="tab" aria-selected={method === "password"} className={method === "password" ? "active" : ""} onClick={() => chooseMethod("password")}><KeyRound size={14} />Password</button>
        <button role="tab" aria-selected={method === "magic"} className={method === "magic" ? "active" : ""} onClick={() => chooseMethod("magic")}><Mail size={14} />Email link</button>
      </div>
      {sent ? <><div className="email-sent" role="status"><span><Mail size={20} /></span><div><strong>Check your inbox</strong><p>{sent === "recovery" ? "Use the email to set a new password" : "Use the email link to sign in"} as {email}.</p></div></div><button className="auth-text-button sent-back" onClick={() => setSent(null)}>Back to sign in</button></> :
        <div className="gate-form"><label htmlFor="auth-email">Email address</label>
          <Input id="auth-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          {method === "password" && <><label htmlFor="auth-password">Password</label><Input id="auth-password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && email.trim() && password && void signInWithPassword()} /></>}
          {error && <p className="form-error"><CircleAlert size={14} />{error}</p>}
          {method === "password"
            ? <><Button className="gate-submit" disabled={busy || !email.trim() || !password} onClick={signInWithPassword}>{busy ? <LoaderCircle className="spin" /> : <KeyRound />}{busy ? "Signing in…" : "Sign in"}</Button><button className="auth-text-button" disabled={busy} onClick={requestPasswordReset}>Set or reset password</button></>
            : <Button className="gate-submit" disabled={busy || !email.trim()} onClick={requestLink}>{busy ? <LoaderCircle className="spin" /> : <Mail />}{busy ? "Sending link…" : "Send email link"}</Button>}
        </div>}
      <div className="gate-security"><ShieldCheck size={15} />Protected by Supabase Auth and row-level security</div>
    </section></main>
  );
}

function PasswordFields({ client, onComplete, compact = false }: { client: SupabaseClient; onComplete: () => void; compact?: boolean }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function savePassword() {
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirmation) return setError("The passwords do not match.");
    setBusy(true); setError(null);
    const result = await client.auth.updateUser({ password });
    setBusy(false);
    if (result.error) return setError(result.error.message);
    onComplete();
  }
  return <div className={compact ? "password-fields compact" : "password-fields"}>
    <label htmlFor={compact ? "dialog-new-password" : "new-password"}>New password</label>
    <Input id={compact ? "dialog-new-password" : "new-password"} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
    <label htmlFor={compact ? "dialog-confirm-password" : "confirm-password"}>Confirm password</label>
    <Input id={compact ? "dialog-confirm-password" : "confirm-password"} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Enter it again" onKeyDown={(event) => event.key === "Enter" && void savePassword()} />
    {error && <p className="form-error"><CircleAlert size={14} />{error}</p>}
    <Button className="gate-submit" disabled={busy || !password || !confirmation} onClick={savePassword}>{busy ? <LoaderCircle className="spin" /> : <KeyRound />}{busy ? "Saving…" : "Save password"}</Button>
  </div>;
}

function RecoveryPassword({ client, onComplete }: { client: SupabaseClient; onComplete: () => void }) {
  return <main className="gate-shell"><section className="gate-card" aria-labelledby="password-title">
    <div className="gate-brand"><span className="brand-symbol"><Send size={18} /></span><span>Outreach</span></div>
    <div className="gate-icon"><KeyRound size={24} /></div><p className="kicker">SECURE ACCOUNT</p>
    <h1 id="password-title">Choose your password.</h1><p className="gate-copy">After this one-time setup, use password sign-in without waiting for an email.</p>
    <PasswordFields client={client} onComplete={onComplete} />
  </section></main>;
}

function PasswordDialog({ client }: { client: SupabaseClient }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  function complete() { setSaved(true); window.setTimeout(() => { setOpen(false); setSaved(false); }, 1100); }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" variant="ghost"><KeyRound />Password</Button></DialogTrigger><DialogContent className="password-dialog">
    <DialogHeader><DialogTitle>Set account password</DialogTitle><DialogDescription>Use this password for future logins. You can still use an email link whenever you prefer.</DialogDescription></DialogHeader>
    {saved ? <div className="password-saved"><Check size={18} />Password saved</div> : <PasswordFields client={client} onComplete={complete} compact />}
  </DialogContent></Dialog>;
}

function AccessPending({ session, client }: { session: Session; client: SupabaseClient }) {
  const [copied, setCopied] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  async function copyId() { await navigator.clipboard.writeText(session.user.id); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
  async function claimInstallation() {
    setClaiming(true); setClaimError(null);
    const result = await client.rpc("claim_outreach_owner");
    setClaiming(false);
    if (result.error) return setClaimError(result.error.message);
    window.location.reload();
  }
  return <main className="gate-shell"><section className="gate-card pending-card">
    <div className="gate-brand"><span className="brand-symbol"><Send size={18} /></span><span>Outreach</span></div>
    <div className="gate-icon amber"><UserRoundCheck size={24} /></div><p className="kicker">ACCOUNT VERIFIED</p><h1>Access approval needed.</h1>
    <p className="gate-copy">You are signed in as <strong>{session.user.email}</strong>, but this account is not yet on the private dashboard allowlist.</p>
    <button className="user-code" onClick={copyId} aria-label="Copy user ID"><span><small>User ID</small><code>{session.user.id}</code></span>{copied ? <Check size={17} /> : <Copy size={17} />}</button>
    <p className="pending-note">For a new personal installation, claim ownership once. If an owner already exists, no access is granted and you can send the displayed ID to that owner.</p>
    {claimError && <p className="form-error"><CircleAlert size={14} />{claimError}</p>}
    <Button onClick={claimInstallation} disabled={claiming}>{claiming ? <LoaderCircle className="spin" /> : <ShieldCheck />}{claiming ? "Checking ownership…" : "Claim new installation"}</Button>
    <Button variant="outline" onClick={() => client.auth.signOut()}><LogOut />Sign out</Button>
  </section></main>;
}

function LoadingScreen() { return <main className="loading-shell"><span className="brand-symbol large"><Send size={20} /></span><LoaderCircle className="spin" /><p>Opening your private workspace…</p></main>; }
function StatusControl({ contact, status, busy, onChange }: { contact: Contact; status: ContactStatus; busy: boolean; onChange: (contact: Contact, status: ContactStatus) => void }) {
  return <div className={busy ? "status-control saving" : "status-control"}>{busy && <LoaderCircle className="spin" size={12} />}<select value={status} disabled={busy} onChange={(event) => onChange(contact, event.target.value as ContactStatus)} aria-label={`Update outreach status for ${contact.full_name}`}>
    <option value="not_contacted" disabled>Ready to contact</option>
    {actionableStatuses.map((option) => <option value={option} key={option}>{statusLabels[option]}</option>)}
  </select></div>;
}

function QueueRow({ item, status, guardrailReason, copiedId, expanded, busy, selected, onSelectedChange, onCopy, onToggle, onStatusChange }: {
  item: QueueItem; status: ContactStatus; copiedId: number | null; expanded: boolean; busy: boolean;
  guardrailReason: GuardrailReason | null;
  selected: boolean; onSelectedChange: (selected: boolean) => void; onCopy: (item: QueueItem) => void; onToggle: () => void;
  onStatusChange: (contact: Contact, status: ContactStatus) => void;
}) {
  const relationship = item.track === "hiring_manager" ? item.relationship_to_opening ?? "Hiring organization leader" : `${item.estimated_levels_above ?? "2–3"} levels above · ${item.seniority_band ?? "Senior executive"}`;
  return <>
    <TableRow className={expanded ? "contact-row expanded" : "contact-row"}>
      <TableCell className="select-cell"><Checkbox checked={selected} disabled={status !== "not_contacted" || Boolean(guardrailReason)} onCheckedChange={(checked) => onSelectedChange(checked === true)} aria-label={`Select ${item.contact.full_name} for a Codex batch`} /></TableCell>
      <TableCell className="rank-cell">{String(item.priority).padStart(2, "0")}</TableCell>
      <TableCell className="found-cell">{formatShortDate(item.run_date)}</TableCell>
      <TableCell className="person-cell"><strong>{item.contact.full_name}</strong><span>· {item.contact.employer}<i className="mobile-found-date"> · {formatShortDate(item.run_date)}</i></span></TableCell>
      <TableCell className="role-cell" title={item.contact.current_title ?? "Leadership contact"}>{item.contact.current_title ?? "Leadership contact"}</TableCell>
      <TableCell className="opportunity-cell" title={item.opening_title ?? "Strategic relationship"}>{item.opening_title ?? "Strategic relationship"}</TableCell>
      <TableCell><span className={`track-label track-${item.track}`}>{item.track === "hiring_manager" ? "Hiring" : "Executive"}</span></TableCell>
      <TableCell>{guardrailReason ? <span className="guardrail-badge"><ShieldCheck size={11} />{guardrailLabels[guardrailReason]}</span> : <StatusControl contact={item.contact} status={status} busy={busy} onChange={onStatusChange} />}</TableCell>
      <TableCell className="actions-cell">
        {item.contact.linkedin_profile_url.startsWith("http") && <a href={item.contact.linkedin_profile_url} target="_blank" rel="noreferrer" aria-label={`Open ${item.contact.full_name} on LinkedIn`} title="Open LinkedIn"><span className="linkedin-mark">in</span></a>}
        {(item.active_job_url || item.hiring_post_url) && <a href={item.active_job_url ?? item.hiring_post_url ?? "#"} target="_blank" rel="noreferrer" aria-label={`Open role or activity for ${item.contact.full_name}`} title="Open role or activity"><ExternalLink size={14} /></a>}
        <button onClick={() => onCopy(item)} aria-label={`Copy message for ${item.contact.full_name}`} title="Copy outreach note">{copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}</button>
        <button onClick={onToggle} aria-label={`${expanded ? "Hide" : "Show"} details for ${item.contact.full_name}`} aria-expanded={expanded} title={expanded ? "Hide details" : "Show details"}>{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
      </TableCell>
    </TableRow>
    {expanded && <TableRow className="detail-row"><TableCell colSpan={9}><div className="detail-grid">
      <div className="detail-context"><span><Sparkles size={13} />{relationship}</span><div className="mobile-status-control">{guardrailReason ? <span className="guardrail-badge"><ShieldCheck size={11} />{guardrailLabels[guardrailReason]}</span> : <StatusControl contact={item.contact} status={status} busy={busy} onChange={onStatusChange} />}</div><p><strong>Fit</strong>{item.fit_assessment}</p>{item.genuine_gap && <p><strong>Gap</strong>{item.genuine_gap}</p>}</div>
      <div className="compact-message"><MessageSquareText size={14} /><p>{item.personalized_message}</p><button onClick={() => onCopy(item)}>{copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}<span>{copiedId === item.id ? "Copied" : "Copy note"}</span></button></div>
    </div></TableCell></TableRow>}
  </>;
}

function RelationshipTaskQueue({
  title, kicker, emptyTitle, emptyCopy, tasks, contacts, selectedIds, activeBatch,
  busy, onToggle, onToggleAll, onPrepare, onCopyCommand,
}: {
  title: string; kicker: string; emptyTitle: string; emptyCopy: string;
  tasks: RelationshipTask[]; contacts: Map<string, Contact>; selectedIds: Set<number>;
  activeBatch: Phase4BatchReceipt | null; busy: boolean;
  onToggle: (id: number, checked: boolean) => void; onToggleAll: () => void;
  onPrepare: () => void; onCopyCommand: () => void;
}) {
  const [renderedAt] = useState(() => Date.now());
  const allSelected = tasks.length > 0 && tasks.every((task) => selectedIds.has(task.id));
  const label = tasks[0]?.task_type === "withdraw_invitation" ? "withdrawal" : "follow-up";
  return <Card className="queue-card relationship-task-card">
    <div className="table-toolbar"><div className="task-heading"><div><p className="kicker">{kicker}</p><h2>{title}</h2></div><span>{tasks.length} due</span></div>
      <div className="toolbar-actions">{selectedIds.size > 0
        ? <Button className="batch-button" size="sm" onClick={onPrepare} disabled={busy || selectedIds.size > 15}>{busy ? <LoaderCircle className="spin" /> : <Bot />}{busy ? "Queuing…" : `Queue ${selectedIds.size} ${label}${selectedIds.size === 1 ? "" : "s"}`}</Button>
        : activeBatch && <button className="batch-status-button" onClick={onCopyCommand}><Bot size={13} />{activeBatch.selectedCount} ready · {activeBatch.code}</button>}</div>
    </div>
    <div className="table-scroll"><Table className="task-table"><TableHeader><TableRow>
      <TableHead className="select-cell"><Checkbox checked={allSelected} disabled={!tasks.length} onCheckedChange={onToggleAll} aria-label={`Select all due ${label} tasks`} /></TableHead>
      <TableHead>Person</TableHead><TableHead>Current role</TableHead><TableHead>{label === "follow-up" ? "Message" : "Request age"}</TableHead><TableHead>Signal</TableHead><TableHead className="actions-head">LinkedIn</TableHead>
    </TableRow></TableHeader><TableBody>{tasks.map((task) => { const contact = contacts.get(task.contact_id); if (!contact) return null; const age = Math.max(0, Math.floor((renderedAt - new Date(task.due_at).getTime()) / 86400000) + 14); return <TableRow key={task.id}>
      <TableCell className="select-cell"><Checkbox checked={selectedIds.has(task.id)} disabled={task.status !== "due"} onCheckedChange={(checked) => onToggle(task.id, checked === true)} aria-label={`Select ${contact.full_name}`} /></TableCell>
      <TableCell className="person-cell"><strong>{contact.full_name}</strong><span>· {contact.employer}</span></TableCell>
      <TableCell className="role-cell">{contact.current_title ?? "Leadership contact"}</TableCell>
      <TableCell className={task.task_type === "follow_up" ? "task-message" : "task-age"}>{task.task_type === "follow_up" ? task.draft_message : `${age} days pending`}</TableCell>
      <TableCell><span className={`signal-badge signal-${task.source}`}>{task.source === "gmail_signal" ? "Gmail detected" : task.source === "system" ? "14-day rule" : "Verified"}</span></TableCell>
      <TableCell className="actions-cell"><a href={contact.linkedin_profile_url} target="_blank" rel="noreferrer" aria-label={`Open ${contact.full_name} on LinkedIn`}><span className="linkedin-mark">in</span></a></TableCell>
    </TableRow>; })}</TableBody></Table>
      {!tasks.length && <div className="followup-empty"><ListChecks size={23} /><strong>{emptyTitle}</strong><span>{emptyCopy}</span></div>}
    </div>
    <div className="table-foot"><span>{activeBatch ? `Say “${activeBatch.actionType === "follow_up" ? "Run my selected follow-up batch" : "Withdraw my selected stale invitations"} ${activeBatch.code}” in this chat` : `Select due ${label} tasks and queue one Codex batch`}</span><strong>{tasks.length} shown</strong></div>
  </Card>;
}

function ConversationTaskRow({
  task, contact, selected, busy, onToggle, onApprove, onPrepareContext,
}: {
  task: ConversationTask; contact: Contact; selected: boolean; busy: boolean;
  onToggle: (checked: boolean) => void;
  onApprove: (task: ConversationTask, message: string) => void;
  onPrepareContext: (task: ConversationTask, contact: Contact) => void;
}) {
  const [draft, setDraft] = useState(task.draft_message ?? "");
  const contextRequired = task.status === "context_required";
  const needsReview = task.status === "needs_review";
  const approved = task.status === "approved";
  const queued = task.status === "queued";
  return <div className={`conversation-task-row task-${task.task_type}`}>
    <div className="conversation-task-select">
      <Checkbox checked={selected} disabled={!approved} onCheckedChange={(checked) => onToggle(checked === true)} aria-label={`Select approved message for ${contact.full_name}`} />
    </div>
    <div className="conversation-task-person"><strong>{contact.full_name}</strong><span>{contact.current_title ?? "Leadership contact"} · {contact.employer}</span><a href={contact.linkedin_profile_url} target="_blank" rel="noreferrer"><span className="linkedin-mark">in</span>Open conversation</a></div>
    <div className="conversation-task-content">
      {task.task_type === "reply" && <div className="inbound-message"><small>Inbound message</small><p>{task.inbound_message || "LinkedIn message detected. Open the conversation with Codex to capture the complete text."}</p></div>}
      {contextRequired ? <div className="context-required"><strong>Conversation context required</strong><span>Codex will open LinkedIn, verify the latest message and prepare a reply. Nothing will be sent.</span><Button size="sm" variant="outline" onClick={() => onPrepareContext(task, contact)}><Bot />Prepare reply with Codex</Button></div>
        : <div className="draft-review"><small>{task.task_type === "reply" ? "Contextual reply draft" : "Proactive follow-up draft"}</small><textarea value={draft} disabled={!needsReview} onChange={(event) => setDraft(event.target.value)} aria-label={`Draft message for ${contact.full_name}`} />
          <div className="draft-review-actions"><span>{draft.length} characters</span>{needsReview && <Button size="sm" onClick={() => onApprove(task, draft)} disabled={busy || !draft.trim()}>{busy ? <LoaderCircle className="spin" /> : <Check />}{busy ? "Approving…" : "Approve message"}</Button>}{approved && <span className="review-state approved"><Check size={13} />Approved</span>}{queued && <span className="review-state queued"><Bot size={13} />Queued for Codex</span>}</div>
        </div>}
    </div>
  </div>;
}

function ConversationTaskQueue({
  title, kicker, emptyTitle, emptyCopy, tasks, contacts, selectedIds, activeBatch,
  busyTaskId, batchBusy, onToggle, onToggleAll, onApprove, onPrepareContext, onPrepareBatch, onCopyCommand,
}: {
  title: string; kicker: string; emptyTitle: string; emptyCopy: string;
  tasks: ConversationTask[]; contacts: Map<string, Contact>; selectedIds: Set<number>;
  activeBatch: Phase5BatchReceipt | null; busyTaskId: number | null; batchBusy: boolean;
  onToggle: (id: number, checked: boolean) => void; onToggleAll: () => void;
  onApprove: (task: ConversationTask, message: string) => void;
  onPrepareContext: (task: ConversationTask, contact: Contact) => void;
  onPrepareBatch: () => void; onCopyCommand: () => void;
}) {
  const approvedTasks = tasks.filter((task) => task.status === "approved");
  const allSelected = approvedTasks.length > 0 && approvedTasks.every((task) => selectedIds.has(task.id));
  return <Card className="queue-card conversation-task-card">
    <div className="table-toolbar"><div className="task-heading"><div><p className="kicker">{kicker}</p><h2>{title}</h2></div><span>{tasks.length} active</span></div>
      <div className="toolbar-actions">{selectedIds.size > 0
        ? <Button className="batch-button" size="sm" onClick={onPrepareBatch} disabled={batchBusy || selectedIds.size > 15}>{batchBusy ? <LoaderCircle className="spin" /> : <Bot />}{batchBusy ? "Queuing…" : `Queue ${selectedIds.size} approved`}</Button>
        : activeBatch && <button className="batch-status-button" onClick={onCopyCommand}><Bot size={13} />{activeBatch.selectedCount} ready · {activeBatch.code}</button>}</div>
    </div>
    {approvedTasks.length > 0 && <div className="conversation-select-all"><Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="Select all approved messages" /><span>Select all approved messages</span></div>}
    <div className="conversation-task-list">{tasks.map((task) => { const contact = contacts.get(task.contact_id); if (!contact) return null; return <ConversationTaskRow key={task.id} task={task} contact={contact} selected={selectedIds.has(task.id)} busy={busyTaskId === task.id} onToggle={(checked) => onToggle(task.id, checked)} onApprove={onApprove} onPrepareContext={onPrepareContext} />; })}
      {!tasks.length && <div className="followup-empty"><MessageSquareText size={23} /><strong>{emptyTitle}</strong><span>{emptyCopy}</span></div>}
    </div>
    <div className="table-foot"><span>{activeBatch ? `Say “${activeBatch.actionType === "reply" ? "Run my approved reply batch" : "Run my approved follow-up batch"} ${activeBatch.code}” in this chat` : "Review drafts first; only approved messages can be queued"}</span><strong>{tasks.length} shown</strong></div>
  </Card>;
}

function Dashboard({ data, session, client }: { data: DashboardData; session: Session; client: SupabaseClient }) {
  const [query, setQuery] = useState(""); const [copiedId, setCopiedId] = useState<number | null>(null);
  const [track, setTrack] = useState<"all" | "hiring_manager" | "executive">("hiring_manager");
  const todayKey = dateKeyInTimeZone();
  const [queueScope, setQueueScope] = useState<QueueScope>("today");
  const [rangeStart, setRangeStart] = useState(() => shiftDateKey(todayKey, -6));
  const [rangeEnd, setRangeEnd] = useState(todayKey);
  const [view, setView] = useState<"today" | "pending" | "followups" | "replies" | "conversations" | "pipeline" | "workflow">("today");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ContactStatus>>({});
  const [activities, setActivities] = useState(data.activities);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [activeBatch, setActiveBatch] = useState<BatchReceipt | null>(data.activeBatch);
  const [relationshipTasks, setRelationshipTasks] = useState(data.tasks);
  const [conversationTasks, setConversationTasks] = useState(data.conversationTasks);
  const [selectedFollowUpIds, setSelectedFollowUpIds] = useState<Set<number>>(() => new Set());
  const [selectedReplyIds, setSelectedReplyIds] = useState<Set<number>>(() => new Set());
  const [selectedWithdrawalIds, setSelectedWithdrawalIds] = useState<Set<number>>(() => new Set());
  const [activePhase4Batches, setActivePhase4Batches] = useState(data.activePhase4Batches);
  const [activePhase5Batches, setActivePhase5Batches] = useState(data.activePhase5Batches);
  const [batchBusy, setBatchBusy] = useState(false);
  const [busyConversationTaskId, setBusyConversationTaskId] = useState<number | null>(null);
  const [batchCommandCopied, setBatchCommandCopied] = useState(false);
  const [busyContactId, setBusyContactId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const statusFor = (contact: Contact) => statusOverrides[contact.id] ?? contact.connection_status;
  const guardrailByContact = useMemo(() => {
    const latest = new Map<string, GuardrailReason>();
    for (const item of data.guardrails) if (!latest.has(item.contact_id)) latest.set(item.contact_id, item.skip_reason);
    return latest;
  }, [data.guardrails]);
  const visibleGuardrailFor = (contact: Contact) => {
    const reason = guardrailByContact.get(contact.id) ?? null;
    const status = statusFor(contact);
    if (reason === "already_pending" && status !== "request_sent") return null;
    if (reason === "already_connected" && status !== "connected") return null;
    if (reason === "previously_contacted" && status !== "not_contacted") return null;
    return reason;
  };
  const readyQueue = data.queue.filter((item) => statusFor(item.contact) === "not_contacted" && !guardrailByContact.has(item.contact.id));
  const todayQueue = data.queue.filter((item) => item.run_date === todayKey);
  const recentStart = shiftDateKey(todayKey, -6);
  const recentQueue = data.queue.filter((item) => item.run_date >= recentStart && item.run_date <= todayKey);
  const scopedQueue = data.queue.filter((item) => {
    if (queueScope === "today") return item.run_date === todayKey;
    if (queueScope === "unreached") return statusFor(item.contact) === "not_contacted" && !guardrailByContact.has(item.contact.id);
    if (queueScope === "recent") return item.run_date >= recentStart && item.run_date <= todayKey;
    if (queueScope === "custom") return item.run_date >= rangeStart && item.run_date <= rangeEnd;
    return true;
  });
  const hiring = scopedQueue.filter((item) => item.track === "hiring_manager");
  const executives = scopedQueue.filter((item) => item.track === "executive");
  const actionReady = readyQueue.length;
  const sentToday = uniqueActivityCount(activities.filter((activity) => dateKeyInTimeZone(new Date(activity.activity_at)) === todayKey), ["request_sent"]);
  const missedRunDays = data.runs.length ? dayGap(data.run.run_date, todayKey) : null;
  const lastRunTime = data.runs.length ? new Date(data.run.generated_at_sgt).toLocaleString("en-SG", { timeZone: "Asia/Singapore", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never";
  const outcomesRecorded = uniqueActivityCount(activities, ["request_sent", "connected", "message_sent", "follow_up", "reply_received", "meeting_scheduled", "referral"]);
  const pipeline = [
    { label: "Recommended", value: data.contacts.length, icon: UsersRound },
    { label: "Requests sent", value: uniqueActivityCount(activities, ["request_sent"]), icon: Send },
    { label: "Connected", value: uniqueActivityCount(activities, ["connected"]), icon: UserRoundCheck },
    { label: "Messages sent", value: uniqueActivityCount(activities, ["message_sent", "follow_up"]), icon: MessageSquareText },
    { label: "Replies", value: uniqueActivityCount(activities, ["reply_received", "meeting_scheduled", "referral"]), icon: Mail },
  ];
  const pipelineMax = Math.max(...pipeline.map((item) => item.value), 1);
  const guardrailCounts = {
    total: data.guardrails.length,
    already_pending: data.guardrails.filter((item) => item.skip_reason === "already_pending").length,
    already_connected: data.guardrails.filter((item) => item.skip_reason === "already_connected").length,
    previously_contacted: data.guardrails.filter((item) => item.skip_reason === "previously_contacted").length,
  };
  const discoveryDuplicateCounts = {
    total: data.discoveryDuplicates.length,
    linkedin: data.discoveryDuplicates.filter((item) => item.duplicate_reason === "linkedin_identity").length,
    fallback: data.discoveryDuplicates.filter((item) => item.duplicate_reason === "name_employer_identity").length,
  };
  const checkedSessions = data.guardrails.length + uniqueActivityCount(activities.filter((activity) => activity.evidence_source === "browser_assisted" && !guardrailByContact.has(activity.contact_id)), ["request_sent"]);
  const companyCounts = todayQueue.reduce<Record<string, number>>((result, item) => { result[item.contact.employer] = (result[item.contact.employer] ?? 0) + 1; return result; }, {});
  const companyData = Object.entries(companyCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
  const companyMax = Math.max(...companyData.map((item) => item.value), 1);
  const normalizedQuery = query.trim().toLowerCase();
  const trackedQueue = track === "all" ? scopedQueue : track === "hiring_manager" ? hiring : executives;
  const visibleQueue = normalizedQuery ? trackedQueue.filter((item) => [item.contact.full_name, item.contact.employer, item.contact.current_title, item.opening_title].filter(Boolean).some((value) => value!.toLowerCase().includes(normalizedQuery))) : trackedQueue;
  const selectableVisibleQueue = visibleQueue.filter((item) => statusFor(item.contact) === "not_contacted" && !guardrailByContact.has(item.contact.id));
  const allVisibleSelected = selectableVisibleQueue.length > 0 && selectableVisibleQueue.every((item) => selectedIds.has(item.id));
  const contactsById = useMemo(() => new Map(data.contacts.map((contact) => [contact.id, contact])), [data.contacts]);
  const followUpTasks = conversationTasks.filter((task) => task.task_type === "proactive_follow_up" && ["needs_review", "approved", "queued"].includes(task.status) && new Date(task.due_at) <= new Date());
  const waitingFollowUpCount = conversationTasks.filter((task) => task.task_type === "proactive_follow_up" && new Date(task.due_at) > new Date()).length;
  const replyTasks = conversationTasks.filter((task) => task.task_type === "reply" && ["context_required", "needs_review", "approved", "queued"].includes(task.status));
  const withdrawalTasks = relationshipTasks.filter((task) => task.task_type === "withdraw_invitation" && task.status === "due" && new Date(task.due_at) <= new Date());
  const pendingCount = data.contacts.filter((contact) => statusFor(contact) === "request_sent").length;
  const conversations = data.contacts.filter((contact) => ["messaged", "replied", "meeting_scheduled", "referred"].includes(statusFor(contact)));
  const activeFollowUpBatch = activePhase5Batches.find((batch) => batch.actionType === "proactive_follow_up") ?? null;
  const activeReplyBatch = activePhase5Batches.find((batch) => batch.actionType === "reply") ?? null;
  const activeWithdrawalBatch = activePhase4Batches.find((batch) => batch.actionType === "withdraw_invitation") ?? null;
  async function exportWorkspace() {
    const exportPayload = {
      export_version: "outreach-v1", exported_at: new Date().toISOString(),
      contacts: data.contacts, recommendations: data.queue,
      activities, relationship_tasks: relationshipTasks, conversation_tasks: conversationTasks,
      workflow_runs: data.workflowRuns, conversation_workflow_runs: data.phase5WorkflowRuns,
      preferences: data.settings,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `outreach-export-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    URL.revokeObjectURL(url);
  }
  async function deleteWorkspace() {
    const result = await client.rpc("delete_outreach_workspace_data", { p_confirmation: "DELETE ALL OUTREACH DATA" });
    if (result.error) return result.error.message;
    window.location.reload(); return null;
  }
  async function copyMessage(item: QueueItem) { await navigator.clipboard.writeText(item.personalized_message); setCopiedId(item.id); window.setTimeout(() => setCopiedId(null), 1600); }
  function setItemSelected(itemId: number, selected: boolean) {
    setSelectedIds((current) => { const next = new Set(current); if (selected) next.add(itemId); else next.delete(itemId); return next; });
  }
  function toggleAllVisible() {
    setSelectedIds((current) => { const next = new Set(current); for (const item of selectableVisibleQueue) { if (allVisibleSelected) next.delete(item.id); else next.add(item.id); } return next; });
  }
  async function prepareBatch() {
    const orderedRecommendationIds = data.queue.filter((item) => selectedIds.has(item.id) && statusFor(item.contact) === "not_contacted" && !guardrailByContact.has(item.contact.id)).map((item) => item.id);
    if (!orderedRecommendationIds.length) return;
    if (orderedRecommendationIds.length > 15) { setActionFeedback({ type: "error", text: "A Codex batch can contain at most 15 contacts." }); return; }
    setBatchBusy(true); setActionFeedback(null);
    const result = await client.rpc("prepare_browser_assisted_batch", { p_recommendation_ids: orderedRecommendationIds });
    setBatchBusy(false);
    if (result.error) { setActionFeedback({ type: "error", text: result.error.message }); return; }
    const row = Array.isArray(result.data) ? result.data[0] as { batch_id: string; batch_code: string; selected_count: number; created_at: string } | undefined : undefined;
    if (!row) { setActionFeedback({ type: "error", text: "The Codex batch could not be prepared." }); return; }
    setActiveBatch({ id: row.batch_id, code: row.batch_code, selectedCount: row.selected_count, createdAt: row.created_at });
    setSelectedIds(new Set());
    setActionFeedback({ type: "success", text: `${row.selected_count} contacts ready for Codex · use your voice command when ready` });
    window.setTimeout(() => setActionFeedback(null), 3200);
  }
  async function copyBatchCommand() {
    if (!activeBatch) return;
    await navigator.clipboard.writeText(`Run my selected outreach batch ${activeBatch.code}`);
    setBatchCommandCopied(true); window.setTimeout(() => setBatchCommandCopied(false), 1800);
  }
  async function copyCatchUpCommand() {
    const missedCopy = missedRunDays === null ? "the missing outreach period" : `${missedRunDays} missed day${missedRunDays === 1 ? "" : "s"}`;
    await navigator.clipboard.writeText(`Run LinkedIn outreach discovery for ${missedCopy}. Find fresh contacts, deduplicate them against all prior Outreach records, and add the verified results to my dashboard. Do not send any invitations.`);
    setActionFeedback({ type: "success", text: "Catch-up command copied · run it in Codex when ready" });
    window.setTimeout(() => setActionFeedback(null), 2600);
  }
  function toggleTask(setter: Dispatch<SetStateAction<Set<number>>>, id: number, checked: boolean) {
    setter((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; });
  }
  function toggleAllTasks(setter: Dispatch<SetStateAction<Set<number>>>, tasks: RelationshipTask[], selected: Set<number>) {
    const allSelected = tasks.length > 0 && tasks.every((task) => selected.has(task.id));
    setter((current) => { const next = new Set(current); for (const task of tasks) { if (allSelected) next.delete(task.id); else next.add(task.id); } return next; });
  }
  async function prepareRelationshipBatch(actionType: "follow_up" | "withdraw_invitation") {
    const selected = actionType === "follow_up" ? selectedFollowUpIds : selectedWithdrawalIds;
    if (!selected.size) return;
    setBatchBusy(true); setActionFeedback(null);
    const result = await client.rpc("prepare_phase4_batch", { p_task_ids: Array.from(selected) });
    setBatchBusy(false);
    if (result.error) { setActionFeedback({ type: "error", text: result.error.message }); return; }
    const row = Array.isArray(result.data) ? result.data[0] as { batch_id: string; batch_code: string; action_type: "follow_up" | "withdraw_invitation"; selected_count: number; created_at: string } | undefined : undefined;
    if (!row) return setActionFeedback({ type: "error", text: "The Codex batch could not be prepared." });
    const receipt: Phase4BatchReceipt = { id: row.batch_id, code: row.batch_code, actionType: row.action_type, selectedCount: row.selected_count, createdAt: row.created_at };
    setActivePhase4Batches((current) => [receipt, ...current.filter((batch) => batch.actionType !== actionType)]);
    setRelationshipTasks((current) => current.map((task) => selected.has(task.id) ? { ...task, status: "queued" } : task));
    if (actionType === "follow_up") setSelectedFollowUpIds(new Set()); else setSelectedWithdrawalIds(new Set());
    setActionFeedback({ type: "success", text: `${row.selected_count} ${actionType === "follow_up" ? "follow-ups" : "withdrawals"} ready for Codex · one voice command runs the batch` });
    window.setTimeout(() => setActionFeedback(null), 3200);
  }
  async function copyPhase4Command(batch: Phase4BatchReceipt | null) {
    if (!batch) return;
    const command = batch.actionType === "follow_up" ? "Run my selected follow-up batch" : "Withdraw my selected stale invitations";
    await navigator.clipboard.writeText(`${command} ${batch.code}`);
    setActionFeedback({ type: "success", text: "Codex command copied" });
    window.setTimeout(() => setActionFeedback(null), 1800);
  }
  function toggleAllConversationTasks(tasks: ConversationTask[], selected: Set<number>, setter: Dispatch<SetStateAction<Set<number>>>) {
    const approved = tasks.filter((task) => task.status === "approved");
    const allSelected = approved.length > 0 && approved.every((task) => selected.has(task.id));
    setter((current) => { const next = new Set(current); for (const task of approved) { if (allSelected) next.delete(task.id); else next.add(task.id); } return next; });
  }
  async function approveConversationTask(task: ConversationTask, message: string) {
    setBusyConversationTaskId(task.id); setActionFeedback(null);
    const result = await client.rpc("approve_phase5_draft", { p_task_id: task.id, p_approved_message: message });
    setBusyConversationTaskId(null);
    if (result.error) return setActionFeedback({ type: "error", text: result.error.message });
    setConversationTasks((current) => current.map((item) => item.id === task.id ? { ...item, draft_message: message.trim(), status: "approved", reviewed_at: new Date().toISOString() } : item));
    setActionFeedback({ type: "success", text: "Message approved · select it when you are ready to create the Codex batch" });
    window.setTimeout(() => setActionFeedback(null), 2800);
  }
  async function prepareReplyContext(task: ConversationTask, contact: Contact) {
    const command = `Prepare my LinkedIn reply for ${contact.full_name} using conversation task ${task.id}. Read the current conversation and save a draft for my review. Do not send it.`;
    await navigator.clipboard.writeText(command);
    setActionFeedback({ type: "success", text: `Reply-preparation command copied for ${contact.full_name}` });
    window.setTimeout(() => setActionFeedback(null), 2400);
  }
  async function preparePhase5Batch(actionType: "proactive_follow_up" | "reply") {
    const selected = actionType === "reply" ? selectedReplyIds : selectedFollowUpIds;
    if (!selected.size) return;
    setBatchBusy(true); setActionFeedback(null);
    const result = await client.rpc("prepare_phase5_batch", { p_task_ids: Array.from(selected) });
    setBatchBusy(false);
    if (result.error) return setActionFeedback({ type: "error", text: result.error.message });
    const row = Array.isArray(result.data) ? result.data[0] as { batch_id: string; batch_code: string; action_type: "proactive_follow_up" | "reply"; selected_count: number; created_at: string } | undefined : undefined;
    if (!row) return setActionFeedback({ type: "error", text: "The approved-message batch could not be prepared." });
    const receipt: Phase5BatchReceipt = { id: row.batch_id, code: row.batch_code, actionType: row.action_type, selectedCount: row.selected_count, createdAt: row.created_at };
    setActivePhase5Batches((current) => [receipt, ...current.filter((batch) => batch.actionType !== actionType)]);
    setConversationTasks((current) => current.map((task) => selected.has(task.id) ? { ...task, status: "queued" } : task));
    if (actionType === "reply") setSelectedReplyIds(new Set()); else setSelectedFollowUpIds(new Set());
    setActionFeedback({ type: "success", text: `${row.selected_count} approved ${actionType === "reply" ? "replies" : "follow-ups"} ready for Codex` });
    window.setTimeout(() => setActionFeedback(null), 3000);
  }
  async function copyPhase5Command(batch: Phase5BatchReceipt | null) {
    if (!batch) return;
    const command = batch.actionType === "reply" ? "Run my approved reply batch" : "Run my approved follow-up batch";
    await navigator.clipboard.writeText(`${command} ${batch.code}`);
    setActionFeedback({ type: "success", text: "Codex command copied" });
    window.setTimeout(() => setActionFeedback(null), 1800);
  }
  async function recordStatus(contact: Contact, nextStatus: ContactStatus) {
    if (nextStatus === "not_contacted" || nextStatus === statusFor(contact)) return;
    setBusyContactId(contact.id); setActionFeedback(null);
    const result = await client.rpc("record_outreach_activity", { p_contact_id: contact.id, p_activity_type: activityForStatus[nextStatus], p_note: null });
    setBusyContactId(null);
    if (result.error) { setActionFeedback({ type: "error", text: result.error.message }); return; }
    const event = Array.isArray(result.data) ? result.data[0] as { activity_id: number; activity_at: string } | undefined : undefined;
    setStatusOverrides((current) => ({ ...current, [contact.id]: nextStatus }));
    setSelectedIds((current) => { const next = new Set(current); const recommendation = data.queue.find((item) => item.contact_id === contact.id); if (recommendation) next.delete(recommendation.id); return next; });
    if (event) setActivities((current) => [{ id: event.activity_id, contact_id: contact.id, activity_type: activityForStatus[nextStatus], activity_at: event.activity_at, evidence_source: "manual" }, ...current]);
    if (nextStatus === "connected") {
      await client.rpc("refresh_outreach_relationship_tasks");
      const [taskResult, conversationTaskResult] = await Promise.all([
        client.from("outreach_relationship_tasks").select("id,contact_id,task_type,status,due_at,draft_message,source,created_at").in("status", ["due", "queued"]).order("due_at", { ascending: true }),
        client.from("outreach_conversation_tasks").select("id,contact_id,inbound_event_id,task_type,status,due_at,inbound_message,draft_message,source,reviewed_at,created_at").in("status", ["waiting", "context_required", "needs_review", "approved", "queued"]).order("due_at", { ascending: true }),
      ]);
      if (!taskResult.error) setRelationshipTasks((taskResult.data ?? []) as RelationshipTask[]);
      if (!conversationTaskResult.error) setConversationTasks((conversationTaskResult.data ?? []) as ConversationTask[]);
    }
    setActionFeedback({ type: "success", text: `${contact.full_name} · ${statusLabels[nextStatus]}` });
    window.setTimeout(() => setActionFeedback(null), 2200);
  }
  const scopeLabel = queueScope === "today" ? "today" : queueScope === "unreached" ? "unreached" : queueScope === "recent" ? "from the last 7 days" : queueScope === "custom" ? `${formatShortDate(rangeStart)}–${formatShortDate(rangeEnd)}` : "across all dates";
  const emptyTitle = normalizedQuery ? "No matching targets" : queueScope === "today" ? "No outreach generated today" : queueScope === "unreached" ? "No unreached contacts" : "No contacts in this date view";
  const emptyCopy = normalizedQuery ? "Try a different name, company, or role." : queueScope === "today" ? "Your earlier contacts are preserved. Open Unreached to continue, or use Catch up if the automation was missed." : queueScope === "unreached" ? "Every discovered contact has already been handled." : "Choose another date view or custom range.";
  return <div className="product-shell"><header className="product-header"><div className="header-inner">
    <div className="product-brand"><span className="brand-symbol"><Send size={17} /></span><div><strong>Outreach</strong><small>RELATIONSHIP WORKSPACE</small></div></div>
    <div className="header-status"><ShieldCheck size={15} /><span>Private · verified data</span></div>
    <div className="account-menu"><span>{session.user.email}</span><Button size="sm" variant="ghost" onClick={enterDemoMode}><Sparkles />Demo</Button><PrivacyDialog onExport={exportWorkspace} onDelete={deleteWorkspace} /><PasswordDialog client={client} /><Button size="sm" variant="ghost" onClick={() => client.auth.signOut()}><LogOut />Sign out</Button></div>
  </div></header>
  <main className="workspace">
    <section className="workspace-bar"><div className="run-context"><p className="kicker">OUTREACH QUEUE</p><div><strong>{formatDate(todayKey)}</strong><span>{todayQueue.length ? `${todayQueue.length} verified contacts found today` : data.runs.length ? `No run today · latest was ${formatShortDate(data.run.run_date)}` : "No automation runs recorded yet"}</span></div></div><div className="summary-pills" aria-label="Outreach summary"><button type="button" onClick={() => { setView("today"); setQueueScope("today"); }}><b>{todayQueue.length}</b> found today</button><button type="button" className="ready" onClick={() => { setView("today"); setQueueScope("unreached"); }}><b>{actionReady}</b> unreached</button><span><b>{sentToday}</b> sent today</span></div></section>
    <Tabs value={view} onValueChange={(value) => setView(value as typeof view)} className="workspace-tabs">
      <TabsList className="view-tabs"><TabsTrigger value="today"><BriefcaseBusiness size={14} />Today&apos;s outreach</TabsTrigger><TabsTrigger value="pending"><Clock3 size={14} />Pending <span>{pendingCount}</span></TabsTrigger><TabsTrigger value="replies"><Mail size={14} />Replies <span>{replyTasks.length}</span></TabsTrigger><TabsTrigger value="followups"><MessageSquareText size={14} />Follow-ups <span>{followUpTasks.length}</span></TabsTrigger><TabsTrigger value="conversations"><UsersRound size={14} />Relationships <span>{conversations.length}</span></TabsTrigger><TabsTrigger value="pipeline"><BarChart3 size={14} />Pipeline</TabsTrigger><TabsTrigger value="workflow"><GitPullRequest size={14} />Workflow</TabsTrigger></TabsList>
      {actionFeedback && <div className={`action-feedback ${actionFeedback.type}`} role="status">{actionFeedback.type === "success" ? <Check size={13} /> : <CircleAlert size={13} />}{actionFeedback.text}</div>}
      <TabsContent value="today" className="view-panel"><Card className="queue-card compact-queue"><div className="queue-scope-bar"><div className="queue-scope-filter" role="group" aria-label="Choose outreach date view">
        <button className={queueScope === "today" ? "active" : ""} onClick={() => setQueueScope("today")}>Today <span>{todayQueue.length}</span></button>
        <button className={queueScope === "unreached" ? "active" : ""} onClick={() => setQueueScope("unreached")}>Unreached <span>{actionReady}</span></button>
        <button className={queueScope === "recent" ? "active" : ""} onClick={() => setQueueScope("recent")}>Recent 7 days <span>{recentQueue.length}</span></button>
        <button className={queueScope === "all" ? "active" : ""} onClick={() => setQueueScope("all")}>All <span>{data.queue.length}</span></button>
        <button className={queueScope === "custom" ? "active calendar" : "calendar"} onClick={() => setQueueScope("custom")}><CalendarDays size={13} />Dates</button>
      </div><div className={missedRunDays === 0 ? "automation-health current" : "automation-health delayed"}><span><i />Last run {lastRunTime}</span>{missedRunDays !== 0 && <button type="button" onClick={() => void copyCatchUpCommand()}><RefreshCw size={12} />Catch up</button>}</div></div>
      {queueScope === "custom" && <div className="date-range-bar"><span>Found between</span><Input type="date" value={rangeStart} max={rangeEnd} onChange={(event) => { if (event.target.value) setRangeStart(event.target.value); }} aria-label="Outreach start date" /><span>and</span><Input type="date" value={rangeEnd} min={rangeStart} max={todayKey} onChange={(event) => { if (event.target.value) setRangeEnd(event.target.value); }} aria-label="Outreach end date" /><strong>{scopedQueue.length} contacts</strong></div>}
      <div className="table-toolbar"><div className="track-filter" role="group" aria-label="Filter outreach track">
        <button className={track === "all" ? "active" : ""} onClick={() => setTrack("all")}>All <span>{scopedQueue.length}</span></button>
        <button className={track === "hiring_manager" ? "active" : ""} onClick={() => setTrack("hiring_manager")}>Hiring <span>{hiring.length}</span></button>
        <button className={track === "executive" ? "active" : ""} onClick={() => setTrack("executive")}>Executives <span>{executives.length}</span></button>
      </div><div className="toolbar-actions">{selectedIds.size > 0 ? <Button className="batch-button" size="sm" onClick={prepareBatch} disabled={batchBusy || selectedIds.size > 15}>{batchBusy ? <LoaderCircle className="spin" /> : <Bot />}{batchBusy ? "Queuing…" : `Queue ${selectedIds.size} for Codex`}</Button> : activeBatch && <button className="batch-status-button" onClick={copyBatchCommand} title="Copy the Codex voice command"><Bot size={13} />{batchCommandCopied ? "Command copied" : `${activeBatch.selectedCount} ready for Codex`}</button>}<div className="queue-search"><Search size={14} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, company or role" aria-label="Search shortlist" /></div></div></div>
      <div className="table-scroll"><Table className="outreach-table live-outreach-table"><TableHeader><TableRow><TableHead className="select-cell"><Checkbox checked={allVisibleSelected} disabled={!selectableVisibleQueue.length} onCheckedChange={toggleAllVisible} aria-label="Select all visible ready contacts" /></TableHead><TableHead className="rank-cell">#</TableHead><TableHead className="found-cell">Found</TableHead><TableHead>Person</TableHead><TableHead>Current role</TableHead><TableHead>Opportunity / purpose</TableHead><TableHead>Track</TableHead><TableHead>Status</TableHead><TableHead className="actions-head">Actions</TableHead></TableRow></TableHeader><TableBody>
        {visibleQueue.map((item) => <QueueRow key={item.id} item={item} status={statusFor(item.contact)} guardrailReason={visibleGuardrailFor(item.contact)} selected={selectedIds.has(item.id)} onSelectedChange={(selected) => setItemSelected(item.id, selected)} copiedId={copiedId} expanded={expandedId === item.id} busy={busyContactId === item.contact.id} onCopy={copyMessage} onStatusChange={recordStatus} onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)} />)}
      </TableBody></Table>{!visibleQueue.length && <div className="no-results"><Search size={20} /><strong>{emptyTitle}</strong><span>{emptyCopy}</span></div>}</div>
      <div className="table-foot"><span>{selectedIds.size ? `${selectedIds.size} selected · click Queue for Codex` : activeBatch ? `${activeBatch.selectedCount} ready · say “Run my selected outreach batch” when you want Codex to send them` : "Select any ready contacts, or select all visible, to create one Codex batch"}</span><strong>{visibleQueue.length} shown {scopeLabel}</strong></div></Card></TabsContent>
      <TabsContent value="pending" className="view-panel"><RelationshipTaskQueue title="Stale requests ready to withdraw" kicker="14-DAY INVITATION CONTROL" emptyTitle="No stale invitations" emptyCopy={`${pendingCount} requests are pending, but none have reached 14 days.`} tasks={withdrawalTasks} contacts={contactsById} selectedIds={selectedWithdrawalIds} activeBatch={activeWithdrawalBatch} busy={batchBusy} onToggle={(id, checked) => toggleTask(setSelectedWithdrawalIds, id, checked)} onToggleAll={() => toggleAllTasks(setSelectedWithdrawalIds, withdrawalTasks, selectedWithdrawalIds)} onPrepare={() => void prepareRelationshipBatch("withdraw_invitation")} onCopyCommand={() => void copyPhase4Command(activeWithdrawalBatch)} /></TabsContent>
      <TabsContent value="replies" className="view-panel"><ConversationTaskQueue title="Inbound messages awaiting a contextual reply" kicker="INBOUND RESPONSE QUEUE" emptyTitle="No replies waiting" emptyCopy="When a connected person messages you, the generic follow-up is cancelled and the conversation appears here." tasks={replyTasks} contacts={contactsById} selectedIds={selectedReplyIds} activeBatch={activeReplyBatch} busyTaskId={busyConversationTaskId} batchBusy={batchBusy} onToggle={(id, checked) => toggleTask(setSelectedReplyIds, id, checked)} onToggleAll={() => toggleAllConversationTasks(replyTasks, selectedReplyIds, setSelectedReplyIds)} onApprove={(task, message) => void approveConversationTask(task, message)} onPrepareContext={(task, contact) => void prepareReplyContext(task, contact)} onPrepareBatch={() => void preparePhase5Batch("reply")} onCopyCommand={() => void copyPhase5Command(activeReplyBatch)} /></TabsContent>
      <TabsContent value="followups" className="view-panel"><ConversationTaskQueue title="Silent acceptances ready for a personalized follow-up" kicker="SIX-HOUR GRACE WINDOW" emptyTitle="No proactive follow-ups due" emptyCopy={waitingFollowUpCount ? `${waitingFollowUpCount} accepted connection${waitingFollowUpCount === 1 ? " is" : "s are"} still inside the six-hour response window.` : "An accepted connection with no inbound message will appear here after six hours."} tasks={followUpTasks} contacts={contactsById} selectedIds={selectedFollowUpIds} activeBatch={activeFollowUpBatch} busyTaskId={busyConversationTaskId} batchBusy={batchBusy} onToggle={(id, checked) => toggleTask(setSelectedFollowUpIds, id, checked)} onToggleAll={() => toggleAllConversationTasks(followUpTasks, selectedFollowUpIds, setSelectedFollowUpIds)} onApprove={(task, message) => void approveConversationTask(task, message)} onPrepareContext={(task, contact) => void prepareReplyContext(task, contact)} onPrepareBatch={() => void preparePhase5Batch("proactive_follow_up")} onCopyCommand={() => void copyPhase5Command(activeFollowUpBatch)} /></TabsContent>
      <TabsContent value="conversations" className="view-panel"><Card className="queue-card followup-card"><div className="followup-heading"><div><p className="kicker">ACTIVE RELATIONSHIPS</p><h2>Messages, replies, meetings and referrals</h2></div><span>{conversations.length} active</span></div><div className="followup-list">{conversations.map((contact) => { const currentStatus = statusFor(contact); const latest = activities.find((activity) => activity.contact_id === contact.id); return <div className="followup-row" key={contact.id}><div className="followup-person"><strong>{contact.full_name}</strong><span>{contact.current_title ?? "Leadership contact"} · {contact.employer}</span></div><div className="next-action"><small>Next action</small><strong>{nextActionLabels[currentStatus] ?? "Continue relationship"}</strong>{latest && <span>Updated {new Date(latest.activity_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}</div><StatusControl contact={contact} status={currentStatus} busy={busyContactId === contact.id} onChange={recordStatus} /><a className="followup-linkedin" href={contact.linkedin_profile_url} target="_blank" rel="noreferrer"><span className="linkedin-mark">in</span>Open profile</a></div>; })}{!conversations.length && <div className="followup-empty"><MessageSquareText size={23} /><strong>No active conversations</strong><span>Confirmed follow-ups will appear here.</span></div>}</div></Card></TabsContent>
      <TabsContent value="pipeline" className="view-panel"><section className="pipeline-layout">
        <Card className="analytics-card funnel-card"><div className="analytics-heading"><div><p className="kicker">DATABASE-RECORDED FUNNEL</p><h2>Relationship progress</h2></div><span>All time</span></div><div className="funnel-list">{pipeline.map((item) => <div className="funnel-row" key={item.label}><span><item.icon size={14} />{item.label}</span><div><i style={{ width: `${Math.max((item.value / pipelineMax) * 100, item.value ? 4 : 0)}%` }} /></div><strong>{item.value}</strong><small>{pipeline[0].value ? `${Math.round((item.value / pipeline[0].value) * 100)}%` : "0%"}</small></div>)}</div>{!outcomesRecorded && <div className="honesty-note"><CircleAlert size={15} /><span>No outreach outcomes have been logged yet. The dashboard does not infer activity from LinkedIn.</span></div>}</Card>
        <div className="side-analytics"><Card className="analytics-card guardrail-card"><div className="analytics-heading"><div><p className="kicker">DUPLICATE GUARDRAILS</p><h2>Historical matches caught</h2></div><span>{guardrailCounts.total + discoveryDuplicateCounts.total} protected</span></div><div className="guardrail-summary"><div><strong>{guardrailCounts.already_pending}</strong><span>Already pending</span></div><div><strong>{guardrailCounts.already_connected}</strong><span>Already connected</span></div><div><strong>{guardrailCounts.previously_contacted}</strong><span>Previously contacted</span></div></div><div className="discovery-guardrail"><span><ShieldCheck size={13} />Scheduled duplicates removed</span><strong>{discoveryDuplicateCounts.total}</strong><small>{discoveryDuplicateCounts.linkedin} LinkedIn · {discoveryDuplicateCounts.fallback} name/company</small></div><p className="guardrail-rate"><ShieldCheck size={14} />{checkedSessions ? `${Math.round((guardrailCounts.total / checkedSessions) * 100)}% of browser-checked contacts were protected from a duplicate send.` : "No browser preflights recorded yet."}</p></Card>
        <Card className="analytics-card company-card"><div className="analytics-heading"><div><p className="kicker">COMPANY MIX</p><h2>Today&apos;s shortlist</h2></div><span>{Object.keys(companyCounts).length} companies</span></div><div className="company-list">{companyData.map((company) => <div className="company-item" key={company.name}><div><span>{company.name}</span><strong>{company.value}</strong></div><div className="company-track"><i style={{ width: `${(company.value / companyMax) * 100}%` }} /></div></div>)}</div></Card></div>
      </section></TabsContent>
      <TabsContent value="workflow" className="view-panel"><Card className="queue-card workflow-card"><div className="followup-heading"><div><p className="kicker">DURABLE ORCHESTRATION</p><h2>Relationship workflow checkpoints</h2></div><span>{data.phase5WorkflowRuns.length + data.workflowRuns.length} recent</span></div><div className="workflow-list">{[...data.phase5WorkflowRuns, ...data.workflowRuns].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 30).map((run) => <div className="workflow-row" key={run.id}><span className={`workflow-state state-${run.status}`}>{run.status.replaceAll("_", " ")}</span><div><strong>{run.workflow_type.replaceAll("_", " ")}</strong><small>{run.last_node.replaceAll("_", " ")}</small></div><time>{new Date(run.updated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div>)}</div><div className="workflow-note"><RefreshCw size={14} /><span>Gmail routes acceptances and inbound-message signals. Replies always supersede proactive follow-ups; every message still requires your review.</span></div></Card></TabsContent>
    </Tabs>
  </main></div>;
}

const syntheticQueue = [
  { rank: "01", name: "Avery Chen", company: "Northstar Labs", role: "Director, Applied AI", opportunity: "Senior fraud analytics leadership", track: "Hiring", status: "Ready" },
  { rank: "02", name: "Jordan Patel", company: "Harbor Systems", role: "VP, Risk Platforms", opportunity: "AI risk strategy and platform modernization", track: "Executive", status: "Ready" },
  { rank: "03", name: "Morgan Rivera", company: "Atlas Finance", role: "Head of Decision Science", opportunity: "Principal decision science opening", track: "Hiring", status: "Pending" },
  { rank: "04", name: "Taylor Brooks", company: "Juniper Data", role: "SVP, Data & Intelligence", opportunity: "Strategic analytics relationship", track: "Executive", status: "Connected" },
  { rank: "05", name: "Casey Williams", company: "Summit Cloud", role: "Director, Trust Engineering", opportunity: "Fraud and identity leadership", track: "Hiring", status: "Reply due" },
  { rank: "06", name: "Riley Thompson", company: "Cedar Technologies", role: "GM, Financial Services", opportunity: "Financial-services AI transformation", track: "Executive", status: "Ready" },
];

function DemoExperience() {
  return <div className="product-shell demo-product"><header className="product-header"><div className="header-inner">
    <div className="product-brand"><span className="brand-symbol"><Send size={17} /></span><div><strong>Outreach</strong><small>RELATIONSHIP WORKSPACE</small></div></div>
    <div className="header-status demo-header-status"><Sparkles size={14} /><span>Synthetic · safe preview</span></div>
    <div className="account-menu demo-account-menu"><WorkspaceConnectionDialog /></div>
  </div></header>
  <main className="workspace demo-workspace">
    <div className="demo-workspace-note"><ShieldCheck size={14} /><span><strong>Explore freely.</strong> This professional preview uses sample people and companies only. Nothing is connected or sent.</span></div>
    <section className="workspace-bar"><div className="run-context"><p className="kicker">TODAY&apos;S OUTREACH</p><div><strong>Aug 28, 2026</strong><span>6 verified sample contacts across 6 companies</span></div></div><div className="summary-pills" aria-label="Synthetic outreach summary"><span><b>3</b> hiring</span><span><b>3</b> executives</span><span className="ready"><b>3</b> ready</span><span><b>4</b> outcomes</span></div></section>
    <Tabs defaultValue="today" className="workspace-tabs">
      <TabsList className="view-tabs"><TabsTrigger value="today"><BriefcaseBusiness size={14} />Today&apos;s outreach</TabsTrigger><TabsTrigger value="pending"><Clock3 size={14} />Pending <span>2</span></TabsTrigger><TabsTrigger value="replies"><Mail size={14} />Replies <span>1</span></TabsTrigger><TabsTrigger value="relationships"><UsersRound size={14} />Relationships <span>2</span></TabsTrigger><TabsTrigger value="pipeline"><BarChart3 size={14} />Pipeline</TabsTrigger><TabsTrigger value="workflow"><GitPullRequest size={14} />Workflow</TabsTrigger></TabsList>
      <TabsContent value="today" className="view-panel"><Card className="queue-card compact-queue demo-panel"><div className="followup-heading today-panel-heading"><div><p className="kicker">PRIORITY QUEUE</p><h2>Today&apos;s outreach</h2></div><span>6 contacts</span></div><div className="table-toolbar"><div className="track-filter" aria-label="Demo filters"><button className="active">All <span>6</span></button><button>Hiring <span>3</span></button><button>Executives <span>3</span></button></div><div className="toolbar-actions"><span className="demo-readonly"><LockKeyhole size={12} />Preview only</span><div className="queue-search"><Search size={14} /><Input readOnly placeholder="Search sample contacts" aria-label="Search sample contacts" /></div></div></div>
        <div className="table-scroll"><Table className="outreach-table demo-outreach-table"><TableHeader><TableRow><TableHead className="select-cell"><Checkbox disabled aria-label="Demo selection disabled" /></TableHead><TableHead className="rank-cell">#</TableHead><TableHead>Person</TableHead><TableHead>Current role</TableHead><TableHead>Opportunity / purpose</TableHead><TableHead>Track</TableHead><TableHead>Status</TableHead><TableHead className="actions-head">Next step</TableHead></TableRow></TableHeader><TableBody>
          {syntheticQueue.map((person) => { const statusClass = person.status.toLowerCase().replace(" ", "-"); const nextStep = person.status === "Ready" ? "Select for batch" : person.status === "Pending" ? "Wait" : person.status === "Connected" ? "Follow up" : "Review reply"; return <TableRow className="contact-row" key={person.name}><TableCell className="select-cell"><Checkbox disabled aria-label={`${person.name} is sample data`} /></TableCell><TableCell className="rank-cell">{person.rank}</TableCell><TableCell className="person-cell"><strong>{person.name}</strong><span>{person.company}</span></TableCell><TableCell className="role-cell">{person.role}</TableCell><TableCell className="opportunity-cell">{person.opportunity}</TableCell><TableCell><span className={`track-label ${person.track === "Hiring" ? "track-hiring_manager" : "track-executive"}`}>{person.track}</span></TableCell><TableCell><span className={`demo-status status-${statusClass}`}>{person.status}</span></TableCell><TableCell className="actions-cell"><span className={`demo-next next-${statusClass}`}><span className="desktop-next-label">{nextStep}</span><span className="mobile-next-label">{person.status === "Ready" ? "Select" : person.status === "Reply due" ? "Review" : nextStep}</span></span></TableCell></TableRow>; })}
        </TableBody></Table></div><div className="table-foot"><span>Connect a private workspace when you are ready to use your own verified contacts.</span><strong>6 sample contacts</strong></div></Card></TabsContent>
      <TabsContent value="pending" className="view-panel"><Card className="queue-card demo-panel"><div className="followup-heading"><div><p className="kicker">INVITATION CONTROL</p><h2>Pending relationships</h2></div><span>Sample data</span></div><div className="demo-panel-list"><div><Clock3 /><span><strong>Morgan Rivera</strong><small>Pending 9 days · keep waiting</small></span><b>9d</b></div><div><Clock3 /><span><strong>Jamie Lee</strong><small>Pending 15 days · review withdrawal</small></span><b>15d</b></div></div></Card></TabsContent>
      <TabsContent value="replies" className="view-panel"><Card className="queue-card demo-panel"><div className="followup-heading"><div><p className="kicker">REVIEW REQUIRED</p><h2>Inbound replies</h2></div><span>1 waiting</span></div><div className="demo-panel-list"><div><Mail /><span><strong>Casey Williams</strong><small>Asked to continue the conversation next week</small></span><b>Review</b></div></div></Card></TabsContent>
      <TabsContent value="relationships" className="view-panel"><Card className="queue-card demo-panel"><div className="followup-heading"><div><p className="kicker">ACTIVE RELATIONSHIPS</p><h2>Conversations and next actions</h2></div><span>2 active</span></div><div className="demo-panel-list"><div><UsersRound /><span><strong>Taylor Brooks</strong><small>Connected · draft a thoughtful first follow-up</small></span><b>Follow up</b></div><div><UsersRound /><span><strong>Casey Williams</strong><small>Replied · review visible conversation context</small></span><b>Reply</b></div></div></Card></TabsContent>
      <TabsContent value="pipeline" className="view-panel"><Card className="queue-card demo-panel"><div className="followup-heading"><div><p className="kicker">VERIFIED OUTCOMES</p><h2>Relationship pipeline</h2></div><span>Sample data</span></div><div className="demo-funnel"><div className="demo-funnel-head"><span>Stage</span><span>Progress</span><strong>Total</strong></div><div><span>Recommended</span><i><b style={{ width: "100%" }} /></i><strong>24</strong></div><div><span>Requests sent</span><i><b style={{ width: "58%" }} /></i><strong>14</strong></div><div><span>Connected</span><i><b style={{ width: "33%" }} /></i><strong>8</strong></div><div><span>Replied</span><i><b style={{ width: "17%" }} /></i><strong>4</strong></div><div><span>Meetings</span><i><b style={{ width: "8%" }} /></i><strong>2</strong></div></div></Card></TabsContent>
      <TabsContent value="workflow" className="view-panel"><Card className="queue-card demo-panel"><div className="followup-heading"><div><p className="kicker">HUMAN-SUPERVISED WORKFLOW</p><h2>Every action stays visible</h2></div><span>Preview</span></div><div className="demo-workflow-grid"><div><b>1</b><span><strong>Discover</strong><small>Deduplicate known relationships.</small></span></div><div><b>2</b><span><strong>Approve</strong><small>You select the exact people.</small></span></div><div><b>3</b><span><strong>Verify</strong><small>Visible LinkedIn state is checked.</small></span></div><div><b>4</b><span><strong>Record</strong><small>Only confirmed outcomes are saved.</small></span></div></div></Card></TabsContent>
    </Tabs>
  </main></div>;
}

export default function Home() {
  const demoMode = isDemoMode();
  const [session, setSession] = useState<Session | null>(null); const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [data, setData] = useState<DashboardData | null>(null); const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<OutreachUserSettings | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(() => window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery"));
  function finishPasswordRecovery() { window.history.replaceState({}, "", authRedirectUrl()); setPasswordRecovery(false); }
  useEffect(() => {
    if (!supabase) return; let active = true;
    async function resolveSession(nextSession: Session | null) {
      if (!active) return; setSession(nextSession); setAuthorized(null); setData(null); setSettings(null); setError(null); if (!nextSession || !supabase) return;
      try { const result = await loadDashboard(supabase, nextSession); if (!active) return; setAuthorized(result.authorized); if (result.authorized) { setData(result.data); setSettings(result.data.settings); } }
      catch (loadError) { if (!active) return; setError(loadError instanceof Error ? loadError.message : "The private workspace could not be opened."); setAuthorized(false); }
    }
    void supabase.auth.getSession().then(({ data: authData }) => resolveSession(authData.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => { if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true); window.setTimeout(() => void resolveSession(nextSession), 0); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  if (demoMode) return <DemoExperience />;
  if (!supabase) return <WorkspaceConnectionGate />;
  if (!session) return <SignIn client={supabase} />;
  if (passwordRecovery) return <RecoveryPassword client={supabase} onComplete={finishPasswordRecovery} />;
  if (authorized === null) return <LoadingScreen />;
  if (!authorized || !data) return error
    ? <main className="gate-shell"><section className="gate-card pending-card"><div className="gate-icon amber"><CircleAlert size={24} /></div><p className="kicker">WORKSPACE ERROR</p><h1>We could not open the dashboard.</h1><p className="gate-copy">{error}</p><Button variant="outline" onClick={() => supabase.auth.signOut()}><LogOut />Sign out</Button></section></main>
    : <AccessPending session={session} client={supabase} />;
  if (!settings?.onboarding_completed) return <ProfileSetup session={session} client={supabase} settings={settings} onComplete={setSettings} />;
  return <Dashboard data={{ ...data, settings }} session={session} client={supabase} />;
}
