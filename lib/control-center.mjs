import {
  projectInvitationBacklog,
  defaultInvitationPolicy,
} from "./invitation-backlog.mjs";
export const intentLabels = {
  invitation: "Invitation",
  new_message: "New message",
  reply: "Reply",
  follow_up: "Follow-up",
  withdrawal: "Withdrawal",
};
export const peopleFocusOptions = [
  ["all", "All people"],
  ["to_connect", "To connect"],
  ["conversations", "Conversations"],
  ["do_not_contact", "Do not contact"],
];
export const peopleFilterGroups = [
  {label: "People", options: peopleFocusOptions},
  {label: "Workflow", options: [
    ["prepare", "Prepare message"], ["review", "Ready for review"],
    ["execution", "Queued / running"], ["running", "Running"], ["waiting", "Waiting"],
  ]},
  {label: "Needs attention", options: [
    ["attention", "All needs attention"], ["reply_needed", "Reply received"],
    ["follow_up", "Follow-up due"], ["missing_preparation", "Missing source or invitation"],
    ["identity_blocked", "Identity blocked"], ["uncertain_delivery", "Uncertain delivery"],
    ["withdrawal", "Old pending invitations"],
  ]},
  {label: "Set aside", options: [["snoozed", "Snoozed"], ["closed", "Closed"]]},
];
export const peopleFilterOptions = peopleFilterGroups.flatMap(group => group.options);
export function matchesPeopleFocus(
  snapshot,
  contact,
  filter,
  now = Date.now(),
) {
  const stage = personStage(snapshot, contact.id, now);
  const action = currentAction(snapshot, contact.id);
  if (filter === "all") return true;
  const excluded = contact.do_not_contact || snapshot.restrictions?.excluded?.includes(contact.id);
  if (filter === "do_not_contact") return !!excluded;
  if (filter === "conversations") return !excluded && ['connected','messaged','replied','meeting_scheduled','referred'].includes(contact.connection_status);
  if (filter === "priority")
    return (
      ["prepare", "review"].includes(stage) &&
      (action?.intent === "reply" ||
        [
          "connected",
          "messaged",
          "replied",
          "meeting_scheduled",
          "referred",
        ].includes(contact.connection_status))
    );
  if (filter === "set_aside") return ["closed", "snoozed"].includes(stage);
  if (filter === "to_connect")
    return (
      contact.connection_status === "not_contacted" &&
      !excluded && !["closed", "snoozed"].includes(stage)
    );
  if (filter === "reply_needed")
    return (
      action?.intent === "reply" &&
      ["prepare", "review", "attention"].includes(stage)
    );
  if (filter === "follow_up")
    return (
      action?.intent === "follow_up" &&
      ["prepare", "review", "attention"].includes(stage)
    );
  if (filter === "connected")
    return (
      [
        "connected",
        "messaged",
        "replied",
        "meeting_scheduled",
        "referred",
      ].includes(contact.connection_status) &&
      !["closed", "snoozed"].includes(stage)
    );
  return false;
}
export function peoplePriority(snapshot, contactId, now = Date.now()) {
  const stage = personStage(snapshot, contactId, now);
  if (["queued", "running"].includes(stage)) return 5;
  if (stage === "waiting") return 6;
  if (["closed", "snoozed"].includes(stage)) return 7;
  const action = currentAction(snapshot, contactId);
  if (action?.intent === "reply") return 0;
  if (action?.intent === "new_message") return 1;
  if (action?.intent === "follow_up") return 2;
  return 3;
}
export function canSelectOutreach(snapshot, contactId, now = Date.now()) {
  const action = currentAction(snapshot, contactId);
  return (
    !!action &&
    action.intent !== "withdrawal" &&
    ["prepare", "review"].includes(personStage(snapshot, contactId, now))
  );
}
export const terminalJobs = new Set([
  "confirmed",
  "skipped",
  "blocked",
  "failed",
  "cancelled",
]);
export function projectMilestones(snapshot, activities = []) {
  const groups = [
    ["discovery", "Discovery"],
    ["outside", "Other connections"],
    ["legacy_unknown", "Source not recorded"],
  ];
  return groups.map(([origin, label]) => {
    const people = snapshot.contacts.filter(
        (c) => (c.origin || "legacy_unknown") === origin,
      ),
      ids = new Set(people.map((c) => c.id));
    const metric = (types, direction, statuses = []) =>
      new Set([
        ...activities
          .filter(
            (a) => ids.has(a.contact_id) && types.includes(a.activity_type),
          )
          .map((a) => a.contact_id),
        ...snapshot.messages
          .filter((m) => ids.has(m.contact_id) && m.direction === direction)
          .map((m) => m.contact_id),
        ...people
          .filter((c) => statuses.includes(c.connection_status))
          .map((c) => c.id),
      ]).size;
    return {
      label,
      people: people.length,
      invited: metric(["request_sent"], null, ["request_sent"]),
      connected: metric(["connected"], null, [
        "connected",
        "messaged",
        "replied",
        "meeting_scheduled",
        "referred",
      ]),
      messaged: metric(["message_sent", "follow_up"], "outbound", ["messaged"]),
      replied: metric(["reply_received"], "inbound", ["replied"]),
      meetings: metric(["meeting_scheduled"], null, ["meeting_scheduled"]),
    };
  });
}
export function currentAction(snapshot, contactId) {
  return snapshot.actions.find(
    (a) =>
      a.contact_id === contactId &&
      !["completed", "cancelled"].includes(a.state),
  );
}
export function personStage(snapshot, contactId, now = Date.now()) {
  const person = snapshot.contacts.find((c) => c.id === contactId);
  const thread = snapshot.threads.find((t) => t.contact_id === contactId);
  const action = currentAction(snapshot, contactId);
  const job = snapshot.jobs.find(
    (j) => j.contact_id === contactId && !terminalJobs.has(j.state),
  );
  if (action?.state === "uncertain" || job?.state === "uncertain")
    return "attention";
  if (
    person?.do_not_contact ||
    thread?.closed_at ||
    snapshot.restrictions?.discarded?.includes(contactId) ||
    snapshot.restrictions?.excluded?.includes(contactId)
  )
    return "closed";
  if (thread?.snoozed_until && Date.parse(thread.snoozed_until) > now)
    return "snoozed";
  if (job) return job.state === "queued" ? "queued" : "running";
  const recent = snapshot.jobs.find((j) => j.contact_id === contactId);
  if (
    recent &&
    ["failed", "blocked"].includes(recent.state) &&
    action?.state === "preparation"
  )
    return "attention";
  if (action?.due_at && Date.parse(action.due_at) > now) return "waiting";
  if (action?.state === "review") return "review";
  if (action?.state === "preparation") return "prepare";
  return thread?.state === "waiting" ? "waiting" : "prepare";
}
export function projectControlCenter(snapshot, now = Date.now()) {
  /** @type {Record<string,string[]>} */
  const stages = {
    prepare: [],
    review: [],
    queued: [],
    running: [],
    waiting: [],
    snoozed: [],
    attention: [],
    closed: [],
  };
  for (const c of snapshot.contacts)
    stages[personStage(snapshot, c.id, now)].push(c.id);
  return {
    stages,
    connected: snapshot.contacts
      .filter((c) =>
        [
          "connected",
          "messaged",
          "replied",
          "meeting_scheduled",
          "referred",
        ].includes(c.connection_status),
      )
      .map((c) => c.id),
    pending: snapshot.contacts
      .filter((c) => c.connection_status === "request_sent")
      .map((c) => c.id),
    outside: snapshot.contacts
      .filter((c) => c.origin === "outside")
      .map((c) => c.id),
    unknownSource: snapshot.contacts
      .filter((c) => !c.origin || c.origin === "legacy_unknown")
      .map((c) => c.id),
    discovered: snapshot.contacts
      .filter((c) => c.origin === "discovery")
      .map((c) => c.id),
    attention: [...stages.prepare, ...stages.review, ...stages.attention],
  };
}
/** Inbox is a work queue, not a second contact directory. */
export function inboxNeedsAction(snapshot, contactId, now = Date.now()) {
  return ["prepare", "review", "attention"].includes(
    personStage(snapshot, contactId, now),
  );
}
export function previewContactImport(text, contacts) {
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    throw new Error(
      "Use a JSON array of contacts with name, employer, profile_url, and optional connected.",
    );
  }
  if (!Array.isArray(rows) || rows.length > 100)
    throw new Error("Import between 1 and 100 contacts.");
  const existing = new Set(
    contacts.map((c) => profileIdentity(c.linkedin_profile_url)),
  );
  return rows.map((row, index) => {
    const key = profileIdentity(row.profile_url);
    const status =
      !row.name?.trim() || !row.employer?.trim() || !key
        ? "invalid"
        : existing.has(key)
          ? "existing"
          : "new";
    if (key) existing.add(key);
    return { ...row, index, status };
  });
}
export function profileIdentity(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      ["linkedin.com", "www.linkedin.com"].includes(u.hostname)
      ? u.pathname.match(/^\/in\/([^/]+)\/?$/)?.[1]?.toLowerCase() || null
      : null;
  } catch {
    return null;
  }
}
export function createDemoControlCenter(now = Date.now()) {
  const iso = (days = 0) => new Date(now + days * 86400000).toISOString();
  const names = [
    [
      "Avery Chen",
      "Northstar Systems",
      "Director, Product",
      "discovery",
      "not_contacted",
    ],
    ["Jordan Lee", "Vertex Cloud", "VP, Data", "discovery", "not_contacted"],
    [
      "Morgan Patel",
      "Atlas Platforms",
      "Hiring leader",
      "discovery",
      "request_sent",
    ],
    [
      "Taylor Brooks",
      "Harbor Financial",
      "Director, Risk",
      "discovery",
      "connected",
    ],
    ["Casey Rivera", "Lumen Labs", "AI product leader", "discovery", "replied"],
    ["Riley Morgan", "Cedar Works", "VP, Payments", "discovery", "connected"],
    ["Alex Santos", "Maple Studio", "Product Director", "outside", "replied"],
    ["Sam Park", "Lake Analytics", "Data Lead", "outside", "replied"],
    ["Robin Ellis", "Fern Labs", "Founder", "outside", "messaged"],
    ["Quinn Taylor", "Elm Research", "Director", "outside", "connected"],
  ];
  const contacts = names.map(
    ([full_name, employer, current_title, origin, connection_status], i) => ({
      id: `sample-${i}`,
      full_name,
      employer,
      current_title,
      origin,
      connection_status,
      linkedin_profile_url: `https://www.linkedin.com/in/sample-${i}`,
      do_not_contact: false,
      first_recommended_date: iso().slice(0, 10),
      last_recommended_date: iso().slice(0, 10),
    }),
  );
  const states = [
    "preparation",
    "preparation",
    "preparation",
    "review",
    "preparation",
    "queued",
    "preparation",
    "review",
    "preparation",
    "uncertain",
  ];
  const intents = [
    "invitation",
    "invitation",
    "withdrawal",
    "new_message",
    "reply",
    "new_message",
    "reply",
    "reply",
    "follow_up",
    "reply",
  ];
  const actions = contacts.map((c, i) => ({
    id: `action-${i}`,
    contact_id: c.id,
    intent: intents[i],
    state: states[i],
    context_version: 1,
    draft_revision: ["review", "queued"].includes(states[i]) ? 1 : 0,
    draft_text:
      i === 3
        ? "Hi Taylor, thanks for connecting. I enjoyed your perspective on risk decisions. What is your team focusing on this quarter?"
        : i === 7
          ? "Thanks, Sam. Tuesday works for me. Would 10am suit you?"
          : i === 5
            ? "Hi Riley, thanks for connecting. I would enjoy learning more about your payments work."
            : null,
    due_at: iso(i === 2 ? 5 : i === 8 ? 3 : 0),
    reason: null,
    created_at: iso(-1),
    updated_at: iso(),
  }));
  const threads = contacts.map((c, i) => ({
    contact_id: c.id,
    context_version: 1,
    coverage: [3, 5, 7, 8, 9].includes(i) ? "complete" : "partial",
    verified_at: [3, 5, 7, 8, 9].includes(i) ? iso() : null,
    state: i === 8 ? "waiting" : states[i],
    closed_at: null,
    snoozed_until: null,
    thread_url: null,
  }));
  const messages = [4, 6, 7, 8, 9].map((i) => ({
    id: `msg-${i}`,
    contact_id: contacts[i].id,
    evidence_key: `fixture-${i}`,
    direction: i === 8 ? "outbound" : "inbound",
    body:
      i === 7
        ? "Thanks for reaching out. Would Tuesday work for a brief conversation?"
        : i === 8
          ? "It was great meeting you. I would enjoy continuing our conversation."
          : "Thanks for connecting. Tell me more about your work.",
    occurred_at: iso(-1),
    observed_at: iso(),
    source: "browser",
    verified: true,
  }));
  const jobs = [
    {
      id: "job-5",
      contact_id: "sample-5",
      action_id: "action-5",
      kind: "send",
      state: "queued",
      result_code: null,
      created_at: iso(),
      batch_id: null,
    },
    {
      id: "job-9",
      contact_id: "sample-9",
      action_id: "action-9",
      kind: "send",
      state: "uncertain",
      result_code: "confirmation_unavailable",
      created_at: iso(),
      batch_id: null,
    },
  ];
  return {
    contacts,
    invitation_backlog: {
      policy: { ...defaultInvitationPolicy },
      inventory: {
        coverage: "complete",
        verified_at: iso(),
        account_state: "clear",
        account_checked_at: iso(),
      },
      items: [
        {
          contact_id: "sample-2",
          sent_at: iso(-9),
          state: "pending",
          observed_at: iso(),
        },
      ],
    },
    threads,
    actions,
    messages,
    jobs,
    events: [],
    sync: [
      {
        id: "sync-sample",
        source: "LinkedIn message sync",
        state: "completed",
        started_at: iso(),
        finished_at: iso(),
        coverage: { contacts: 5 },
      },
    ],
    execution: { outbound_enabled: false, adapter: "demo" },
    restrictions: { excluded: [], discarded: [] },
    as_of: iso(),
  };
}

