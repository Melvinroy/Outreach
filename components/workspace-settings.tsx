"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {WorkConnection} from "./work-connection";
import type {SupabaseClient} from "@supabase/supabase-js";
import { X } from "lucide-react";
import { defaultInvitationPolicy } from "@/lib/invitation-backlog.mjs";
import {
  connectionStatus,
  diagnosticText,
  sendingStatus,
  validateInvitationPreferences,
} from "@/lib/settings-status.mjs";
import type { InvitationBacklogState } from "./invitation-backlog";

type Sync = { state: string; error?: string; last_success_at?: string };
type SettingsSnapshot = {
  invitation_backlog?: InvitationBacklogState;
  workspace_sync?: Sync;
  connection_sync?: (Sync & { source: string })[];
  execution: { adapter: string; outbound_enabled: boolean };
  sync: {
    id: string;
    source: string;
    state: string;
    started_at?: string;
    finished_at?: string;
    error?: string;
  }[];
  intake?: {
    id: string;
    candidate_name: string;
    state: string;
    source: string;
    result?: string;
  }[];
};
type Props = {
  client?: SupabaseClient;
  returnFocusRef?: RefObject<HTMLElement | null>;
  snapshot: SettingsSnapshot;
  demo: boolean;
  busy: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSave: (payload: Record<string, unknown>) => Promise<boolean>;
};
function stamp(value?: string) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString()
    : "Not recorded";
}

