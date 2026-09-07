"use client";

import {
  useCallback,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Ban,
  X,
  FileText,
  Play,
  TriangleAlert,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  History,
  LoaderCircle,
  MessageSquareOff,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  applyDemoCommand,
  createDemoControlCenter,
  currentAction,
  inboxNeedsAction,
  peopleFilterOptions,
  peopleFilterGroups,
  peoplePriority,
  matchesPeopleFocus,
  canSelectOutreach,
  intentLabels,
  personStage,
  projectControlCenter,
} from "@/lib/control-center.mjs";
import { workspaceCapabilities, canRunWorkspaceCommand } from "@/lib/workspace-capabilities.mjs";
import { findSavedQueue, saveConnectionQueue } from "@/lib/queue-save.mjs";
import { opportunityDetails, conversationEvidence, readEvidenceRows, readDeliveryEvidence, sourceContext } from "@/lib/person-evidence.mjs";
import { projectRelationships } from "@/lib/relationship-projection.mjs";
import { invitationMessage, manualPersonStatus } from "@/lib/manual-queue.mjs";
import { ManualQueue, PersonMessage, type MessageEdit, type ManualState } from "./manual-queue";
import "./control-center.css";
import "./workspace-settings.css";
import "./reply-review.css";
import { DateRangeFilter } from "./date-range-filter";
const OverviewDashboard = lazy(() => import("./overview-dashboard").then(m => ({default: m.OverviewDashboard})));
import "./overview-dashboard.css";
import { WorkspaceSettings } from "./workspace-settings";
import { PrivacyDialog, WorkspaceConnectionDialog } from "./outreach-setup";
import { ApplicationSidebar, WorkspaceStatus } from "./application-shell";
import {
  InvitationReviewList,
  type InvitationBacklogState,
} from "./invitation-backlog";

type Person = {
  id: string;
  full_name: string;
  employer: string;
  current_title?: string;
  linkedin_profile_url: string;
  connection_status: string;
  origin: string;
  do_not_contact: boolean;
  last_recommended_date?: string;
};
type Action = {
  id: string;
  contact_id: string;
  intent: keyof typeof intentLabels;
  state: string;
  draft_text?: string | null;
  draft_revision: number;
  context_version: number;
  due_at: string;
  reason?: string | null;
};
type Thread = {
  contact_id: string;
  context_version: number;
  coverage: string;
  verified_at?: string | null;
  closed_at?: string | null;
  snoozed_until?: string | null;
  thread_url?: string | null;
  state: string;
};
type Message = {
  id: string;
  evidence_key?: string;
  contact_id: string;
  direction: string;
  body?: string | null;
  occurred_at?: string;
  observed_at?: string;
  source: string;
  verified: boolean;
};
type Job = {
  id: string;
  contact_id: string;
  action_id?: string;
  kind: string;
  state: string;
  result_code?: string | null;
  created_at: string;
  batch_id?: string | null;
};
export type Snapshot = {
  capabilities?: { selection: boolean; preparation: boolean; approval: boolean; execution: boolean; management: boolean; queue?: boolean; contact_management?: boolean };
  workspace_sync?: {
    state: string;
    last_success_at?: string;
    error?: string;
    opened: number;
    unchanged: number;
  };
  invitation_backlog?: InvitationBacklogState;
  contacts: Person[];
  threads: Thread[];
  actions: Action[];
  messages: Message[];
  jobs: Job[];
  events: { id: string; state: string; created_at: string }[];
  sync: {
    id: string;
    source: string;
    state: string;
    started_at: string;
    finished_at?: string;
    error?: string;
  }[];
  execution: { outbound_enabled: boolean; adapter: string; mode?: "legacy" | "new" | "paused"; schema_version?: number };
  compatibility?: { schema_version: number; pending_changes: number; failed_changes: number };
  restrictions: { excluded: string[]; discarded: string[] };
  as_of: string;
  intake?: {
    id: string;
    candidate_name: string;
    state: string;
    result?: string;
    source: string;
  }[];
  connection_sync?: {
    source: string;
    state: string;
    last_success_at?: string;
    error?: string;
  }[];
};
type Discovery = {
  id: number;
  contact_id: string;
  track: string;
  priority: number;
  fit_assessment: string;
  genuine_gap?: string | null;
  opening_title?: string | null;
  active_job_url?: string | null;
  hiring_post_url?: string | null;
  personalized_message: string;
  run_date?: string;
  verified_at: string;
};
type DiscoveryByContact = Map<string, Discovery[]>;
type Run = {
  id: string;
  run_date: string;
  actual_hiring_managers: number;
  actual_executives: number;
  company_count: number;
};
export type View = "overview" | "people";
export type OverviewActivity = {id?: number | string; contact_id: string; activity_type: string; activity_at?: string};
type Props = {
  demo?: boolean;
  client?: SupabaseClient;
  discovery?: Discovery[];
  runs?: Run[];
  accountControls?: ReactNode;
  userName?: string;
  onLogout?: () => void;
  legacyExportData?: unknown;
  activityHistory?: OverviewActivity[];
};
const stageLabels: Record<string, string> = {
  prepare: "Prepare",
  review: "Review",
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  snoozed: "Snoozed",
  attention: "Issue",
  closed: "Closed",
};
const pretty = (s: string) => s.replaceAll("_", " ");
const stamp = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not verified";
const safeLink = (s?: string | null) => {
  try {
    return s && new URL(s).protocol === "https:" ? s : undefined;
  } catch {
    return undefined;
  }
};
const discoveryByContact = (discovery: Discovery[]) => {
  const byContact: DiscoveryByContact = new Map();
  for (const row of discovery) {
    const group = byContact.get(row.contact_id);
    if (!group) byContact.set(row.contact_id, [row]);
    else group.push(row);
  }
  for (const [contactId, list] of byContact) {
    list.sort(
      (a, b) =>
        (b.run_date || b.verified_at.slice(0, 10)).localeCompare(
          a.run_date || a.verified_at.slice(0, 10),
        ) ||
        a.priority - b.priority ||
        a.id - b.id,
    );
    byContact.set(contactId, list);
  }
  return byContact;
};
const chooseDraftBase = (
  action: Action | undefined,
  recommendations: Discovery[],
) => {
  const current = action?.draft_text ?? "";
  if (current) return { base: current, usingDiscovery: false };
  if (action && action.intent !== "invitation")
    return { base: "", usingDiscovery: false };
  const fallback = invitationMessage([], recommendations).text;
  return fallback
    ? { base: fallback, usingDiscovery: true }
    : { base: "", usingDiscovery: false };
};
const hasValue = (value?: string | null) => (value || "").trim().length > 0;
const OpportunityLink = ({
  recommendations,
  className,
}: {
  recommendations: Discovery[];
  className?: string;
}) => {
  const {url,title} = opportunityDetails(recommendations);
  if (!url) return <span className={className ?? ""}>{title}</span>;
  return (
    <a
      className={className ?? ""}
      href={url}
      target="_blank"
      rel="noreferrer"
      title={title}
    >
      {title}
    </a>
  );
};

