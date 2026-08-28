export type StorageMode = "demo" | "local" | "cloud";

export type WorkspaceConfig = {
  storageMode: StorageMode;
  workspaceName: string;
  displayName: string;
  targetRoles: string;
  targetLocations: string;
  hiringManagerTarget: number;
  executiveTarget: number;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type Contact = {
  id: string;
  full_name: string;
  employer: string;
  current_title: string | null;
  location: string | null;
  linkedin_profile_url: string;
  relationship_status: string;
  last_recommended_date: string;
};

export type Recommendation = {
  id: string;
  contact_id: string;
  track: "hiring_manager" | "executive";
  priority: number;
  opening_title: string | null;
  seniority_band: string | null;
  estimated_levels_above: number | null;
  verified_at: string;
};

export type WorkflowRun = {
  id: string;
  run_date: string;
  actual_hiring_managers: number;
  actual_executives: number;
  company_count: number;
};

export type RelationshipEvent = {
  id: string;
  contact_id: string;
  event_type: "recommended" | "connection_attempted" | "connection_accepted" | "follow_up_sent" | "reply_received" | "meeting_scheduled";
  event_at: string;
  evidence_source: "system" | "manual" | "browser_assisted" | "platform_api" | "demo";
};

export type OutreachSnapshot = {
  contacts: Contact[];
  recommendations: Recommendation[];
  runs: WorkflowRun[];
  events: RelationshipEvent[];
};

export const DEFAULT_CONFIG: WorkspaceConfig = {
  storageMode: "demo",
  workspaceName: "My outreach workspace",
  displayName: "Workspace owner",
  targetRoles: "Senior, Principal, Staff, Director",
  targetLocations: "United States",
  hiringManagerTarget: 15,
  executiveTarget: 15,
  supabaseUrl: "",
  supabasePublishableKey: "",
};

const today = "2026-08-27";

export const DEMO_SNAPSHOT: OutreachSnapshot = {
  contacts: [
    ["1", "Sample hiring leader", "Northstar Systems", "Director, Data & AI", "Seattle, WA", "connection_accepted"],
    ["2", "Sample executive", "Vertex Cloud", "Vice President, Enterprise AI", "San Francisco, CA", "follow_up_sent"],
    ["3", "Sample product leader", "Atlas Platforms", "Senior Director, Product", "Bellevue, WA", "connection_attempted"],
    ["4", "Sample risk leader", "Harbor Financial", "Vice President, Risk", "New York, NY", "reply_received"],
    ["5", "Sample AI leader", "Lumen Labs", "Director, Applied AI", "Mountain View, CA", "recommended"],
  ].map(([id, full_name, employer, current_title, location, relationship_status]) => ({
    id, full_name, employer, current_title, location, relationship_status,
    linkedin_profile_url: "", last_recommended_date: today,
  })),
  recommendations: [
    ...Array.from({ length: 15 }, (_, index) => ({ id: `hm-${index + 1}`, contact_id: String((index % 5) + 1), track: "hiring_manager" as const, priority: index + 1, opening_title: "Senior opportunity", seniority_band: "Director", estimated_levels_above: 1, verified_at: `${today}T10:00:00Z` })),
    ...Array.from({ length: 15 }, (_, index) => ({ id: `ex-${index + 1}`, contact_id: String((index % 5) + 1), track: "executive" as const, priority: index + 1, opening_title: null, seniority_band: "VP+", estimated_levels_above: 3, verified_at: `${today}T10:00:00Z` })),
  ],
  runs: [
    { id: "run-2", run_date: today, actual_hiring_managers: 15, actual_executives: 15, company_count: 5 },
    { id: "run-1", run_date: "2026-08-26", actual_hiring_managers: 15, actual_executives: 5, company_count: 4 },
  ],
  events: [
    ...Array.from({ length: 30 }, (_, index) => ({ id: `recommended-${index}`, contact_id: String((index % 5) + 1), event_type: "recommended" as const, event_at: `${today}T09:00:00Z`, evidence_source: "demo" as const })),
    ...Array.from({ length: 20 }, (_, index) => ({ id: `attempted-${index}`, contact_id: String((index % 5) + 1), event_type: "connection_attempted" as const, event_at: `${today}T10:00:00Z`, evidence_source: "demo" as const })),
    ...Array.from({ length: 10 }, (_, index) => ({ id: `accepted-${index}`, contact_id: String((index % 4) + 1), event_type: "connection_accepted" as const, event_at: `${today}T12:00:00Z`, evidence_source: "demo" as const })),
    ...Array.from({ length: 6 }, (_, index) => ({ id: `followup-${index}`, contact_id: String((index % 4) + 1), event_type: "follow_up_sent" as const, event_at: `${today}T13:00:00Z`, evidence_source: "demo" as const })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `reply-${index}`, contact_id: String(index + 1), event_type: "reply_received" as const, event_at: `${today}T15:00:00Z`, evidence_source: "demo" as const })),
  ],
};

export const EMPTY_SNAPSHOT: OutreachSnapshot = { contacts: [], recommendations: [], runs: [], events: [] };