export function WorkspaceSettings({
  client,
  returnFocusRef,
  snapshot,
  demo,
  busy,
  onClose,
  onRefresh,
  onSave,
}: Props) {
  const initial = {
    ...defaultInvitationPolicy,
    ...snapshot.invitation_backlog?.policy,
  };
  const [saved, setSaved] = useState(() => ({
    days: String(initial.withdrawal_days),
    threshold:
      initial.pending_threshold === null
        ? ""
        : String(initial.pending_threshold),
    mode: initial.threshold_mode,
  }));
  const [form, setForm] = useState(saved);
  const [confirmClose, setConfirmClose] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const panel = useRef<HTMLElement>(null);
  const closeChoice = useRef<HTMLButtonElement>(null);
  const dirty = JSON.stringify(saved) !== JSON.stringify(form);
  const close = () => {
    if (pending || busy) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const previous = returnFocusRef?.current ?? document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key !== "Tab") return;
      const items = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href]",
        ) || [],
      ).filter((el) => el.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handle);
      if (previous?.isConnected) previous.focus();
    };
  }, [returnFocusRef]);
  useEffect(() => {
    if (confirmClose) closeChoice.current?.focus();
  }, [confirmClose]);
  async function save(closeAfter = false) {
    const invalid = validateInvitationPreferences(
      form.days,
      form.threshold,
      form.mode,
    );
    setError(invalid);
    setNotice("");
    if (invalid) return;
    setPending(true);
    try {
      const ok = await onSave({
        withdrawal_days: Number(form.days),
        pending_threshold:
          form.threshold === "" ? null : Number(form.threshold),
        threshold_mode: form.mode,
      });
      if (!ok) {
        setError(
          "Preferences could not be saved. Your edits are still here; try again.",
        );
        return;
      }
      setSaved(form);
      setNotice("Preferences saved.");
      setConfirmClose(false);
      if (closeAfter) onClose();
    } catch {
      setError(
        "Preferences could not be saved. Your edits are still here; try again.",
      );
    } finally {
      setPending(false);
      requestAnimationFrame(() =>
        panel.current?.querySelector<HTMLInputElement>("input")?.focus(),
      );
    }
  }
  const linkedin = [
    snapshot.workspace_sync,
    ...(snapshot.connection_sync || []).filter((s) => s.source !== "gmail"),
  ].filter(Boolean) as Sync[];
  const gmail = (snapshot.connection_sync || []).filter(
    (s) => s.source === "gmail",
  );
  const connections = [
    { name: "LinkedIn", records: linkedin },
    { name: "Gmail notifications", records: gmail },
  ];
  const unresolved = (snapshot.intake || []).filter(
    (s) => !["verified", "ignored"].includes(s.state),
  );
  const problems = snapshot.sync
    .filter((s) => s.error || !["completed", "succeeded"].includes(s.state))
    .sort(
      (a, b) =>
        (Date.parse(b.finished_at || b.started_at || "") || 0) -
        (Date.parse(a.finished_at || a.started_at || "") || 0),
    )
    .slice(0, 10);
  return (
    <div className="cc-overlay cc-settings-overlay">
      <section
        ref={panel}
        className="cc-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-settings-title"
      >
        <header className="cc-settings-header">
          <h2 id="workspace-settings-title">Settings</h2>
          <button
            type="button"
            aria-label="Close settings"
            disabled={pending || busy}
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>
        <div className="cc-settings-body">
          <WorkConnection client={client} demo={demo}/>
          {demo && (
            <p className="cc-settings-sample">
              Sample workspace · Live connections unavailable
            </p>
          )}
          {confirmClose && (
            <div
              className="cc-settings-unsaved"
              role="group"
              aria-label="Unsaved preferences"
            >
              <strong>Save your changes?</strong>
              <p>You have unsaved invitation preferences.</p>
              <div className="cc-settings-actions">
                <button
                  disabled={pending || busy}
                  onClick={() => void save(true)}
                >
                  Save
                </button>
                <button disabled={pending || busy} onClick={onClose}>
                  Discard
                </button>
                <button
                  ref={closeChoice}
                  disabled={pending || busy}
                  onClick={() => {
                    setConfirmClose(false);
                    panel.current
                      ?.querySelector<HTMLInputElement>("input")
                      ?.focus();
                  }}
                >
                  Continue editing
                </button>
              </div>
            </div>
          )}
          <section
            className="cc-settings-section"
            aria-labelledby="settings-connections"
          >
            <h3 id="settings-connections">Connections</h3>
            {connections.map(({ name, records }) => {
              const status = connectionStatus(records, demo);
              const lastSuccess = records
                .map((s) => s.last_success_at)
                .filter(
                  (s): s is string => !!s && Number.isFinite(Date.parse(s)),
                )
                .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
              return (
                <div className="cc-connection-row" key={name}>
                  <div className="cc-connection-heading">
                    <strong>{name}</strong>
                    <span
                      className={
                        status === "Needs attention"
                          ? "cc-connection-warning"
                          : ""
                      }
                    >
                      {status}
                    </span>
                  </div>
                  <p>
                    Last successful update:{" "}
                    {demo ? "Not recorded" : stamp(lastSuccess)}
                  </p>
                  {!demo &&
                    (status === "Needs attention" ||
                      status === "Not verified") && (
                      <p>
                        {status === "Needs attention"
                          ? "Updates could not be completed."
                          : "No verified update is available."}{" "}
                        Check the connected account in your automation setup,
                        then let the next scheduled sync run.
                      </p>
                    )}
                </div>
              );
            })}
            <p className="cc-settings-note">
              Recorded sync results do not verify current account access.
            </p>
            <div className="cc-settings-refresh">
              <button
                type="button"
                disabled={pending || busy}
                onClick={async () => {
                  setPending(true);
                  setError("");
                  setNotice("");
                  try {
                    await onRefresh();
                    setNotice("Recorded status refreshed.");
                  } catch {
                    setError("Status could not be refreshed. Try again.");
                  } finally {
                    setPending(false);
                  }
                }}
              >
                Refresh status
              </button>
              <small>
                Reloads recorded status; does not reconnect accounts or start a
                sync.
              </small>
            </div>
            <p className="cc-settings-sending">
              <strong>Sending</strong>
              <span>{sendingStatus(snapshot.execution, demo)}</span>
            </p>
          </section>
          <section
            className="cc-settings-section"
            aria-labelledby="settings-invitations"
          >
            <h3 id="settings-invitations">Invitation preferences</h3>
            {snapshot.invitation_backlog?.inventory?.account_state ===
              "restricted" && (
              <p role="alert" className="cc-alert">
                LinkedIn invitations are restricted. Changing preferences will
                not lift this restriction.
              </p>
            )}
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label>
                Review pending invitations after (days)
                <input
                  type="number"
                  inputMode="numeric"
                  min={7}
                  max={90}
                  required
                  value={form.days}
                  disabled={pending || busy}
                  onChange={(e) => {
                    setForm({ ...form, days: e.target.value });
                    setNotice("");
                  }}
                />
              </label>
              <details>
                <summary>Advanced preferences</summary>
                <label>
                  Pending threshold (optional)
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    placeholder="Not set"
                    value={form.threshold}
                    disabled={pending || busy}
                    onChange={(e) => {
                      setForm({ ...form, threshold: e.target.value });
                      setNotice("");
                    }}
                  />
                </label>
                <label>
                  When the threshold is reached
                  <select
                    value={form.mode}
                    disabled={pending || busy}
                    onChange={(e) => {
                      setForm({ ...form, mode: e.target.value });
                      setNotice("");
                    }}
                  >
                    <option value="warn">Warn only</option>
                    <option value="hold">Hold new invitations</option>
                    <option value="cleanup">
                      Hold and suggest oldest invitations for review
                    </option>
                  </select>
                </label>
                <p className="cc-settings-note">
                  These are your preferences, not LinkedIn limits. Withdrawals
                  always require individual review and approval in People.
                </p>
              </details>
              <button
                className="cc-primary"
                disabled={!dirty || pending || busy}
              >
                Save preferences
              </button>
            </form>
          </section>
          {error && (
            <p role="alert" className="cc-alert">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="cc-feedback">
              {notice}
            </p>
          )}
          <details className="cc-settings-troubleshooting">
            <summary>Troubleshooting</summary>
            <p className="cc-settings-note">
              Recent problems and recorded configuration for diagnosis.
            </p>
            <p>
              Execution configuration:{" "}
              {snapshot.execution.adapter || "Not configured"}
            </p>
            {snapshot.invitation_backlog?.inventory?.coverage !==
              "complete" && (
              <p>
                Pending invitation inventory is incomplete. Totals require a
                complete check.
              </p>
            )}
            {[
              ...(snapshot.workspace_sync
                ? [
                    {
                      ...snapshot.workspace_sync,
                      source: "Shared LinkedIn sync",
                    },
                  ]
                : []),
              ...(snapshot.connection_sync || []),
            ].map((s, i) => (
              <div className="cc-diagnostic" key={`${s.source}-${i}`}>
                <strong>{s.source}</strong>
                <p>
                  {s.state} · Last success: {stamp(s.last_success_at)}
                </p>
                {s.error && (
                  <details>
                    <summary>Error details</summary>
                    <p>{diagnosticText(s.error)}</p>
                  </details>
                )}
              </div>
            ))}
            {problems.map((s) => (
              <div className="cc-diagnostic" key={s.id}>
                <strong>{s.source}</strong>
                <p>
                  {s.state} · {stamp(s.finished_at || s.started_at)}
                </p>
                {s.error && (
                  <details>
                    <summary>Error details</summary>
                    <p>{diagnosticText(s.error)}</p>
                  </details>
                )}
              </div>
            ))}
            {!!unresolved.length && <h4>Connections needing verification</h4>}
            {unresolved.map((s) => (
              <div className="cc-diagnostic" key={s.id}>
                <strong>{s.candidate_name}</strong>
                <p>
                  {s.state} · {s.source}
                </p>
              </div>
            ))}
            {!problems.length &&
              !unresolved.length &&
              ![...linkedin, ...gmail].some((s) => s.error) && (
                <p>
                  No recorded sync failures or unresolved connection signals.
                </p>
              )}
          </details>
        </div>
      </section>
    </div>
  );
}
