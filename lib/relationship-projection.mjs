import { personStage, currentAction } from './control-center.mjs';

import { projectInvitationBacklog } from './invitation-backlog.mjs';

import { opportunityDetails } from './person-evidence.mjs';



// Only explicit evidence of a pre-send identity check can establish a block.

export function deliveryOutcome(item) {

  const status=item.status || item.state;

  if(['uncertain','awaiting_confirmation'].includes(status)) return 'uncertain';

  if(status==='queued') return 'queued';

  if (status === 'completed' && item.confirmation_signal) return 'sent';

  if (status === 'failed') return /^(?:LinkedIn identity mismatch: prepared employer .+; live profile shows .+|pre-send identity mismatch\b)/i.test(item.failure_reason || '') && !item.confirmation_signal ? 'blocked' : 'uncertain';

  if (status === 'running') return 'running';

  if (status === 'prepared') return 'queued';

  return status === 'completed' ? 'uncertain' : null;

}

export function batchOutcomes(batch) {

  const counts = {sent:0, blocked:0, uncertain:0, running:0, queued:0};

  const affected = [];

  const byPerson = new Map();

  for (const item of batch.items || []) {

    const outcome=deliveryOutcome(item);
    if(!outcome) continue;

    const prior=byPerson.get(item.contact_id);

    if (!prior || ['uncertain','blocked','running','queued','sent'].indexOf(outcome) < ['uncertain','blocked','running','queued','sent'].indexOf(prior.outcome)) byPerson.set(item.contact_id,{item,outcome});

  }

  for(const {item,outcome} of byPerson.values()) { if(outcome) counts[outcome]++; if(['blocked','uncertain'].includes(outcome)) affected.push({id:item.contact_id,name:item.name,outcome}); }

  return {counts,affected,label:Object.entries(counts).filter(([,n])=>n).map(([label,n])=>`${n} ${label}`).join(' · ')};

}

