import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("fresh installation defines every dashboard core table before later phases", () => {
  const migration = read("supabase/migrations/000_outreach_core.sql");
  for (const table of ["outreach_runs", "outreach_contacts", "outreach_recommendations", "outreach_activities", "outreach_app_access"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(migration, /enable row level security/g);
  assert.doesNotMatch(migration, /@gmail\.com|appgprj_|sb_publishable_[A-Za-z0-9_-]{8,}/);
});

test("first-owner claim cannot replace an existing owner", () => {
  const migration = read("supabase/migrations/012_phase_six_productization.sql");
  assert.match(migration, /lock table public\.outreach_app_access in exclusive mode/);
  assert.match(migration, /This installation already has an owner/);
  assert.match(migration, /DELETE ALL OUTREACH DATA/);
  assert.match(migration, /delete from public\.outreach_user_settings where user_id = v_user_id/);
  assert.match(migration, /outreach_user_settings enable row level security/);
});

test("official Pages opens Supabase Auth directly while forks keep private setup", () => {
  const setup = read("components/outreach-setup.tsx");
  const page = read("app/page.tsx");
  const deployment = read("lib/outreach-deployment.ts");
  assert.match(page, /if \(!supabase\) return <WorkspaceConnectionGate \/>/);
  assert.match(page, /runtimeEnv\.VITE_SUPABASE_URL \?\? deploymentCloudConfig\?\.url \?\? storedCloudConfig\?\.url/);
  assert.match(page, /if \(!session\) return <SignIn client=\{supabase\} \/>/);
  assert.match(deployment, /OUTREACH_HOST = "melvinroy\.github\.io"/);
  assert.match(deployment, /OUTREACH_PATH = "\/Outreach"/);
  assert.match(deployment, /OUTREACH_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_/);
  assert.doesNotMatch(deployment, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  assert.doesNotMatch(page, /if \(!supabase\) return <ConfigurationError \/>/);
  assert.match(setup, /WorkspaceConnectionDialog/);
  assert.match(setup, /Private workspace/);
  assert.match(setup, /one-time setup in this browser/);
  assert.match(page, /function DemoExperience/);
  assert.match(page, /product-shell demo-product/);
  assert.match(page, /Synthetic · safe preview/);
  assert.match(page, /syntheticQueue/);
  assert.match(page, /Today&apos;s outreach/);
  assert.match(setup, /workspace-connect/);
  const styles = read("app/globals.css");
  assert.match(styles, /demo-outreach-table \.actions-cell \{ display: table-cell/);
  assert.match(styles, /demo-account-menu \.workspace-connect[^}]*font-size: 0!important/);
  assert.match(styles, /Flat navy and white dashboard system/);
  assert.match(styles, /product-header[^}]*background: #0a2748/);
  assert.match(styles, /contact-row:nth-child\(even\)[^}]*background: #fff/);
  assert.match(styles, /Institutional desktop hierarchy and data density/);
  assert.match(styles, /outreach-table td[^}]*height: 50px[^}]*font-size: 12px/);
  assert.match(styles, /queue-card,\.demo-product \.queue-card[^}]*height: auto[^}]*border-radius: 8px/);
  assert.match(styles, /Shared typography hierarchy across every dashboard tab/);
  assert.match(styles, /Unified institutional surfaces across every dashboard view/);
  assert.match(page, /PRIORITY QUEUE/);
  assert.match(page, /Today&apos;s outreach<\/h2>/);
  assert.match(page, /demo-funnel-head/);
  assert.match(page, />Stage<\/span><span>Progress<\/span><strong>Total<\/strong>/);
  assert.match(styles, /demo-product \.demo-funnel > \.demo-funnel-head/);
  assert.match(styles, /demo-product \.demo-panel-list > div[^}]*border: 0[^}]*border-bottom: 1px solid #e3e9ee/);
  assert.match(styles, /demo-product \.demo-funnel i b[^}]*background: #1769aa/);
  assert.doesNotMatch(styles, /demo-product \.demo-funnel i b \{ background: linear-gradient/);
  assert.match(styles, /demo-product \.demo-workflow-grid > div[^}]*border-radius: 0/);
  assert.match(styles, /person-cell strong,\.demo-product \.person-cell strong[^}]*color: #25364a[^}]*font-weight: 600/);
  assert.match(styles, /person-cell strong,\.followup-person strong,\.conversation-task-person strong,\.demo-panel-list strong,\.demo-workflow-grid strong,\.workflow-row strong[^}]*font-size: 12px/);
  assert.match(styles, /demo-funnel > div,\.demo-funnel strong[^}]*font-size: 12px/);
  assert.match(styles, /\.demo-product \.workspace-bar \{ background: #fff/);
  assert.match(styles, /demo-product \.track-filter button\.active/);
  assert.match(setup, /URLSearchParams\(window\.location\.search\)/);
  assert.match(setup, /enterDemoMode/);
  assert.match(setup, /searchParams\.set\("demo", "1"\)/);
  assert.match(setup, /searchParams\.delete\("demo"\)/);
  assert.match(setup, /setItem\(CONFIG_KEY[\s\S]*openPrivateWorkspace\(\)/);
  assert.doesNotMatch(setup, /localStorage\.getItem\(MODE_KEY\) === "demo"/);
  assert.match(setup, /sb_publishable_/);
  assert.match(setup, /Secret keys, database passwords and LinkedIn credentials are rejected/);
});

test("automation templates are placeholders and never send automatically", () => {
  for (const file of ["automations/linkedin-acceptance-sync.md", "automations/linkedin-message-sync.md"]) {
    const contents = read(file);
    assert.match(contents, /\{\{SUPABASE_PROJECT_ID\}\}/);
    assert.match(contents, /Never/);
    assert.doesNotMatch(contents, /appgprj_|sb_publishable_|@gmail\.com/);
  }
});

test("authenticated browser users cannot truncate workflow tables", () => {
  const migration = read("supabase/migrations/013_revoke_broad_authenticated_privileges.sql");
  assert.match(migration, /revoke truncate, references, trigger/i);
  for (const table of ["outreach_assist_batches", "outreach_assist_sessions", "outreach_user_settings"]) {
    assert.match(migration, new RegExp(`public\\.${table}`));
  }
  assert.match(migration, /from authenticated/i);
});

test("release CI enforces the complete verification gate", () => {
  const workflow = read(".github/workflows/ci.yml");
  for (const command of [
    "npm run install:ci",
    "npm run privacy:scan",
    "npm run privacy:history",
    "npm run security:audit",
    "npm run typecheck",
    "npm run lint",
    "npm run test:contracts",
    "npm run build:pages",
  ]) assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(workflow, /VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(workflow, /git push\s+--force|one_time_history_finalize|commit-tree/);
});

test("public source has no legacy owner-branded dashboard copy", () => {
  const readme = read("README.md");
  const app = read("app/page.tsx");
  assert.doesNotMatch(readme, /private career-networking dashboard for/i);
  assert.doesNotMatch(app, /profile-orb[^\n]*private workspace/i);
});
