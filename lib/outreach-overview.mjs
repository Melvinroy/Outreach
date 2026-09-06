/** Count people from evidence; stage memberships may overlap across time.
 * @param {{readyContactIds:string[],activities:{contact_id:string,activity_type:string}[],tasks:{contact_id:string,task_type:string,status:string,due_at:string,draft_message?:string|null}[],contacts?:{id:string,status:string}[],discoveryIds?:string[],outsideIds?:string[]|null,now?:number}} input
 */
export function summarizeOverview({ readyContactIds, activities, tasks, contacts = [], discoveryIds = [], outsideIds = null, now = Date.now() }) {
  const unique = (ids) => [...new Set(ids)];
  const events = (types) => unique(activities.filter(e => types.includes(e.activity_type)).map(e => e.contact_id));
  const people = (statuses) => contacts.filter(c => statuses.includes(c.status)).map(c => c.id);
  const activeReplies = tasks.filter(t => t.task_type === 'reply' && ['context_required', 'needs_review'].includes(t.status));
  const followUps = tasks.filter(t => t.task_type === 'proactive_follow_up' && t.status === 'needs_review' && Date.parse(t.due_at) <= now);
  const actionable = [...activeReplies, ...followUps];
  const stages = {
    discovery: unique(discoveryIds),
    invitations: events(['request_sent']),
    pending: unique(people(['request_sent'])),
    accepted: unique([...events(['connected']), ...people(['connected', 'messaged', 'replied', 'meeting_scheduled', 'referred'])]),
    outside: outsideIds === null ? null : unique(outsideIds),
    replies: unique(activeReplies.map(t => t.contact_id)),
    drafts: unique(followUps.filter(t => !t.draft_message?.trim()).map(t => t.contact_id)),
    review: unique(actionable.filter(t => t.status === 'needs_review' && t.draft_message?.trim()).map(t => t.contact_id)),
    ongoing: unique(people(['messaged', 'replied', 'meeting_scheduled', 'referred'])),
  };
  const reachedIds = events(['request_sent', 'message_sent', 'follow_up']);
  return { toReach: unique(readyContactIds).length, reachedIds, reached: reachedIds.length,
    review: unique(actionable.map(t => t.contact_id)).length, replies: stages.replies.length,
    followUps: unique(followUps.map(t => t.contact_id)).length, outside: outsideIds === null ? null : unique(outsideIds).length,
    stages, waiting: unique(tasks.filter(t => t.task_type === 'proactive_follow_up' && t.status === 'waiting').map(t => t.contact_id)).length,
    queued: unique(tasks.filter(t => ['approved', 'queued'].includes(t.status)).map(t => t.contact_id)).length,
    replyContext: unique(activeReplies.filter(t => t.status === 'context_required' || !t.draft_message?.trim()).map(t => t.contact_id)).length,
  };
}
