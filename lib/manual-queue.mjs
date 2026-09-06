/** Pure presentation helpers: selecting people never performs a write. */
export function invitationMessage(actions = [], recommendations = []) {
  const action = actions.filter(a => a.intent === 'invitation' && a.draft_text?.trim())
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
  const recommendation = recommendations.filter(r => r.personalized_message?.trim())
    .sort((a, b) => (b.verified_at || '').localeCompare(a.verified_at || '') || b.id - a.id)[0];
  return action ? { text: action.draft_text, source: 'Saved invitation draft', date: action.updated_at, recommendation_id: recommendation?.id }
    : recommendation ? { text: recommendation.personalized_message, source: 'ChatGPT recommendation', date: recommendation.verified_at, recommendation_id: recommendation.id }
    : { text: '', source: 'No invitation message saved', date: null };
}
export function selectionSummary(contacts, ids) {
  const selected = contacts.filter(c => ids.includes(c.id));
  const invitations = selected.filter(c => c.connection_status === 'not_contacted');
  const replies = selected.filter(c => c.connection_status !== 'not_contacted');
  return { invitations: invitations.map(c => c.id), replies: replies.map(c => c.id),
    label: `${selected.length} selected: ${invitations.length} connection request${invitations.length === 1 ? '' : 's'}, ${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}` };
}
export function queueBlockReason(ids, invitations, enabled) {
  if (!enabled) return 'Connection queuing is not available in this workspace.';
  if (!ids.length) return 'Select people who need a connection request.';
  if (ids.length > 15) return 'Choose at most 15 connection requests per batch.';
  if (ids.some(id => !invitations[id]?.text?.trim())) return 'No invitation message saved for one or more selected people. Prepare a draft in ChatGPT Work first.';
  if (ids.some(id => invitations[id]?.blocked_reason)) return ids.map(id => invitations[id]?.blocked_reason).find(Boolean);
  return '';
}
export function batchCommand(batch) {
  return batch.kind === 'invitation' ? `Run my selected outreach batch ${batch.code}`
    : batch.kind === 'reply' ? `Run my approved reply batch ${batch.code}` : `Run my approved follow-up batch ${batch.code}`;
}
export function manualPersonStatus(contact, data) {
  if (contact.do_not_contact || data.people?.[contact.id]?.blocked_reason === 'Do not contact') return 'Do not contact';
  const items = data.batches.flatMap(b => (b.items || []).filter(i => i.contact_id === contact.id).map(i => ({...i,batch_status:b.status})));
  if (items.some(i => i.status === 'failed' || (i.status === 'prepared' && i.batch_status !== 'ready'))) return 'Needs reconciliation';
  if (items.some(i => i.status === 'prepared')) return 'Queued';
  const tasks = data.tasks.filter(t => t.contact_id === contact.id);
  if (tasks.some(t => t.status === 'needs_review' && t.draft_message)) return 'Needs approval';
  if (tasks.some(t => ['context_required','waiting'].includes(t.status))) return 'Needs preparation';
  if (contact.connection_status === 'not_contacted') return data.invitations[contact.id]?.text ? 'Invitation ready' : 'Needs preparation';
  return 'Waiting';
}
