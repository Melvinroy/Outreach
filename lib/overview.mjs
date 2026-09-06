import { projectControlCenter } from './control-center.mjs';
import { projectRelationships } from './relationship-projection.mjs';

export function projectOverview(snapshot, activities = []) {
  const contacts = new Map(snapshot.contacts.map(c => [c.id, c]));
  const relationship=projectRelationships(snapshot,{activities});
  const labels = { recommended: 'Added from discovery', request_sent: 'Connection request sent', connected: 'Connected', message_sent: 'Message sent', reply_received: 'Replied to your message', follow_up: 'Follow-up sent', meeting_scheduled: 'Meeting recorded', referral: 'Referral recorded', invitation_withdrawn: 'Invitation withdrawn', closed: 'Conversation closed', note: 'Note recorded' };
  const events = [];
  const add = (id, contactId, kind, label, date, rank) => {
    if (!contacts.has(contactId) || !date || !Number.isFinite(Date.parse(date))) return;
    events.push({ id: String(id), contactId, name: contacts.get(contactId).full_name, kind, label, date, rank });
  };
  for (const m of snapshot.messages || []) add(m.id, m.contact_id, m.direction === 'inbound' ? 'reply' : 'sent', m.direction === 'inbound' ? 'Replied to your message' : 'Message sent', m.occurred_at, 0);
  for (const a of activities) if (labels[a.activity_type]) add(a.id, a.contact_id, a.activity_type === 'reply_received' ? 'reply' : ['message_sent','follow_up'].includes(a.activity_type) ? 'sent' : a.activity_type, labels[a.activity_type], a.activity_at, 1);
  // Job creation records describe queueing, never a later delivery outcome.
  for (const j of snapshot.jobs || []) add(j.id, j.contact_id, 'queued', 'Outreach queued', j.created_at, 2);
  events.sort((a,b) => Date.parse(b.date)-Date.parse(a.date) || a.rank-b.rank || a.id.localeCompare(b.id));
  const recent = [];
  for (const e of events) {
    if (recent.some(r => r.contactId === e.contactId && r.kind === e.kind && Math.abs(Date.parse(r.date)-Date.parse(e.date)) < 60000)) continue;
    recent.push(e);
  }
  const projection = projectControlCenter({...snapshot, contacts: [...contacts.values()]});
  const stages = [
    ['discovery', 'From discovery', projection.discovered.length],
    ['people', 'People & history', contacts.size],
    ['prepare', 'Prepare', projection.stages.prepare.length],
    ['review', 'Review & approve', projection.stages.review.length],
    ['execute', 'Execute', projection.stages.queued.length + projection.stages.running.length],
    ['waiting', 'Waiting', projection.stages.waiting.length],
  ].map(([id, label, count]) => ({id, label, count, percent: contacts.size ? Math.round(count / contacts.size * 100) : null}));
  return { stages, discovered: projection.discovered.length, outside: projection.outside.length, unknownSource: projection.unknownSource.length, people: contacts.size, ...relationship, recent: recent.slice(0,4) };
}

export function relativeActivityTime(value, now = Date.now()) {
  const seconds = Math.round((Date.parse(value)-now)/1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return 'Just now';
  for (const [unit, size] of [['day',86400],['hour',3600],['minute',60]]) if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds/size), unit);
  return 'Just now';
}