export function ControlCenter({
  demo = false,
  client,
  discovery = [],
  runs = [],
  accountControls,
  userName = "Sample user",
  onLogout = () => window.location.assign(window.location.pathname),
  legacyExportData,
  activityHistory = [],
}: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() => {
    if (!demo) return null;
    try {
      const saved = localStorage.getItem("outreach-control-center-demo-v1");
      if (saved) return JSON.parse(saved) as Snapshot;
    } catch {}
    return createDemoControlCenter() as unknown as Snapshot;
  });
  useEffect(() => {
    if (demo && snapshot)
      localStorage.setItem(
        "outreach-control-center-demo-v1",
        JSON.stringify(snapshot),
      );
  }, [demo, snapshot]);
  const [view, setView] = useState<View>("overview");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [commandBusy, setBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [manualRefreshPending, setManualRefreshPending] = useState(false);
  const [freshDiscovery, setFreshDiscovery] = useState<Discovery[] | null>(null);
  const [recordedMessages, setRecordedMessages] = useState<Message[]>([]);
  const [deliveryEvidence, setDeliveryEvidence] = useState<{id:string;contact_id:string;status:string;confirmation_signal?:string;failure_reason?:string}[]>([]);
  const [evidenceLoaded, setEvidenceLoaded] = useState(demo);
  const [evidenceRevision, setEvidenceRevision] = useState(0);
  const [historyError, setHistoryError] = useState('');
  const [manual, setManual] = useState<ManualState>({ invitations: {}, batches: [], tasks: [] });
  const queueWriteLock = useRef(false);
  const recoveryOwner=useRef<string|undefined>(undefined);
  const loadSequence = useRef(0);
  const [savingQueue, setSavingQueue] = useState(false);
  const [queueStale,setQueueStale]=useState(true);
  const [queueRecovery, setQueueRecovery] = useState<{notSaved?:boolean;requestId?:string;items:{contact_id:string;text:string;token?:string}[];beforeIds:string[];confirmed?:{batch_id:string;batch_code:string;selected_count:number}} | null>(null);
  const capabilities = workspaceCapabilities(snapshot, demo);
  const readOnly = !capabilities.management;
  const busy = commandBusy || batchBusy || !!queueRecovery || manualRefreshPending;
  const [messageEdits, setMessageEdits] = useState<Record<string, MessageEdit>>({});
  const changeMessageEdit = (key: string, edit?: MessageEdit) => setMessageEdits(current => {
    const next = {...current}; if (edit) next[key] = edit; else delete next[key]; return next;
  });
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showBacklog, setShowBacklog] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [track, setTrack] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [batchSelection, setBatchSelection] = useState<string[]>([]);

  const [rowOrder, setRowOrder] = useState<string[]>([]);
  const discoveryBuckets = useMemo(
    () => discoveryByContact(freshDiscovery ?? discovery),
    [discovery, freshDiscovery],
  );
  useEffect(() => {
    if (selected)
      document
        .getElementById(`person-row-${selected}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const load = useCallback(async () => {
    if (demo || !client) return;
    const requestSequence = ++loadSequence.current;
    let manualSnapshot: ManualState | undefined;
    const { data, error: rpcError } = await client.rpc("control_center", {
      p_command: "snapshot",
    });
    if (rpcError)
      throw new Error(
        rpcError.code === "PGRST202"
          ? "The control-center migration is not installed in this database yet. Existing production data is unchanged."
          : rpcError.message,
      );
    const capabilityResult = await client.rpc("outreach_capabilities");
    if (capabilityResult.data?.queue || capabilityResult.data?.execution_mode === 'legacy') {
      const queued = await client.rpc('manual_outreach', { p_command: 'snapshot' });
      if (queued.error) throw new Error(queued.error.message);
      manualSnapshot = queued.data as ManualState;
      if (requestSequence === loadSequence.current) {
        setManual(manualSnapshot);
        if(manualSnapshot.queue_owner && recoveryOwner.current!==manualSnapshot.queue_owner) {
          recoveryOwner.current=manualSnapshot.queue_owner;
          const saved=sessionStorage.getItem(`outreach-queue-save:${manualSnapshot.queue_owner}`);
          if(saved) {const pending=JSON.parse(saved);setQueueRecovery(pending);setBatchSelection(pending.items.map((item:{contact_id:string})=>item.contact_id));}
          else setQueueRecovery(null);
        }
        const savedState=manualSnapshot;
        setMessageEdits(current => {
          const next={...current};let changed=false;
          for(const [key,edit] of Object.entries(current)) {
            const task=savedState.tasks.find(t=>`${t.contact_id}:${t.id}`===key);
            const saved=key.includes(':') ? task?.draft_message : savedState.invitations[key]?.text;
            if(saved!==undefined && edit.text.trim()===saved) {delete next[key];changed=true;}
          }
          return changed?next:current;
        });
      }
    }
    const evidenceResults=await Promise.allSettled([
      readDeliveryEvidence(client),
      readEvidenceRows(client,'outreach_conversation_events','id,contact_id,event_type,message_body,message_excerpt,observed_at,evidence_source','event_type','inbound_message'),
    ]);
    if(requestSequence===loadSequence.current) {
      const delivery=evidenceResults[0],incoming=evidenceResults[1];
      setQueueStale(delivery.status!=='fulfilled');
      if(delivery.status==='fulfilled') {
        const {invitations,replies}=delivery.value;
        setDeliveryEvidence([...invitations,...replies]);setEvidenceLoaded(true);
        setRecordedMessages(conversationEvidence([],invitations,replies,incoming.status==='fulfilled'?incoming.value:[]));
        setHistoryError(incoming.status==='fulfilled'?'':'Incoming history could not be loaded. Sent confirmations remain available.');
      } else {setEvidenceLoaded(false);setHistoryError('Delivery confirmations could not be loaded. Refresh before correcting a send.');}
    }
    if (requestSequence === loadSequence.current) {
      setSnapshot({ ...data, capabilities: capabilityResult.error ? undefined : capabilityResult.data } as Snapshot);
      setError("");
      setManualRefreshPending(false);
    }
    return manualSnapshot;
  }, [client, demo]);
  useEffect(() => {
    if (demo || !client) return;
    let active = true;
    let sequence = 0;
    const read = async () => {
      const request=++sequence;
      const results=await Promise.allSettled([
        readEvidenceRows(client,'outreach_recommendations','id,run_id,contact_id,track,priority,fit_assessment,genuine_gap,opening_title,active_job_url,hiring_post_url,personalized_message,verified_at'),
        readEvidenceRows(client,'outreach_runs','id,raw_report_text'),
      ]);
      if (!active || request!==sequence) return;
      if(results[0].status==='fulfilled') setFreshDiscovery(sourceContext(results[0].value,results[1].status==='fulfilled'?results[1].value:[]) as Discovery[]);
    };
    void read();
    const refresh=()=>void read();
    const timer=window.setInterval(refresh,60000);
    window.addEventListener('focus',refresh);
    return ()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[client,demo,evidenceRevision]);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void load().catch((e) => {
        if (alive) {setError(e.message);setQueueStale(true);}
      });
    refresh();
    const timer = window.setInterval(()=>{if(document.visibilityState==='visible')refresh();}, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  const refreshQueue = async () => {
    const state = await load();
    if (!state) throw new Error('Queue snapshot unavailable');
    return state;
  };
  const saveQueue = async (items: {contact_id:string;text:string;token?:string}[], retryRequestId?:string) => {
    if (!client || commandBusy || batchBusy || (!retryRequestId && busy) || queueWriteLock.current) return false;
    queueWriteLock.current = true;
    setSavingQueue(true); setBusy(true); setError(''); setFeedback('');
    const beforeIds = manual.batches.map(b => b.id);
    const requestId=retryRequestId||crypto.randomUUID();
    try {
      sessionStorage.setItem(`outreach-queue-save:${manual.queue_owner}`,JSON.stringify({requestId,items,beforeIds}));
      const outcome = await saveConnectionQueue({
        rpc: (selectedItems: typeof items) => client.rpc('manual_outreach', {p_command:'queue',p_payload:{items:selectedItems,request_id:requestId,allocation_token:manual.queue_state?.token}}),
        recoverByRequest: async()=>{const r=await client.rpc('manual_outreach',{p_command:'queue_receipt',p_payload:{request_id:requestId}});if(r.error)throw r.error;return r.data?.receipt;},
        refresh: refreshQueue, items, beforeIds,
      });
      if (outcome.uncertain || outcome.refreshFailed) setQueueRecovery({requestId,items,beforeIds,confirmed:outcome.ok ? outcome.data : undefined});
      if(!outcome.uncertain && !outcome.refreshFailed) {sessionStorage.removeItem(`outreach-queue-save:${manual.queue_owner}`);setQueueRecovery(null);}
      if(outcome.allocationChanged) await refreshQueue();
      if (!outcome.ok) setError(outcome.error || 'Queue could not be saved.');
      return outcome.ok;
    } catch(e) {setQueueRecovery({requestId,items,beforeIds});setError(e instanceof Error?e.message:'Save outcome is not confirmed.');return false;} finally { queueWriteLock.current = false; setSavingQueue(false); setBusy(false); }
  };
  const retryQueueRefresh = async () => {
    if (!queueRecovery || queueWriteLock.current) return;
    queueWriteLock.current = true; setBusy(true);
    try {
      const state = await refreshQueue();
      const recovered=queueRecovery.requestId && client ? await client.rpc('manual_outreach',{p_command:'queue_receipt',p_payload:{request_id:queueRecovery.requestId}}):null;
      if(recovered?.error) throw recovered.error;
      const saved = queueRecovery.confirmed || recovered?.data?.receipt || (!queueRecovery.requestId && findSavedQueue(state.batches, queueRecovery.items, queueRecovery.beforeIds));
      if (saved) {
        setBatchSelection(current => current.filter(id => !queueRecovery.items.some(i => i.contact_id === id)));
        sessionStorage.removeItem(`outreach-queue-save:${manual.queue_owner}`);setQueueRecovery(null); setError('');
      } else {setQueueRecovery({...queueRecovery,notSaved:true});setError('No save was recorded. Review the allocation, then retry the same save.');}
    } catch { setError('Could not refresh the saved queue. Try refreshing again.'); }
    finally { queueWriteLock.current = false; setBusy(false); }
  };
  const manualRun = async (command: string, payload: Record<string, unknown> = {}) => {
    if (!client || busy || queueWriteLock.current) return false;
    queueWriteLock.current=true;
    setBusy(true); setError(''); setFeedback('');
    try {
      const result = command === 'confirm_invitation_sent'
        ? await client.rpc('confirm_browser_assisted_outreach', {p_session_id:payload.session_id,p_confirmation_signal:'linkedin_invitation_sent_visible'})
        : await client.rpc('manual_outreach', { p_command: command, p_payload: payload });
      if (result.error) throw result.error;
      setEvidenceRevision(value=>value+1);
      setFeedback(['exclude_people','do_not_contact','restore_exclusions','confirm_invitation_sent'].includes(command) ? '' : result.data?.message || (command === 'queue' || command === 'approve_reply' ? 'Queued — waiting for you to trigger ChatGPT Work. Nothing has been sent.' : 'Queue updated.'));
      try { await load(); }
      catch { setManualRefreshPending(true);setError('Saved, but the updated page could not be loaded. Refresh the saved details before making another change.');return false; }
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : String((e as {message?: string})?.message || e)); return false; }
    finally { queueWriteLock.current=false;setBusy(false); }
  };
  const excludePeople = async (ids: string[]) => {
    if (await manualRun('exclude_people', {contact_ids: ids})) {
      setBatchSelection(current => current.filter(id => !ids.includes(id)));
    }
  };
  const execute = async (cmd: string, p: Record<string, unknown>) => {
    if (!demo && capabilities.contactManagement && ['discard','restore','snooze','do_not_contact','close','reopen'].includes(cmd))
      return manualRun(cmd === 'close' ? 'discard' : cmd === 'reopen' ? 'restore' : cmd, p);
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      if (demo) {
        const currentTime = now;
        setSnapshot(
          applyDemoCommand(snapshot, cmd, p, currentTime) as Snapshot,
        );
        setNow(currentTime);
        setFeedback(
          cmd === "approve"
            ? "Sample job queued. Nothing is sent to LinkedIn."
            : "Sample workspace updated.",
        );
        if (["approve", "snooze", "discard", "close"].includes(cmd))
          setSelected(null);
        return true;
      }
      if (!client) throw new Error("Workspace connection unavailable");
      if (!canRunWorkspaceCommand(capabilities, cmd)) throw new Error("This action is not enabled yet. Your selection is preserved; existing outreach remains available in the original workspace.");
      if (cmd === "discard" || cmd === "restore") {
        const { error: discardError } = await client.rpc(
          "set_outreach_contact_discarded",
          { p_contact_id: p.contact_id, p_discarded: cmd === "discard" },
        );
        if (discardError) throw discardError;
      } else {
        const backlogCommand = [
          "set_invitation_policy",
          "prepare_withdrawals",
        ].includes(cmd);
        const { data, error: rpcError } = await client.rpc(
          backlogCommand ? "invitation_backlog" : "control_center",
          {
            p_command: cmd === "set_invitation_policy" ? "set_policy" : cmd,
            p_payload: p,
          },
        );
        if (rpcError) throw rpcError;
        if (data?.job_ids?.length) {
          let launchUnavailable = false;
          for (const job_id of data.job_ids) {
            const launch = await client.functions.invoke("agent-bridge", {
              body: { operation: "dispatch", job_id },
            });
            launchUnavailable ||=
              !!launch.error || launch.data?.dispatch === "not_configured";
          }
          setFeedback(
            launchUnavailable
              ? "Preparation saved. Sending service is unavailable; check Settings."
              : "Preparation saved. Track progress in People.",
          );
        } else if (data?.job_id && ["prepare", "approve"].includes(cmd)) {
          const dispatch = await client.functions.invoke("agent-bridge", {
            body: { operation: "dispatch", job_id: data.job_id },
          });
          setFeedback(
            dispatch.error
              ? "Action saved. Sending service is unavailable; check Settings."
              : dispatch.data?.message ||
                  "Action saved. Track progress in People.",
          );
        } else setFeedback("Workspace updated.");
      }
      await load();
      if (["approve", "snooze", "discard", "close"].includes(cmd))
        setSelected(null);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : String((e as { message?: string }).message || e),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const openPerson = (id: string) => {
    setFeedback("");
    setError("");
    setRowOrder(view === "people" ? people.map((c) => c.id) : []);
    if (view !== "people") {
      setView("people");
      setFilter("all");
      setQuery("");
      setTrack("all");
      setDateFrom("");
      setDateTo("");
    }
    setSelected((current) => (current === id ? null : id));
    setResolutionNote("");
  };
  const go = (next: View, nextFilter = "all") => {
    setFeedback("");
    setSelected(null);
    setView(next);
    setFilter(nextFilter);
    setQuery("");
    setBatchSelection([]);
    setTrack("all");
    setDateFrom("");
    setDateTo("");
  };
  const projected = useMemo(
    () => (snapshot ? projectControlCenter(snapshot, now) : null),
    [snapshot, now],
  );
  const relationships = useMemo(() => snapshot ? projectRelationships({...snapshot,messages:[...snapshot.messages,...recordedMessages]}, {manual:capabilities.queue ? manual:null,evidence:deliveryEvidence,recommendations:freshDiscovery ?? discovery,activities:activityHistory,now,evidenceAvailable:evidenceLoaded}) : null,[snapshot,recordedMessages,capabilities.queue,manual,deliveryEvidence,freshDiscovery,discovery,activityHistory,now,evidenceLoaded]);
  const people = (() => {
    if (!snapshot) return [];
    return snapshot.contacts
      .filter((c) => {
        const stage = personStage(snapshot, c.id, now),
          action = currentAction(snapshot, c.id);
        const matches = relationships && filter in relationships.groups ? relationships.groups[filter].includes(c.id) :
          matchesPeopleFocus(snapshot, c, filter, now) ||
          (filter === "needs_action" &&
            inboxNeedsAction(snapshot, c.id, now)) ||
          (filter === "discovery" && c.origin === "discovery") ||
          (filter === "outside" && c.origin === "outside") ||
          (filter === "pending" && c.connection_status === "request_sent") ||
          (filter === "discarded" &&
            snapshot.restrictions.discarded.includes(c.id)) ||
          (filter === "unreached" && c.connection_status === "not_contacted") ||
          (filter === "execution" && ["queued", "running"].includes(stage)) ||
          filter === stage ||
          (!peopleFilterOptions.some(([id]) => id === filter) &&
            filter === action?.intent);
        const recs = discoveryBuckets.get(c.id) ?? [];
        return (
          matches &&
          (!query ||
            `${c.full_name} ${c.employer} ${c.current_title}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (!recs.length ||
            track === "all" ||
            recs.some((r) => r.track === track)) &&
          (!dateFrom ||
            recs.some(
              (r) => (r.run_date || r.verified_at.slice(0, 10)) >= dateFrom,
            )) &&
          (!dateTo ||
            recs.some(
              (r) => (r.run_date || r.verified_at.slice(0, 10)) <= dateTo,
            ))
        );
      })
      .sort((a, b) =>
        filter === "attention" && relationships ? relationships.groups.attention.indexOf(a.id)-relationships.groups.attention.indexOf(b.id) : selected && rowOrder.length
          ? rowOrder.indexOf(a.id) - rowOrder.indexOf(b.id)
          : filter === "withdrawal"
            ? (Date.parse(
                snapshot.invitation_backlog?.items?.find(
                  (i) => i.contact_id === a.id,
                )?.sent_at || "",
              ) || Infinity) -
              (Date.parse(
                snapshot.invitation_backlog?.items?.find(
                  (i) => i.contact_id === b.id,
                )?.sent_at || "",
              ) || Infinity)
            : filter === "needs_action"
              ? ["attention", "review", "prepare"].indexOf(
                  personStage(snapshot, a.id, now),
                ) -
                ["attention", "review", "prepare"].indexOf(
                  personStage(snapshot, b.id, now),
                )
              : peoplePriority(snapshot, a.id, now) -
                peoplePriority(snapshot, b.id, now),
      );
  })();
  const person = snapshot?.contacts.find((c) => c.id === selected);
  const action =
    snapshot && selected
      ? (currentAction(snapshot, selected) as Action | undefined)
      : undefined;
  const thread = snapshot?.threads.find((t) => t.contact_id === selected);
  const messages = conversationEvidence(snapshot?.messages || [],[],[],[]).concat(recordedMessages);
  const personMessages = conversationEvidence(messages).filter((m:Message)=>m.contact_id===selected);
  const selectedRecommendations = selected
    ? (discoveryBuckets.get(selected) ?? [])
    : [];
  const selectedRecommendation = selectedRecommendations[0];
  const selectedJobs =
    snapshot?.jobs.filter((job) => job.contact_id === selected) ?? [];
  const selectedDraftInfo = selected
    ? chooseDraftBase(action, selectedRecommendations)
    : { base: "", usingDiscovery: false };
  const draft = selected ? (drafts[selected] ?? selectedDraftInfo.base) : "";
  const edited = draft !== selectedDraftInfo.base;
  const invitationMode = action?.intent === "invitation" || person?.connection_status === 'not_contacted';
  const exportData = async () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { snapshot, discovery, runs, legacy: legacyExportData },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "outreach-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const deleteData = async () => {
    if (!client) return "Live workspace is unavailable";
    const result = await client.rpc("delete_outreach_workspace_data", {
      p_confirmation: "DELETE ALL OUTREACH DATA",
    });
    if (result.error) return result.error.message;
    window.location.reload();
    return null;
  };
  const selectable = people
    .filter((c) => capabilities.queue ? !!manual.people?.[c.id]?.can_select : canSelectOutreach(snapshot, c.id, now) || (false && ['not_contacted','connected','messaged','replied','meeting_scheduled','referred'].includes(c.connection_status) && !c.do_not_contact && !['closed','snoozed','running','attention'].includes(personStage(snapshot,c.id,now))))
    .map((c) => c.id);
  const selectedActions = batchSelection
    .map((id) => currentAction(snapshot, id))
    .filter(Boolean);
  const preparationIds = batchSelection.filter(
    (id) => personStage(snapshot, id, now) === "prepare",
  );
  const reviewIds = batchSelection.filter(
    (id) => personStage(snapshot, id, now) === "review",
  );
  const hasUnsavedSelection = (id: string) => {
    const personAction = currentAction(snapshot, id);
    const personDraft = chooseDraftBase(
      personAction,
      discoveryBuckets.get(id) ?? [],
    );
    return drafts[id] !== undefined && drafts[id] !== personDraft.base;
  };
  const unsavedSelection = batchSelection.some((id) => hasUnsavedSelection(id));
  async function runSelection(
    command: "prepare" | "approve" | "snooze" | "discard",
  ) {
    if (!snapshot || busy || !canRunWorkspaceCommand(capabilities, command)) return;
    const ids =
      command === "prepare"
        ? preparationIds
        : command === "approve"
          ? reviewIds
          : batchSelection;
    if (command === "prepare" && ids.some(hasUnsavedSelection)) {
      setError("Save or discard draft edits before preparing.");
      setBatchBusy(false);
      return;
    }
    if (!ids.length) return;
    setBatchBusy(true);
    setError("");
    setFeedback("");
    let next = snapshot;
    let completed = 0;
    const batch = crypto.randomUUID();
    try {
      for (const id of ids) {
        const a = currentAction(next, id);
        const payload = {
          contact_id: id,
          ...(command === "approve"
            ? {
                text: a?.draft_text,
                draft_revision: a?.draft_revision,
                batch_id: batch,
              }
            : {}),
          ...(command === "snooze"
            ? { until: new Date(now + 3 * 86400000).toISOString() }
            : {}),
        };
        if (demo)
          next = applyDemoCommand(
            next,
            command,
            payload,
            now,
          ) as Snapshot;
        else if (!(await execute(command, payload))) break;
        completed++;
      }
      if (demo) {
        setSnapshot(next);
        setNow(now);
      }
      if (command !== "prepare") setSelected(null);
      if (command !== "prepare")
        setBatchSelection((idsLeft) =>
          idsLeft.filter((id) => !ids.slice(0, completed).includes(id)),
        );
      if (completed === ids.length)
        setFeedback(
          command === "prepare"
            ? demo
              ? `Prepared ${completed} sample drafts. Review each message below, then approve to queue.`
              : `Requested ${completed} drafts. Follow progress above; approve when ready.`
            : command === "approve"
              ? demo
                ? `Queued ${completed} sample actions. Nothing is sent to LinkedIn.`
                : `Approved ${completed} actions. Check queue and sync status for execution.`
              : `Updated ${completed} ${completed === 1 ? "person" : "people"}.`,
        );
    } catch (e) {
      if (demo) setSnapshot(next);
      setError(
        `${completed} of ${ids.length} completed. ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBatchBusy(false);
    }
  }
  const personDetail =
    person && snapshot ? (
      <section
        className="cc-person-panel cc-inline-person"
        id={`person-detail-${person.id}`}
        role="region"
        aria-labelledby="cc-person-title"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setSelected(null);
            document.getElementById(`person-toggle-${person.id}`)?.focus();
          }
        }}
      >
        <header className="cc-inline-panel-header">
          <div className="cc-review-label">
            <p className="cc-eyebrow">
              {invitationMode ? "INVITATION REVIEW" : "CONVERSATION REVIEW"}
            </p>
            <h2 className="cc-sr-only" id="cc-person-title">
              {person.full_name}
            </h2>
            <span className="cc-mobile-person-meta">
              {[person.current_title, person.employer]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <span className="cc-small-tag">{person.origin === "discovery" || selectedRecommendations.length ? "From discovery" : person.origin === "outside" ? "Other connection" : "Source not recorded"}</span>
          <div className="cc-panel-tools">
            {safeLink(thread?.thread_url) && !invitationMode && (
              <a
                className="cc-icon-action"
                href={safeLink(thread?.thread_url)}
                target="_blank"
                rel="noreferrer"
                aria-label="Open conversation"
                title="Open conversation"
              >
                <ExternalLink size={14} />
              </a>
            )}
            {!capabilities.queue && <>
            <button
              type="button"
              className="cc-icon-action"
              disabled={busy || !(capabilities.management || capabilities.contactManagement)}
              aria-label="Snooze for 3 days"
              title="Snooze for 3 days"
              onClick={() =>
                void execute("snooze", {
                  contact_id: person.id,
                  until: new Date(now + 3 * 86400000).toISOString(),
                })
              }
            >
              <Clock3 size={14} />
            </button>
            {invitationMode || capabilities.contactManagement ? (
              <button
                type="button"
                className="cc-icon-action"
                disabled={busy || !(capabilities.management || capabilities.contactManagement)}
                aria-label={
                  snapshot.restrictions.discarded.includes(person.id)
                    ? "Restore candidate"
                    : "Set aside until restored"
                }
                title={
                  snapshot.restrictions.discarded.includes(person.id)
                    ? "Restore candidate"
                    : "Set aside until restored"
                }
                onClick={() =>
                  void execute(
                    snapshot.restrictions.discarded.includes(person.id)
                      ? "restore"
                      : "discard",
                    { contact_id: person.id },
                  )
                }
              >
                {snapshot.restrictions.discarded.includes(person.id) ? (
                  <RotateCcw size={14} />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            ) : (
              <button
                type="button"
                className="cc-icon-action"
                disabled={busy || !(capabilities.management || capabilities.contactManagement)}
                aria-label={
                  thread?.closed_at
                    ? "Reopen conversation"
                    : "No reply needed; close conversation"
                }
                title={
                  thread?.closed_at
                    ? "Reopen conversation"
                    : "No reply needed; close conversation"
                }
                onClick={() =>
                  void execute(thread?.closed_at ? "reopen" : "close", {
                    contact_id: person.id,
                  })
                }
              >
                {thread?.closed_at ? (
                  <RotateCcw size={14} />
                ) : (
                  <MessageSquareOff size={14} />
                )}
              </button>
            )}
            <button
              type="button"
              className="cc-icon-action cc-icon-danger"
              disabled={busy || !(capabilities.management || capabilities.contactManagement) || person.do_not_contact}
              aria-label="Do not contact"
              title="Do not contact"
              onClick={() =>
                void execute("do_not_contact", { contact_id: person.id })
              }
            >
              <Ban size={14} />
            </button>
            <details className="cc-delivery-menu">
              <summary
                className="cc-icon-action"
                aria-label="Action history"
                title="Action history"
              >
                <History size={14} />
                {!!selectedJobs.length && <span>{selectedJobs.length}</span>}
              </summary>
              <div className="cc-delivery-popover">
                <strong>Action history</strong>
                {selectedJobs.length ? (
                  selectedJobs.map((job) => (
                    <div className="cc-sync" key={job.id}>
                      <strong>
                        {job.kind === "prepare"
                          ? "Preparation"
                          : "Approved action"}
                      </strong>
                      <span>{pretty(job.result_code || job.state)}</span>
                      <small>{stamp(job.created_at)}</small>
                    </div>
                  ))
                ) : (
                  <small>No actions recorded yet.</small>
                )}
              </div>
            </details>
            </>}
          </div>
        </header>

        {error && (
          <div className="cc-alert" role="alert">
            {error}
          </div>
        )}
        {feedback && (
          <div className="cc-feedback" role="status">
            {feedback}
          </div>
        )}
        {manualRefreshPending && <button disabled={commandBusy} onClick={()=>void load().catch(()=>setError('Could not refresh saved details. Try again.'))}>Refresh saved details</button>}
          {(relationships?.reasons[person.id]?.length ?? 0) > 0 && <ul className="cc-attention-reasons">{relationships!.reasons[person.id].map((reason:{code:string;label:string;next:string})=><li key={reason.code}><strong>{reason.label}</strong><span>{reason.next}</span></li>)}</ul>}
        <div
          className={`cc-person-columns ${invitationMode ? "cc-invitation-columns" : ""}`}
        >
          {!invitationMode && (
            <section className="cc-context-column">
              <div className="cc-card-heading">
                <h3>Conversation history</h3>
                <span>
                  {person.connection_status === "request_sent" ? "Waiting for acceptance" : thread?.coverage === "complete"
                    ? `Verified ${stamp(thread.verified_at)}`
                    : "Verification needed"}
                </span>
              </div>
              <div className="cc-message-list">
                {historyError && <p role="status">{historyError}</p>}
                {personMessages.length ? (
                  personMessages.map((m:Message) => (
                    <article
                      className={`cc-message cc-message-${m.direction}`}
                      key={m.id}
                    >
                      <small>
                        {m.source === 'gmail_signal' ? 'Incoming-message notification' : m.direction === "outbound"
                          ? "You"
                          : m.direction === "inbound"
                            ? person.full_name.split(" ")[0]
                            : "Historical activity"}{" "}
                        · {stamp(m.occurred_at || m.observed_at)}
                      </small>
                      <p>
                        {m.body ||
                          "Activity recorded; message text is unavailable."}
                      </p>
                      <span>
                        {m.verified
                          ? "Verified thread"
                          : m.source === 'gmail_signal' ? 'Notification only — full conversation text is not recorded'
                          : m.source.startsWith('Confirmed') ? m.source
                          : `Reported · ${m.source}`}
                      </span>
                    </article>
                  ))
                ) : (
                  <p className="cc-muted">No sent or received messages are recorded yet. Drafts are not sent history.</p>
                )}
              </div>
              <details className="cc-manual">
                <summary>Meetings &amp; referrals</summary>
                <p className="cc-muted">
                  Record outcomes LinkedIn cannot tell us. Messages sent or
                  received on LinkedIn belong in the shared sync.
                </p>
                <div className="cc-draft-actions">
                  <button
                    disabled={busy || !capabilities.management}
                    onClick={() =>
                      void execute("relationship", {
                        contact_id: person.id,
                        status: "meeting_scheduled",
                      })
                    }
                  >
                    Meeting scheduled
                  </button>
                  <button
                    disabled={busy || !capabilities.management}
                    onClick={() =>
                      void execute("relationship", {
                        contact_id: person.id,
                        status: "referred",
                      })
                    }
                  >
                    Referral received
                  </button>
                </div>
              </details>
            </section>
          )}

          {capabilities.queue && <PersonMessage key={person.id} evidenceLoaded={evidenceLoaded} now={now} contact={person} data={{...manual,batches:relationships?.batches ?? manual.batches}} busy={busy} enabled={capabilities.queue} run={manualRun} edits={messageEdits} setEdit={changeMessageEdit} history={selectedRecommendations} />}
          <section className="cc-draft-area" hidden={capabilities.queue}>
            <div className="cc-card-heading cc-reply-heading">
              <h3>
                {capabilities.queue ? 'Saved invitation' : invitationMode
                  ? "Invitation draft"
                  : action?.intent === "withdrawal"
                    ? "Withdrawal review"
                    : "Next reply"}
              </h3>
              <div className="cc-draft-actions cc-reply-header-actions">
                {!capabilities.queue && action &&
                  ["preparation", "review", "snoozed"].includes(
                    action.state,
                  ) && (
                    <>
                      <button
                        disabled={busy || !capabilities.preparation || edited}
                        title={
                          edited
                            ? "Save or discard your edits before preparing again"
                            : undefined
                        }
                        onClick={() =>
                          void execute("prepare", { contact_id: person.id })
                        }
                      >
                        {busy ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <RefreshCw size={15} />
                        )}{" "}
                        {action.intent === "withdrawal"
                          ? "Verify pending invitation"
                          : "Prepare draft"}
                      </button>
                      {(edited || selectedDraftInfo.usingDiscovery) && (
                        <button
                          disabled={busy || !capabilities.preparation}
                          onClick={() =>
                            void execute("save_draft", {
                              contact_id: person.id,
                              text: draft,
                              context_version: thread?.context_version,
                            }).then((ok) => {
                              if (ok)
                                setDrafts((d) => {
                                  const next = { ...d };
                                  delete next[person.id];
                                  return next;
                                });
                            })
                          }
                        >
                          {edited ? "Save changes" : "Save draft"}
                        </button>
                      )}
                      {edited && (
                        <button
                          disabled={busy || !capabilities.management}
                          onClick={() => {
                            setDrafts((current) => {
                              const next = { ...current };
                              delete next[person.id];
                              return next;
                            });
                            setFeedback("Draft edits discarded.");
                          }}
                        >
                          Discard edits
                        </button>
                      )}
                      <button
                        className="cc-primary"
                        disabled={
                          busy || !capabilities.approval ||
                          edited ||
                          selectedDraftInfo.usingDiscovery ||
                          action.state !== "review" ||
                          thread?.coverage !== "complete" ||
                          new Date(action.due_at).getTime() > now
                        }
                        onClick={() =>
                          void execute("approve", {
                            contact_id: person.id,
                            text: draft,
                            draft_revision: action.draft_revision,
                          })
                        }
                      >
                        <Check size={15} />
                        {action.intent === "withdrawal"
                          ? "Approve withdrawal"
                          : "Approve message"}
                      </button>
                    </>
                  )}
                {action && ["queued", "checking"].includes(action.state) && (
                  <button
                    onClick={() =>
                      void execute("cancel_approval", {
                        contact_id: person.id,
                      })
                    }
                    disabled={busy || !capabilities.management}
                  >
                    Cancel approval
                  </button>
                )}
                {demo && action?.state === "queued" && (
                  <button
                    className="cc-primary"
                    onClick={() =>
                      void execute("simulate_send", { contact_id: person.id })
                    }
                  >
                    Run sample job
                  </button>
                )}
              </div>
              <div className="cc-draft-tags">
                {selectedDraftInfo.usingDiscovery && (
                  <span className="cc-small-tag">ChatGPT Work draft</span>
                )}
                {action && (
                  <span className="cc-small-tag">{pretty(action.state)}</span>
                )}
              </div>
            </div>
            {capabilities.queue ? null : action?.intent === "withdrawal" ? (
              <p className="cc-alert">
                Withdraw the pending invitation to {person.full_name}. This
                cannot be undone. The worker must verify the correct person and
                confirm the invitation is still pending immediately before
                withdrawal.
              </p>
            ) : (
              <label className="cc-reply-editor">
                <span className="cc-sr-only">
                  {invitationMode ? "Invitation message" : "Next reply"}
                </span>
                <textarea
                  className="cc-draft"
                  rows={3}
                  value={draft}
                  disabled={
                    busy ||
                    ["queued", "checking", "sending", "uncertain"].includes(
                      action?.state || "",
                    ) ||
                    !action
                  }
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [person.id]: e.target.value,
                    }))
                  }
                  placeholder="Prepare a draft using verified conversation context."
                />
              </label>
            )}
            <div className="cc-reply-footer">
              {!capabilities.queue && invitationMode &&
                hasValue(selectedRecommendation?.personalized_message) && (
                  <details className="cc-original-draft">
                    <summary>Original ChatGPT Work draft</summary>
                    <p>{selectedRecommendation?.personalized_message}</p>
                  </details>
                )}
              {!capabilities.queue && <p className="cc-approval-note">
                <ShieldCheck size={15} />
                {action?.intent === "withdrawal"
                  ? "Approval applies only to this person's pending invitation. Acceptance or newer conversation activity stops the withdrawal."
                  : "Approval binds this text to this person and conversation. The live thread is checked again before sending."}
              </p>}
              {action && new Date(action.due_at).getTime() > now && (
                <p className="cc-muted">
                  <Clock3 size={13} /> Due {stamp(action.due_at)}
                </p>
              )}
              {action?.reason && (
                <p className="cc-muted">{pretty(action.reason)}</p>
              )}
              {snapshot.jobs
                .filter(
                  (j) => j.contact_id === person.id && j.state === "uncertain",
                )
                .map((j) => (
                  <div className="cc-manual" key={j.id}>
                    <h3>Resolve uncertain delivery</h3>
                    <p className="cc-muted">
                      Check this person’s LinkedIn conversation first. Record
                      what you observed. This job will never be retried
                      automatically.
                    </p>
                    <label>
                      Resolution evidence
                      <textarea
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        placeholder="Describe the visible message or evidence that it was not sent."
                      />
                    </label>
                    <div className="cc-draft-actions">
                      {(["sent", "not_sent"] as const).map((result) => (
                        <button
                          key={result}
                          disabled={busy || !capabilities.management || resolutionNote.trim().length < 10}
                          onClick={() =>
                            void execute("resolve_uncertain", {
                              contact_id: person.id,
                              job_id: j.id,
                              resolution: result,
                              note: resolutionNote,
                            }).then((ok) => {
                              if (ok) setResolutionNote("");
                            })
                          }
                        >
                          {result === "sent"
                            ? "I verified it was sent"
                            : "I verified it was not sent"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </div>
      </section>
    ) : null;

  return (
    <div className={`cc-shell outreach-app cc-density-${view}`}>
      <ApplicationSidebar profileTriggerRef={profileTriggerRef} view={view} onNavigate={go} userName={userName} demo={demo}
        onSettings={() => setShowSettings(true)} onLogout={onLogout}
        workspaceControls={<><WorkspaceConnectionDialog/>{accountControls}{client && <PrivacyDialog onExport={exportData} onDelete={deleteData}/>}</>}/>
      <main className="cc-main">


        {error && (
          <div className="cc-alert" role="alert">
            {error}
          </div>
        )}
        {feedback && (
          <div className="cc-feedback" role="status">
            <Check size={15} />
            {feedback}
          </div>
        )}
        {!snapshot ? (
          <div className="cc-empty">
            <LoaderCircle className="spin" />
            <h1>{error ? "Workspace update required" : "Opening your control center"}</h1>
            <p>
              {error || "Loading your relationships and conversation history."}
            </p>
            <button
              onClick={() => void load().catch((e) => setError(e.message))}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {view === "people" && <div className="shell-page-heading">
              {view === "people" ? <div><h1>People</h1><p>Manage and track your LinkedIn outreach.</p></div> : <span/>}
              <div className="shell-workspace-tools"><WorkspaceStatus demo={demo} failed={!!error || !!snapshot.compatibility?.failed_changes} pending={snapshot.compatibility?.pending_changes || 0} readOnly={readOnly && !capabilities.queue}/><button className="shell-workspace-badge" onClick={() => setShowSettings(true)}><ShieldCheck size={14}/>{demo ? "Sample workspace" : "Private workspace"}</button></div>
            </div>}
            {view === "overview" && projected && (
              <Suspense fallback={<p role="status">Loading overview…</p>}><OverviewDashboard relationships={relationships!} toolbar={<div className="shell-workspace-tools"><WorkspaceStatus demo={demo} failed={!!error || !!snapshot.compatibility?.failed_changes} pending={snapshot.compatibility?.pending_changes || 0} readOnly={readOnly && !capabilities.queue}/><button className="shell-workspace-badge" onClick={() => setShowSettings(true)}><ShieldCheck size={14}/>{demo ? "Sample workspace" : "Private workspace"}</button></div>} snapshot={{...snapshot,messages:[...snapshot.messages,...recordedMessages]}} activities={activityHistory} demo={demo} onSelect={go} onPerson={(id)=>{go("people","all");setSelected(id);}} /></Suspense>
            )}
            {view === "people" && (
              <section className="cc-list-section">
                {filter === "do_not_contact" && <p className="cc-muted">Excluded contacts and delivery holds. Open a person to review; uncertain sends must be checked before retrying.</p>}
                <button className="cc-attention-summary" onClick={()=>go("people","attention")}><TriangleAlert size={15}/> Needs attention · {relationships?.groups.attention.length ?? 0}</button>
                <div className="cc-work-status" role="group" aria-label="Outreach progress" hidden={capabilities.queue}>
                  <button onClick={() => go("people", capabilities.queue ? "to_connect" : "review")}>
                    <FileText size={14} aria-hidden="true"/><strong>{capabilities.queue ? snapshot.contacts.filter(c => c.connection_status === 'not_contacted' && manual.invitations[c.id]?.text && !manual.invitations[c.id]?.blocked_reason).length : relationships?.groups.review.length}</strong> {capabilities.queue ? 'Invitation drafts' : 'Drafts ready'}
                  </button>
                  <button onClick={() => go("people", "execution")}><Play size={14} aria-hidden="true"/>
                    <strong>
                      {relationships?.groups.execution.length || 0}
                    </strong>{" "}
                    Queued / running
                  </button>
                  <button onClick={() => go("people", "waiting")}>
                    <Clock3 size={14} aria-hidden="true"/><strong>{relationships?.groups.waiting.length}</strong> Waiting
                  </button>

                  <span className="cc-toolbar-fresh">
                    {demo
                      ? "Sample · "
                      : capabilities.queue ? "You trigger sending in ChatGPT Work · " : !snapshot.execution.outbound_enabled
                        ? "Sending paused · "
                        : ""}
                    Updated {stamp(snapshot.as_of)}
                  </span>
                </div>
                {["waiting", "pending", "withdrawal"].includes(filter) && (
                  <div className="cc-invitation-review-entry">
                    <button
                      aria-expanded={showBacklog}
                      onClick={() => setShowBacklog(!showBacklog)}
                    >
                      Review old invitations
                    </button>
                    {showBacklog && (
                      <InvitationReviewList
                        snapshot={snapshot}
                        busy={busy}
                        error={error}
                        onClose={() => setShowBacklog(false)}
                        onCommand={execute}
                        onNavigate={go}
                      />
                    )}
                  </div>
                )}
                <p className="cc-workflow-guide cc-sr">
                  {capabilities.queue ? 'Select people → queue saved invitations → trigger the batch in ChatGPT Work. Replies need your exact-message approval.' : 'Select people → prepare drafts → review & approve → queued outreach.'}
                </p>
                {!peopleFilterOptions.some(([id]) => id === filter) && (
                  <div className="cc-context-filter">
                    Showing:{" "}
                    {(
                      {
                        review: "Drafts ready",
                        execution: "Queued / running",
                        attention: "Needs attention",
                        prepare: "Needs preparation",
                        discovery: "Discovery",
                        outside: "Other connections",
                        pending: "Pending invitations",
                        waiting: "Waiting",
                        withdrawal: "Withdrawal review",
                        needs_action: "Next actions",
                      } as Record<string, string>
                    )[filter] || pretty(filter)}{" "}
                    <button onClick={() => go("people", "all")}>
                      Clear
                    </button>
                  </div>
                )}
                <div className="cc-filter-row">
                  <label className="cc-search">
                    <Search size={16} />
                    <input
                      aria-label="Search people"
                      placeholder="Name, company, or role"
                      value={query}
                      onChange={(e) => {
                        setBatchSelection([]);
                        setQuery(e.target.value);
                      }}
                    />
                  </label>
                  <select
                    aria-label="Filter people and actions"
                    value={
                      peopleFilterOptions.some(([id]) => id === filter)
                        ? filter
                        : ""
                    }
                    onChange={(e) => {
                      setSelected(null);
                      setBatchSelection([]);
                      setFilter(e.target.value);
                    }}
                  >
                    {!peopleFilterOptions.some(([id]) => id === filter) && (
                      <option value="" disabled>
                        Focused view
                      </option>
                    )}
                    {peopleFilterGroups.map(group => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {view === "people" && (
                    <>
                      <select
                        aria-label="Discovery track"
                        value={track}
                        onChange={(e) => {
                          setBatchSelection([]);
                          setTrack(e.target.value);
                        }}
                      >
                        <option value="all">Both tracks</option>
                        <option value="hiring_manager">Hiring contacts</option>
                        <option value="executive">Executives</option>
                      </select>
                      <DateRangeFilter from={dateFrom} to={dateTo} onChange={(from, to) => { setBatchSelection([]); setDateFrom(from); setDateTo(to); }} />
                    </>
                  )}
                </div>
                <div className="cc-list-caption">
                  <span>
                    {people.length} {people.length === 1 ? "person" : "people"}
                    {filter === "needs_action" &&
                    selected &&
                    !inboxNeedsAction(snapshot, selected, now)
                      ? " · includes your open conversation"
                      : ""}
                  </span>

                </div>
                {capabilities.queue && <ManualQueue stale={queueStale} onPerson={id=>{setFilter('all');setSelected(id);}} saveQueue={saveQueue} savingQueue={savingQueue} recovery={queueRecovery} retrySave={()=>{if(queueRecovery)void saveQueue(queueRecovery.items,queueRecovery.requestId);}} retryRefresh={retryQueueRefresh} refreshing={commandBusy && !savingQueue} data={{...manual,batches:relationships?.batches ?? manual.batches}} contacts={snapshot.contacts} selection={batchSelection} clear={ids => setBatchSelection(current => current.filter(id => !ids.includes(id)))} busy={busy} enabled={capabilities.queue} run={manualRun} dirty={Object.keys(messageEdits).filter(key => !key.includes(':') && messageEdits[key].text !== manual.invitations[key]?.text)} exclude={excludePeople} />}

                {!capabilities.queue && batchSelection.length > 0 && (
                  <div
                    className="cc-selection-bar"
                    aria-label="Selected people actions"
                  >
                    <strong>{batchSelection.length} selected</strong>
                    {!capabilities.preparation && <span className="cc-selection-unavailable" role="status">Selection saved on this page. Preparation and sending are not enabled yet.</span>}
                    {!!preparationIds.length && (
                      <button
                        className="cc-primary"
                        disabled={busy || !capabilities.preparation}
                        onClick={() => void runSelection("prepare")}
                      >
                        Prepare {preparationIds.length}{" "}
                        {selectedActions.every(
                          (a) => a?.intent === "invitation",
                        )
                          ? preparationIds.length === 1
                            ? "invitation"
                            : "invitations"
                          : preparationIds.length === 1
                            ? "draft"
                            : "drafts"}
                      </button>
                    )}
                    {!!reviewIds.length && (
                      <button
                        className="cc-primary"
                        disabled={
                          busy || !capabilities.approval ||
                          unsavedSelection ||
                          reviewIds.length !== batchSelection.length
                        }
                        onClick={() => void runSelection("approve")}
                      >
                        Approve &amp; queue {reviewIds.length}
                      </button>
                    )}
                    <details className="cc-selection-more">
                      <summary>More</summary>
                      <div className="cc-selection-menu">
                        <button
                          disabled={busy || !capabilities.management}
                          onClick={() => void runSelection("snooze")}
                        >
                          Set aside for 3 days
                        </button>
                        {batchSelection.every(
                          (id) =>
                            snapshot.contacts.find((c) => c.id === id)
                              ?.connection_status === "not_contacted",
                        ) && (
                          <button
                            disabled={busy || !capabilities.management}
                            onClick={() => void runSelection("discard")}
                          >
                            Discard selected
                          </button>
                        )}
                      </div>
                    </details>
                    <button
                      className="cc-deselect"
                      title="Untick selected people without changing their status"
                      disabled={busy}
                      onClick={() => setBatchSelection([])}
                    >
                      Deselect all
                    </button>
                    {unsavedSelection && (
                      <p>Save your edited drafts before approving.</p>
                    )}
                    {!!reviewIds.length && (
                      <p>
                        Review each selected message below. Approval queues only
                        the exact saved text.
                      </p>
                    )}
                  </div>
                )}
                {people.length === 0 ? (
                  <div className="cc-empty">
                    {filter === "needs_action" && !query
                      ? "You’re caught up. Choose All people to browse your relationships."
                      : "No people match this view."}
                  </div>
                ) : (
                  <div className="cc-people-list">
                    <div className={`cc-table-heading ${capabilities.queue ? "cc-manual-heading" : ""}`}>
                      <label className="cc-selection cc-header-selection"><input type="checkbox" aria-label="Select all eligible people shown" disabled={busy || !capabilities.selection || !selectable.length} checked={selectable.length > 0 && selectable.every(id => batchSelection.includes(id))} ref={element => {if(element)element.indeterminate = selectable.some(id => batchSelection.includes(id)) && !selectable.every(id => batchSelection.includes(id));}} onChange={e => setBatchSelection(e.target.checked ? selectable : [])} /></label>
                      <span>Person</span>
                      <span>Opportunity / purpose</span>
                      <span>Status</span>
                      {capabilities.queue && <span className="cc-sr-only">Contact preference</span>}
                      <span></span>
                    </div>
                    {people.map((c) => {
                      const a = currentAction(snapshot, c.id);
                      const stage = personStage(snapshot, c.id);
                      const recommendations = discoveryBuckets.get(c.id) ?? [];
                      const profileUrl = safeLink(c.linkedin_profile_url);
                      const identityMeta = [c.current_title, c.employer]
                        .filter(Boolean)
                        .join(", ");
                      return (
                        <article
                          key={c.id}
                          id={`person-row-${c.id}`}
                          className={`cc-person-row cc-compact-row cc-with-selection ${capabilities.queue ? "cc-manual-row" : ""} ${selected === c.id ? "cc-expanded-row" : ""}`}
                        >
                          <label className="cc-selection">
                            {selectable.includes(c.id) && (
                              <input
                                type="checkbox"
                                aria-label={`Select ${c.full_name}`}
                                disabled={busy || !capabilities.selection}
                                checked={batchSelection.includes(c.id)}
                                onChange={(e) =>
                                  setBatchSelection((ids) =>
                                    e.target.checked
                                      ? [...ids, c.id]
                                      : ids.filter((id) => id !== c.id),
                                  )
                                }
                              />
                            )}
                          </label>
                          <div className="cc-person-main">
                            <span className="sr-only">Person: </span>
                            <span className="cc-person-identity">
                              {profileUrl ? (
                                <a
                                  className="cc-person-name"
                                  href={profileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {c.full_name}
                                </a>
                              ) : (
                                <strong className="cc-person-name">
                                  {c.full_name}
                                </strong>
                              )}
                              {identityMeta && (
                                <small
                                  className="cc-person-role"
                                  title={identityMeta}
                                >
                                  · {identityMeta}
                                </small>
                              )}
                            </span>
                          </div>
                          <div className="cc-row-opportunity">
                            <span className="sr-only">Opportunity / purpose: </span>
                            <OpportunityLink
                              recommendations={recommendations}
                              className="cc-opportunity-link"
                            />
                          </div>
                          <div className="cc-row-meta">
                            <span className="sr-only">Status: </span>
                            <span
                              className={`cc-state cc-state-${stage}`}
                              title={stageLabels[stage]}
                            >
                              {capabilities.queue ? manualPersonStatus(c, manual) : stageLabels[stage]}
                            </span>
                          </div>
                          {capabilities.queue && (c.do_not_contact || snapshot.restrictions.excluded.includes(c.id) ? <button className="cc-row-exclude" title="Restore contact" aria-label={`Restore ${c.full_name}`} disabled={busy || !manual.people?.[c.id]?.can_restore} onClick={() => void manualRun('restore_exclusions', {contact_ids:[c.id]})}><RotateCcw size={16}/></button> : <button className="cc-row-exclude" title="Do not contact" aria-label={`Do not contact ${c.full_name}`} disabled={busy || !capabilities.contactManagement} onClick={() => void excludePeople([c.id])}><X size={16}/></button>)}
                          <button
                            className="cc-row-open"
                            id={`person-toggle-${c.id}`}
                            aria-expanded={selected === c.id}
                            aria-controls={`person-detail-${c.id}`}
                            aria-label={`${selected === c.id ? "Collapse" : "Expand"} ${c.full_name}`}
                            onClick={() => openPerson(c.id)}
                          >
                            <ChevronRight size={18} />
                          </button>
                          {selected === c.id && personDetail}
                          {!capabilities.queue && batchSelection.includes(c.id) &&
                            a?.state === "review" && (
                              <div className="cc-batch-draft">
                                <strong>
                                  {a.intent === "withdrawal"
                                    ? "Individual withdrawal approval"
                                    : "Exact text included for approval"}
                                </strong>
                                <p>
                                  {a.intent === "withdrawal"
                                    ? `Withdraw the pending invitation to ${c.full_name}. Live eligibility must be verified before acting.`
                                    : a.draft_text}
                                </p>
                              </div>
                            )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
      {showSettings && snapshot && (
        <WorkspaceSettings client={client}
          returnFocusRef={profileTriggerRef}
          snapshot={snapshot}
          demo={demo}
          busy={busy}
          onClose={() => setShowSettings(false)}
          onRefresh={async () => { await load(); }}
          onSave={(payload) => execute("set_invitation_policy", payload)}
        />
      )}
    </div>
  );
}