export function createDemoDiscoveryRuns(now = Date.now()) {
  const iso = (days = 0, atTime = false) => {
    const date = new Date(now + days * 86400000).toISOString();
    return atTime ? date : date.slice(0, 10);
  };
  return [
    {
      id: "sample-run-recent",
      run_date: iso(-1),
      generated_at_sgt: iso(-1, true),
      actual_hiring_managers: 4,
      actual_executives: 3,
      company_count: 8,
    },
    {
      id: "sample-run-earlier",
      run_date: iso(-8),
      generated_at_sgt: iso(-8, true),
      actual_hiring_managers: 2,
      actual_executives: 2,
      company_count: 6,
    },
    {
      id: "sample-run-archive",
      run_date: iso(-14),
      generated_at_sgt: iso(-14, true),
      actual_hiring_managers: 1,
      actual_executives: 1,
      company_count: 3,
    },
  ];
}

export function createDemoDiscovery(now = Date.now()) {
  const base = createDemoControlCenter(now);
  const runs = createDemoDiscoveryRuns(now);
  const byId = Object.fromEntries(runs.map((run) => [run.id, run.run_date]));
  const d = (days = 0) => new Date(now + days * 86400000).toISOString();
  return [
    {
      id: 101,
      contact_id: base.contacts[0].id,
      track: "hiring",
      priority: 1,
      fit_assessment:
        "Built scalable LinkedIn expansion workflows in startup environments.",
      opening_title: "Director of Growth",
      genuine_gap:
        "Hiring manager mentions partner enablement gap for first-party outreach.",
      active_job_url: "https://www.linkedin.com/jobs/view/4512334",
      hiring_post_url:
        "https://www.linkedin.com/posts/sample-opportunity-4512334",
      personalized_message:
        "Hi Avery, your team’s growth work aligns tightly with our outreach model.",
      verified_at: d(-1),
      run_date: byId["sample-run-recent"],
    },
    {
      id: 102,
      contact_id: base.contacts[0].id,
      track: "hiring",
      priority: 2,
      fit_assessment:
        "Prior connection from earlier campaign; likely still open to a warm follow-up.",
      opening_title: "Senior Product Director",
      genuine_gap: null,
      active_job_url: "https://www.linkedin.com/jobs/view/4411002",
      hiring_post_url: null,
      personalized_message:
        "Hi Avery, following up from our previous outreach thread.",
      verified_at: d(-10),
      run_date: byId["sample-run-earlier"],
    },
    {
      id: 201,
      contact_id: base.contacts[1].id,
      track: "executive",
      priority: 1,
      fit_assessment:
        "Decision-maker with direct ownership of data platform modernization.",
      opening_title: null,
      genuine_gap:
        "No posted role, but public hiring signal suggests leadership expansion.",
      active_job_url: null,
      hiring_post_url: null,
      personalized_message:
        "Hi Jordan, your data modernization work is exactly where our team can add value.",
      verified_at: d(-2),
      run_date: byId["sample-run-recent"],
    },
    {
      id: 301,
      contact_id: base.contacts[2].id,
      track: "hiring",
      priority: 1,
      fit_assessment:
        "Request sent recently; first connection message had strong engagement.",
      opening_title: "Head of People Operations",
      genuine_gap: "Limited outbound process visibility in the last 30 days.",
      active_job_url: "https://www.linkedin.com/jobs/view/3321988",
      hiring_post_url:
        "https://www.linkedin.com/posts/sample-opportunity-3321988",
      personalized_message:
        "Hi Morgan, thanks again for the request; here is a focused message draft.",
      verified_at: d(-4),
      run_date: byId["sample-run-recent"],
    },
    {
      id: 302,
      contact_id: base.contacts[2].id,
      track: "executive",
      priority: 1,
      fit_assessment: "Legacy signal captured from prior outreach run.",
      opening_title: "People Ops Lead",
      genuine_gap: null,
      active_job_url: "https://www.linkedin.com/jobs/view/3321001",
      hiring_post_url:
        "https://www.linkedin.com/posts/sample-opportunity-3321001",
      personalized_message:
        "Hi Morgan, following up on your leadership hiring priorities.",
      verified_at: d(-16),
      run_date: byId["sample-run-archive"],
    },
    {
      id: 401,
      contact_id: base.contacts[3].id,
      track: "executive",
      priority: 1,
      fit_assessment:
        "Current risk lead role suggests they own external relationship decisions.",
      opening_title: "Senior Director, Risk",
      genuine_gap: "Need for a partner that combines product and automation.",
      active_job_url: null,
      hiring_post_url:
        "https://www.linkedin.com/posts/sample-opportunity-risk-risk",
      personalized_message:
        "Hi Taylor, would you be open to a quick intro on how teams reduce risk-cycle lag?",
      verified_at: d(-1),
      run_date: byId["sample-run-recent"],
    },
    {
      id: 501,
      contact_id: base.contacts[4].id,
      track: "hiring",
      priority: 3,
      fit_assessment:
        "AI product lead in AI lab with hiring momentum this quarter.",
      opening_title: "Head of AI",
      genuine_gap: null,
      active_job_url: "https://www.linkedin.com/jobs/view/5512441",
      hiring_post_url:
        "https://www.linkedin.com/posts/sample-opportunity-ai-head-5512441",
      personalized_message:
        "Hi Casey, I’d like to support your AI product launch conversations.",
      verified_at: d(-3),
      run_date: byId["sample-run-earlier"],
    },
    {
      id: 601,
      contact_id: base.contacts[5].id,
      track: "hiring",
      priority: 2,
      fit_assessment: "Payments modernization with strong execution focus.",
      opening_title: "VP, Payments",
      genuine_gap:
        "No public context for inbound partner ownership role in current cycle.",
      active_job_url: null,
      hiring_post_url: null,
      personalized_message:
        "Hi Riley, I can help with your payments operating model work.",
      verified_at: d(-2),
      run_date: byId["sample-run-recent"],
    },
    {
      id: 701,
      contact_id: base.contacts[6].id,
      track: "executive",
      priority: 1,
      fit_assessment: "Strong profile on outbound design and team execution.",
      opening_title: "Product Director",
      genuine_gap: null,
      active_job_url: "https://www.linkedin.com/jobs/view/7712341",
      hiring_post_url: null,
      personalized_message:
        "Hi Alex, we can shorten your next external review cycle by adding a structured process.",
      verified_at: d(-12),
      run_date: byId["sample-run-archive"],
    },
  ].map((item) => ({
    ...item,
    fit_assessment: `Sample research: ${item.fit_assessment}`,
    personalized_message: `Sample draft: ${item.personalized_message}`,
  }));
}
/** Local demo reducer; all outcomes remain explicitly simulated. */
export function applyDemoCommand(snapshot, cmd, p, now = Date.now()) {
  const s = structuredClone(snapshot),
    iso = new Date(now).toISOString(),
    uid = () => globalThis.crypto.randomUUID();
  let c = s.contacts.find((c) => c.id === p.contact_id),
    a = currentAction(s, p.contact_id),
    t = s.threads.find((t) => t.contact_id === p.contact_id);
  const invalidate = () => {
    s.jobs
      .filter(
        (j) => j.contact_id === p.contact_id && !terminalJobs.has(j.state),
      )
      .forEach((j) => {
        j.state = j.state === "uncertain" ? "uncertain" : "cancelled";
        j.result_code = "context_changed";
      });
  };
  if (cmd === "demo_backlog_scenario") {
    const next = createDemoControlCenter(now);
    if (p.scenario === "volume") {
      const firstNames = [
        "Avery",
        "Jordan",
        "Morgan",
        "Taylor",
        "Casey",
        "Riley",
        "Alex",
        "Sam",
        "Robin",
        "Quinn",
      ];
      const lastNames = ["Chen", "Park", "Rivera", "Brooks", "Santos"];
      const base = structuredClone(next);
      next.contacts = [];
      next.actions = [];
      next.threads = [];
      next.messages = [];
      next.jobs = [];
      for (let i = 0; i < 50; i++) {
        const id = `volume-${i}`,
          source = base.contacts[i % 10],
          sourceId = source.id;
        next.contacts.push({
          ...source,
          id,
          full_name: `${firstNames[i % 10]} ${lastNames[Math.floor(i / 10)]}`,
          linkedin_profile_url: `https://www.linkedin.com/in/sample-volume-${i}`,
        });
        for (const key of ["threads", "actions", "messages", "jobs"])
          for (const row of base[key].filter((r) => r.contact_id === sourceId))
            next[key].push({
              ...row,
              id: `${key}-volume-${i}-${next[key].length}`,
              contact_id: id,
              ...(key === "jobs"
                ? {
                    action_id: `actions-volume-${i}-${next.actions.length - 1}`,
                  }
                : {}),
            });
      }
      next.invitation_backlog.items = [];
      next.invitation_backlog.inventory.coverage = "partial";
      return next;
    }
    if (p.scenario === "empty") {
      next.contacts = [];
      next.threads = [];
      next.actions = [];
      next.messages = [];
      next.jobs = [];
      next.sync = [];
      next.intake = [];
      next.invitation_backlog.items = [];
      return next;
    }
    if (p.scenario === "unknown") {
      next.invitation_backlog.inventory.coverage = "partial";
      next.invitation_backlog.inventory.account_state = "unknown";
      return next;
    }
    if (p.scenario === "long") {
      next.contacts[0].full_name = "Alexandria Chen-Williams";
      next.contacts[0].current_title =
        "Executive Director, Global Product Strategy and Enterprise Transformation";
      next.contacts[0].employer =
        "Northstar International Technology and Research Group";
      next.connection_sync = [
        {
          source: "gmail",
          state: "failed",
          error: "Reconnect Gmail to resume connection notifications.",
          last_success_at: null,
        },
      ];
      return next;
    }
    if (p.scenario === "restricted") {
      next.invitation_backlog.inventory.account_state = "restricted";
      return next;
    }
    if (p.scenario === "aged")
      for (const [id, days] of [
        ["sample-0", 30],
        ["sample-1", 20],
      ]) {
        const person = next.contacts.find((c) => c.id === id);
        person.connection_status = "request_sent";
        const action = currentAction(next, id);
        action.intent = "withdrawal";
        action.draft_text = "";
        action.state = "preparation";
        action.due_at = new Date(now - (days - 14) * 86400000).toISOString();
        next.invitation_backlog.items.push({
          contact_id: id,
          sent_at: new Date(now - days * 86400000).toISOString(),
          state: "pending",
          observed_at: iso,
        });
      }
    return next;
  }
  if (cmd === "set_invitation_policy") {
    if (
      !Number.isInteger(p.withdrawal_days) ||
      p.withdrawal_days < 7 ||
      p.withdrawal_days > 90 ||
      (p.pending_threshold !== null &&
        (!Number.isInteger(p.pending_threshold) || p.pending_threshold < 1)) ||
      !["warn", "hold", "cleanup"].includes(p.threshold_mode)
    )
      throw new Error("Invalid invitation policy");
    s.invitation_backlog ??= {
      policy: { ...defaultInvitationPolicy },
      inventory: {},
      items: [],
    };
    s.invitation_backlog.policy = { ...p };
    for (const action of s.actions.filter((a) =>
      ["invitation", "withdrawal"].includes(a.intent),
    )) {
      if (action.state === "uncertain") continue;
      s.jobs
        .filter((j) => j.action_id === action.id && !terminalJobs.has(j.state))
        .forEach((j) => (j.state = "cancelled"));
      action.state = "preparation";
      if (action.intent === "withdrawal") {
        const item = s.invitation_backlog.items.find(
          (i) => i.contact_id === action.contact_id,
        );
        if (item?.sent_at)
          action.due_at = new Date(
            Date.parse(item.sent_at) + p.withdrawal_days * 86400000,
          ).toISOString();
      }
    }
    return s;
  }
  if (cmd === "prepare_withdrawals") {
    const eligible = projectInvitationBacklog(s, now).candidates;
    for (const id of p.contact_ids) {
      if (!eligible.some((x) => x.contact_id === id))
        throw new Error("Candidate changed; refresh the backlog");
      const action = currentAction(s, id),
        thread = s.threads.find((t) => t.contact_id === id);
      action.state = "review";
      action.draft_text = "";
      action.draft_revision++;
      action.due_at = iso;
      thread.coverage = "complete";
      thread.verified_at = iso;
    }
    return s;
  }
  if (cmd === "simulate_connection_sync") {
    const profile = "https://www.linkedin.com/in/sample-auto-connection";
    let next = applyDemoCommand(
      s,
      "capture",
      {
        name: "Drew Morgan",
        employer: "Sample Network",
        title: "Product leader",
        profile_url: profile,
        connected: true,
      },
      now,
    );
    const person = next.contacts.find(
        (c) => c.linkedin_profile_url === profile,
      ),
      thread = next.threads.find((t) => t.contact_id === person.id),
      action = currentAction(next, person.id);
    if (!next.messages.some((m) => m.evidence_key === "sample-auto-outbound"))
      next.messages.push({
        id: uid(),
        contact_id: person.id,
        evidence_key: "sample-auto-outbound",
        direction: "outbound",
        body: "Great connecting with you. I enjoyed our conversation about your product team.",
        occurred_at: iso,
        source: "demo",
        verified: true,
      });
    thread.coverage = "complete";
    thread.verified_at = iso;
    thread.context_version = 1;
    thread.state = "waiting";
    action.intent = "follow_up";
    action.state = "preparation";
    action.context_version = 1;
    action.due_at = new Date(now + 7 * 86400000).toISOString();
    next.intake = [
      {
        id: "sample-auto-signal",
        candidate_name: person.full_name,
        state: "verified",
        result: "outside_added",
        source: "gmail",
      },
    ];
    next.connection_sync = [
      { source: "gmail", state: "completed", last_success_at: iso },
      { source: "linkedin", state: "completed", last_success_at: iso },
    ];
    next.as_of = iso;
    return next;
  }
  if (cmd === "capture") {
    if (
      !profileIdentity(p.profile_url) ||
      !p.name?.trim() ||
      !p.employer?.trim()
    )
      throw new Error(
        "Name, employer and a valid LinkedIn profile URL are required.",
      );
    if (
      s.contacts.some(
        (c) =>
          profileIdentity(c.linkedin_profile_url) ===
          profileIdentity(p.profile_url),
      )
    )
      return s;
    const id = uid();
    s.contacts.push({
      id,
      full_name: p.name,
      employer: p.employer,
      current_title: p.title || "",
      linkedin_profile_url: p.profile_url,
      origin: "outside",
      connection_status: p.connected ? "connected" : "not_contacted",
      do_not_contact: false,
      last_recommended_date: iso.slice(0, 10),
    });
    s.threads.push({
      contact_id: id,
      context_version: 0,
      coverage: "unknown",
      state: "verification_required",
    });
    s.actions.push({
      id: uid(),
      contact_id: id,
      intent: p.connected ? "new_message" : "invitation",
      state: "preparation",
      draft_revision: 0,
      context_version: 0,
      due_at: iso,
    });
  } else if (!c || !t) throw new Error("Person not found");
  else if (cmd === "save_draft") {
    invalidate();
    a.draft_text = p.text;
    a.draft_revision++;
    a.context_version = t.context_version;
    a.state = "review";
  } else if (cmd === "prepare") {
    if (c.do_not_contact || t.closed_at) throw new Error("Person is closed.");
    t.coverage = "complete";
    t.verified_at = iso;
    a.state = "review";
    a.context_version = t.context_version;
    a.draft_revision++;
    a.draft_text =
      a.intent === "withdrawal"
        ? ""
        : a.intent === "reply"
          ? `Thanks, ${c.full_name.split(" ")[0]}. I would enjoy hearing more. Would next week work for a short conversation?`
          : `Hi ${c.full_name.split(" ")[0]}, I enjoyed learning about your work at ${c.employer}. I would welcome the chance to connect.`;
    s.events.unshift({
      id: uid(),
      state: "Sample context checked and draft prepared",
      created_at: iso,
    });
  } else if (cmd === "approve") {
    if (
      a.intent === "invitation" &&
      !projectInvitationBacklog(s, now).can_invite
    )
      throw new Error(
        "Invitation policy requires a fresh inventory and clear account status.",
      );
    if (
      a.intent === "withdrawal" &&
      !projectInvitationBacklog(s, now).candidates.some(
        (x) => x.contact_id === c.id,
      )
    )
      throw new Error("Withdrawal is no longer eligible.");
    if (
      a.state !== "review" ||
      a.draft_text !== p.text ||
      a.draft_revision !== p.draft_revision ||
      t.coverage !== "complete" ||
      c.do_not_contact ||
      t.closed_at ||
      Date.parse(a.due_at) > now ||
      Date.parse(t.snoozed_until) > now
    )
      throw new Error("Review the current verified draft first.");
    a.state = "queued";
    s.jobs.unshift({
      id: uid(),
      contact_id: c.id,
      action_id: a.id,
      kind: "send",
      message_text: p.text,
      state: "queued",
      created_at: iso,
      batch_id: p.batch_id || null,
    });
  } else if (cmd === "simulate_send") {
    const j = s.jobs.find((j) => j.contact_id === c.id && j.state === "queued");
    if (!j) throw new Error("No approved sample job");
    j.state = "confirmed";
    j.result_code = "sample_sent_confirmed";
    a.state = "completed";
    if (!["withdrawal", "invitation"].includes(a.intent))
      s.messages.push({
        id: uid(),
        contact_id: c.id,
        direction: "outbound",
        body: j.message_text ?? a.draft_text,
        occurred_at: iso,
        source: "demo",
        verified: true,
      });
    t.context_version++;
    c.connection_status =
      a.intent === "invitation"
        ? "request_sent"
        : a.intent === "withdrawal"
          ? "withdrawn"
          : "messaged";
    if (a.intent === "withdrawal") {
      c.invitation_resend_after = new Date(now + 21 * 86400000).toISOString();
      const item = s.invitation_backlog?.items.find(
        (i) => i.contact_id === c.id,
      );
      if (item) item.state = "not_pending";
      t.state = "waiting";
      s.as_of = iso;
      return s;
    }
    s.actions.push({
      id: uid(),
      contact_id: c.id,
      intent:
        a.intent === "invitation"
          ? "withdrawal"
          : a.intent === "withdrawal"
            ? "invitation"
            : "follow_up",
      state: "preparation",
      draft_revision: 0,
      context_version: t.context_version,
      due_at: new Date(
        now + (a.intent === "invitation" ? 14 : 7) * 86400000,
      ).toISOString(),
    });
    t.state = "waiting";
  } else if (cmd === "resolve_uncertain") {
    const j = s.jobs.find(
      (j) =>
        j.id === p.job_id && j.contact_id === c.id && j.state === "uncertain",
    );
    if (
      !j ||
      !["sent", "not_sent"].includes(p.resolution) ||
      p.note?.trim().length < 10
    )
      throw new Error("Record evidence for this uncertain job.");
    j.state = "skipped";
    j.result_code = `owner_reported_${p.resolution}`;
    if (a) {
      a.state = "preparation";
      a.context_version = ++t.context_version;
      if (p.resolution === "sent") {
        a.intent = "follow_up";
        a.due_at = new Date(now + 7 * 86400000).toISOString();
      }
    }
    t.coverage = "partial";
    s.events.unshift({ id: uid(), state: j.result_code, created_at: iso });
  } else if (cmd === "manual_message") {
    invalidate();
    t.context_version++;
    t.coverage = "partial";
    s.messages.push({
      id: uid(),
      contact_id: c.id,
      direction: p.direction,
      body: p.body,
      occurred_at: iso,
      source: "manual",
      verified: false,
    });
    if (a && a.state !== "uncertain") {
      a.intent = p.direction === "inbound" ? "reply" : "follow_up";
      a.state = "preparation";
      a.context_version = t.context_version;
      a.due_at =
        p.direction === "inbound"
          ? iso
          : new Date(now + 7 * 86400000).toISOString();
    }
  } else if (cmd === "cancel_approval") {
    invalidate();
    a.state = "preparation";
  } else if (cmd === "snooze") {
    invalidate();
    t.snoozed_until = p.until;
    a.state = "snoozed";
  } else if (cmd === "close" || cmd === "do_not_contact") {
    invalidate();
    t.closed_at = iso;
    if (a) a.state = "cancelled";
    if (cmd === "do_not_contact") c.do_not_contact = true;
  } else if (cmd === "reopen") {
    if (c.do_not_contact)
      throw new Error("Do-not-contact restriction remains active.");
    t.closed_at = null;
    t.snoozed_until = null;
    if (a) a.state = "preparation";
    else
      s.actions.push({
        id: uid(),
        contact_id: c.id,
        intent: "new_message",
        state: "preparation",
        draft_revision: 0,
        context_version: t.context_version,
        due_at: iso,
      });
  } else if (cmd === "relationship") {
    invalidate();
    c.connection_status = p.status;
    t.context_version++;
    t.coverage = "partial";
    if (a) {
      a.intent = p.status === "request_sent" ? "withdrawal" : "new_message";
      a.state = "preparation";
    }
  } else if (cmd === "discard") {
    invalidate();
    s.restrictions.discarded.push(c.id);
  } else if (cmd === "restore") {
    s.restrictions.discarded = s.restrictions.discarded.filter(
      (x) => x !== c.id,
    );
  } else if (cmd !== "refresh") throw new Error("Unknown demo action");
  s.as_of = iso;
  return s;
}