export function projectRelationships(snapshot, {manual=null, evidence=[], recommendations=[], activities=[], now=Date.now(), evidenceAvailable=true}={}) {

  const contacts=[...new Map((snapshot.contacts || []).map(c=>[c.id,c])).values()];

  const groups=Object.fromEntries(['all','discovery','outside','to_connect','execution','running','waiting','conversations','prepare','review','attention','do_not_contact','withdrawal','reply_needed','follow_up','missing_preparation','identity_blocked','uncertain_delivery','snoozed','closed'].map(k=>[k,[]]));

  const reasons={};

  const connected=new Set(), replied=new Set(), meetings=new Set(), referrals=new Set();

  for(const c of contacts) {

    if(['connected','messaged','replied','meeting_scheduled','referred'].includes(c.connection_status)) connected.add(c.id);

    if(c.connection_status==='replied') replied.add(c.id);

    if(c.connection_status==='meeting_scheduled') meetings.add(c.id);

    if(c.connection_status==='referred') referrals.add(c.id);

  }

  const ids=new Set(contacts.map(c=>c.id));

  for(const a of activities) if(ids.has(a.contact_id)) {

    if(['connected','message_sent','reply_received','follow_up','meeting_scheduled','referral'].includes(a.activity_type)) connected.add(a.contact_id);

    if(a.activity_type==='reply_received') replied.add(a.contact_id);

    if(a.activity_type==='meeting_scheduled') meetings.add(a.contact_id);

    if(a.activity_type==='referral') referrals.add(a.contact_id);

  }

  for(const m of snapshot.messages || []) if(ids.has(m.contact_id) && m.direction==='inbound') replied.add(m.contact_id);

  const batches=(manual?.batches || []).map(b=>({...b,items:b.items.map(i=>({...i,...evidence.find(e=>String(e.id)===String(i.id))}))}));

  const old=new Set(projectInvitationBacklog(snapshot,now).candidates.map(r=>r.contact_id || r.contact?.id));

  for(const c of contacts) {

    const id=c.id, issues=[], stage=personStage(snapshot,id,now), action=currentAction(snapshot,id);

    const excluded=!!c.do_not_contact || snapshot.restrictions?.excluded?.includes(id);

    const items=manual ? batches.flatMap(b=>b.items.filter(i=>i.contact_id===id)) : [...(snapshot.jobs || []).filter(i=>i.contact_id===id),...evidence.filter(i=>i.contact_id===id)];

    // Evidence not present in the active queue must still retain unresolved outcomes.

    for(const e of evidence.filter(e=>e.contact_id===id && ['failed','completed','running'].includes(e.status))) if(!items.some(i=>String(i.id)===String(e.id))) items.push(e);

    const outcomes=items.map(item=>!evidenceAvailable && item.status==='completed' && !item.confirmation_signal ? null : deliveryOutcome(item));

    if(!manual && ['queued','running'].includes(stage) && !outcomes.includes(stage)) outcomes.push(stage);

    if(!manual && stage==='attention' && !outcomes.some(o=>['uncertain','blocked'].includes(o))) outcomes.push('uncertain');

    const add=(code,label,next,priority)=>{if(!issues.some(r=>r.code===code)) issues.push({code,label,next,priority});};

    if(outcomes.includes('uncertain')) add('uncertain','Uncertain delivery result','Check LinkedIn before retrying. A failed result does not establish whether anything was sent.',0);

    if(outcomes.includes('blocked')) add('identity','Identity mismatch','Verify the person and employer before preparing new outreach.',1);

    const held=outcomes.includes('uncertain');
    const queued=outcomes.some(o=>['queued','running'].includes(o));

    if(!excluded && !['closed','snoozed'].includes(stage)) {

      const tasks=(manual?.tasks || []).filter(t=>t.contact_id===id && !['completed','cancelled','sent'].includes(t.status));

      const reply=tasks.some(t=>t.task_type==='reply') || (!manual && action?.intent==='reply' && ['prepare','review','attention'].includes(stage));

      const follow=tasks.some(t=>t.task_type!=='reply' && Date.parse(t.due_at)<=now) || (!manual && ['follow_up','new_message'].includes(action?.intent) && ['prepare','review'].includes(stage));

      if(!queued && reply) {add('reply','Reply received','Prepare the reply, then review the exact saved message.',2);groups.reply_needed.push(id);}

      if(!queued && follow) {add('follow_up','Follow-up due','Review the proposed follow-up before queueing.',3);groups.follow_up.push(id);}

      if(old.has(id)) {add('old_invitation','Old pending invitation','Review the existing withdrawal eligibility checks.',3);groups.withdrawal.push(id);}

      if(c.connection_status==='not_contacted' && !queued && !outcomes.includes('sent')) {

        if(!held) groups.to_connect.push(id);

        const recs=recommendations.filter(r=>r.contact_id===id), source=opportunityDetails(recs);

        const draft=manual?.invitations?.[id]?.text || (action?.intent==='invitation' ? action.draft_text : '');

        if(!source.url || !draft?.trim()) add('preparation','Missing source or invitation','Recover the original research or prepare and save an invitation draft.',4);

      }

      if(queued && !held) groups.execution.push(id);

      if(!held && outcomes.includes('running')) groups.running.push(id);

      if(!held && !queued && !reply && !follow && (outcomes.includes('sent') || c.connection_status==='request_sent' || (!manual && stage==='waiting'))) groups.waiting.push(id);

      

      if(!held && !queued && (reply || follow)) groups[tasks.some(t=>t.status==='needs_review' && t.draft_message) || (!manual && stage==='review') ? 'review':'prepare'].push(id);

    } else if(excluded) groups.do_not_contact.push(id);

    if(connected.has(id) && !excluded && !held) groups.conversations.push(id);
    if(!excluded && ['snoozed','closed'].includes(stage)) groups[stage].push(id);
    groups.all.push(id);

    if(c.origin==='discovery' || recommendations.some(r=>r.contact_id===id)) groups.discovery.push(id);

    if(c.origin==='outside' && connected.has(id)) groups.outside.push(id);

    if(issues.length) {reasons[id]=issues.sort((a,b)=>a.priority-b.priority);groups.attention.push(id);}

  }

  groups.attention.sort((a,b)=>reasons[a][0].priority-reasons[b][0].priority || a.localeCompare(b));

  for(const [filter,code] of [['missing_preparation','preparation'],['identity_blocked','identity'],['uncertain_delivery','uncertain']]) groups[filter]=groups.attention.filter(id=>reasons[id].some(reason=>reason.code===code));

  groups.do_not_contact=[...new Set([...groups.do_not_contact,...groups.uncertain_delivery])];

  const replyCount=[...connected].filter(id=>replied.has(id)).length;

  return {groups,reasons,batches,available:evidenceAvailable,connected:connected.size,replied:replyCount,noReply:connected.size-replyCount,percent:evidenceAvailable && connected.size ? Math.round(replyCount/connected.size*100):null,milestones:[['connected','Connected',connected.size],['replied','Replied',replyCount],['meetings','Meetings',meetings.size],['referrals','Referrals',referrals.size]].map(([id,label,count])=>({id,label,count:evidenceAvailable?count:null}))};

}

