const DAY = 86400000;
export const defaultInvitationPolicy = {
  withdrawal_days: 14,
  pending_threshold: null,
  threshold_mode: "warn",
};
export function projectInvitationBacklog(snapshot, now = Date.now()) {
  const state = snapshot.invitation_backlog || {},
    policy = { ...defaultInvitationPolicy, ...state.policy },
    inventory = state.inventory || {};
  const fresh =
    inventory.coverage === "complete" &&
    Date.parse(inventory.verified_at) > now - DAY;
  const accountClear =
    inventory.account_state === "clear" &&
    Date.parse(inventory.account_checked_at) > now - DAY;
  const known = snapshot.contacts.filter(
    (c) => c.connection_status === "request_sent",
  );
  const records = state.items || [];
  const pending = records.filter((i) => i.state === "pending");
  const rows = known
    .map((c) => {
      const item = records.find((i) => i.contact_id === c.id);
      const sent = Date.parse(item?.sent_at);
      return {
        contact_id: c.id,
        name: c.full_name,
        sent_at: item?.sent_at || null,
        age_days: Number.isFinite(sent)
          ? Math.max(0, Math.floor((now - sent) / DAY))
          : null,
        state: item?.state || "unknown",
        blocked:
          c.do_not_contact ||
          snapshot.restrictions?.excluded?.includes(c.id) ||
          snapshot.restrictions?.discarded?.includes(c.id) ||
          snapshot.threads.some((t) => t.contact_id === c.id && t.closed_at) ||
          snapshot.messages.some(
            (m) =>
              m.contact_id === c.id &&
              (!m.occurred_at || Date.parse(m.occurred_at) >= sent),
          ),
      };
    })
    .sort(
      (a, b) =>
        (Date.parse(a.sent_at) || Infinity) -
          (Date.parse(b.sent_at) || Infinity) ||
        a.contact_id.localeCompare(b.contact_id),
    );
  const missingDates = pending.some(
    (i) => !Number.isFinite(Date.parse(i.sent_at)),
  );
  const excess =
    fresh && policy.pending_threshold !== null
      ? Math.max(0, pending.length - policy.pending_threshold)
      : 0;
  const eligible = rows.filter(
    (r) =>
      !r.blocked &&
      r.state !== "not_pending" &&
      (!fresh || r.state === "pending") &&
      r.age_days !== null,
  );
  const capacity =
    fresh && !missingDates && policy.threshold_mode === "cleanup"
      ? eligible.slice(0, excess).map((r) => r.contact_id)
      : [];
  const candidates = eligible
    .filter(
      (r) =>
        r.age_days >= policy.withdrawal_days || capacity.includes(r.contact_id),
    )
    .map((r) => ({
      ...r,
      reason: r.age_days >= policy.withdrawal_days ? "age" : "capacity",
      needs_check: !fresh || r.state !== "pending",
    }));
  const atThreshold =
    fresh &&
    policy.pending_threshold !== null &&
    pending.length >= policy.pending_threshold;
  const hold = atThreshold && policy.threshold_mode !== "warn";
  const health =
    inventory.account_state === "restricted"
      ? "restricted"
      : !fresh || !accountClear
        ? "unverified"
        : hold
          ? "held"
          : atThreshold
            ? "warning"
            : policy.pending_threshold === null
              ? "no_threshold"
              : "within_policy";
  return {
    policy,
    inventory,
    fresh,
    known_count: known.length,
    verified_count: fresh ? pending.length : null,
    oldest_known_days: rows.find((r) => r.age_days !== null)?.age_days ?? null,
    unknown_dates: rows.filter((r) => r.age_days === null).length,
    candidates,
    excess,
    health,
    can_invite: accountClear && fresh && !hold,
    rows,
  };
}
