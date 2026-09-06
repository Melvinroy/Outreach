"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { projectInvitationBacklog } from "@/lib/invitation-backlog.mjs";
export type InvitationBacklogState = {
  policy?: {
    withdrawal_days: number;
    pending_threshold: number | null;
    threshold_mode: string;
  };
  inventory?: {
    coverage?: string;
    verified_at?: string;
    account_state?: string;
    account_checked_at?: string;
    restriction_note?: string;
  };
  items?: {
    contact_id: string;
    sent_at?: string | null;
    state: string;
    observed_at?: string;
  }[];
};
type Candidate = {
  contact_id: string;
  name: string;
  age_days: number;
  reason: string;
  needs_check: boolean;
};
type Props = {
  snapshot: Parameters<typeof projectInvitationBacklog>[0];
  busy: boolean;
  error?: string;
  onClose: () => void;
  onCommand: (cmd: string, p: Record<string, unknown>) => Promise<boolean>;
  onNavigate: (view: "people", filter: string) => void;
};
export const invitationHealth: Record<string, string> = {
  restricted: "Invitations restricted",
  unverified: "Inventory needs checking",
  held: "New invitations on hold",
  warning: "Pending threshold reached",
  no_threshold: "No capacity threshold set",
  within_policy: "Within your policy",
};
export function InvitationReviewList({
  snapshot,
  busy,
  error,
  onClose,
  onCommand,
  onNavigate,
}: Props) {
  const model = projectInvitationBacklog(snapshot),
    candidates = model.candidates as Candidate[];
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <section
      className="cc-invitation-review"
      aria-labelledby="cc-old-invitations-title"
    >
      <header>
        <h3 id="cc-old-invitations-title">Old invitations</h3>
        <button aria-label="Close old invitations" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {error && (
        <p className="cc-alert" role="alert">
          {error}
        </p>
      )}
      <p className="cc-muted">
        Review eligible invitations, oldest first. Preparation checks each
        person before individual approval.
      </p>
      <div className="cc-card-heading">
        <h3>Review candidates · oldest first</h3>
        <span>{candidates.length}</span>
      </div>
      {candidates.length ? (
        <div className="cc-withdrawal-candidates">
          {candidates.map((c) => (
            <label key={c.contact_id}>
              <input
                type="checkbox"
                checked={selected.includes(c.contact_id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, c.contact_id]
                      : ids.filter((id) => id !== c.contact_id),
                  )
                }
              />
              <span>
                <strong>{c.name}</strong>
                <small>
                  {c.age_days} days ·{" "}
                  {c.reason === "age" ? "Age policy" : "Capacity policy"}
                  {c.needs_check ? " · needs live verification" : ""}
                </small>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="cc-empty">
          No eligible withdrawals under this policy. Missing dates and newer
          conversations are not guessed.
        </p>
      )}
      <div className="cc-draft-actions">
        <button
          className="cc-primary"
          disabled={busy || selected.length === 0}
          onClick={() =>
            void onCommand("prepare_withdrawals", {
              contact_ids: candidates
                .filter((c) => selected.includes(c.contact_id))
                .map((c) => c.contact_id),
            }).then((ok) => {
              if (ok) {
                onClose();
                onNavigate("people", "withdrawal");
              }
            })
          }
        >
          Prepare {selected.length || ""} withdrawal reviews
        </button>
        <button
          onClick={() => {
            onClose();
            onNavigate("people", "pending");
          }}
        >
          View pending people
        </button>
      </div>
    </section>
  );
}
