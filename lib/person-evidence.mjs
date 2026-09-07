// Display evidence only: these reads do not prepare, approve, queue or send.
export function sourceContext(recommendations = [], reports = []) {
  const byRun=new Map(reports.map(r=>[r.id,(r.raw_report_text||'').split(/^#{2,3}\s+/m)]));
  return recommendations.map(row=>{
    if(row.track!=='executive' || !row.personalized_message?.trim()) return row;
    const matches=(byRun.get(row.run_id)||[]).filter(s=>s.includes(row.personalized_message));
    if(matches.length!==1) return row;
    const section=matches[0];
    const topicLine=section.split('\n').find(line=>/\*\*[^*\n]*topic:\*\*/i.test(line));
    const topic=topicLine?.replace(/^.*?:\*\*\s*/, '').split(/\[[^\]]+\]\(/)[0].trim().replace(/[·\s]+$/,'');
    const links=[...section.matchAll(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g)].filter(m=>!/^profile$/i.test(m[1]));
    return {...row,source_context_title:topic||undefined,source_context_url:row.hiring_post_url||links[0]?.[2]};
  });
}
export function opportunityDetails(rows = []) {
  const ordered = [...rows].sort((a,b)=>(b.verified_at||'').localeCompare(a.verified_at||'') || b.id-a.id);
  const validUrl = value => { try { return new URL(value).protocol === 'https:' ? value : undefined; } catch { return undefined; } };
  const row = ordered.find(r=>r.opening_title?.trim() || validUrl(r.active_job_url) || validUrl(r.hiring_post_url) || validUrl(r.source_context_url) || r.track==='executive');
  if (!row) return {title:'No opportunity recorded'};
  const url=validUrl(row.active_job_url)||validUrl(row.hiring_post_url)||validUrl(row.source_context_url);
  return {title:row.opening_title?.trim() || (row.track==='executive' ? `Networking · ${row.source_context_title || 'View source context'}` : validUrl(row.hiring_post_url) ? 'View hiring post' : 'View opportunity'),url};
}
export function conversationEvidence(messages = [], invitations = [], replies = [], events = []) {
  const sent = (rows,kind) => rows.filter(s=>s.status==='completed' && s.completed_at && s.confirmation_signal && s.message_snapshot?.trim()).map(s=>({
    id:`${kind}:${s.id}`, contact_id:s.contact_id,direction:'outbound',body:s.message_snapshot,
    occurred_at:s.completed_at,source:kind==='invitation'?(s.recovered?'Recovered invitation · verification time; send time unavailable':'Confirmed invitation'):'Confirmed message',verified:false,
  }));
  const incoming=events.filter(e=>e.event_type==='inbound_message').map(e=>({id:`event:${e.id}`,evidence_key:`legacy_event:${e.id}`,contact_id:e.contact_id,direction:'inbound',body:e.message_body||e.message_excerpt,occurred_at:e.observed_at,source:e.evidence_source||'Recorded incoming message',verified:false}));
  const result=[];
  for (const m of [...messages,...sent(invitations,'invitation'),...sent(replies,'reply'),...incoming]) {
    if (result.some(r=>r.contact_id===m.contact_id && ((r.evidence_key && r.evidence_key===m.evidence_key) || (r.direction===m.direction && r.body===m.body && Date.parse(r.occurred_at||r.observed_at)===Date.parse(m.occurred_at||m.observed_at))))) continue;
    result.push(m);
  }
  return result.sort((a,b)=>(Date.parse(a.occurred_at||a.observed_at)||0)-(Date.parse(b.occurred_at||b.observed_at)||0)||String(a.id).localeCompare(String(b.id)));
}
export async function readEvidenceRows(client, table, fields, column, value) {
  const rows=[];
  for(let start=0;;start+=500) {
    let query=client.from(table).select(fields).order('id',{ascending:true}).range(start,start+499);
    if(column) query=query.eq(column,value);
    const result=await query;
    if(result.error) throw new Error(result.error.message);
    rows.push(...(result.data||[]));
    if((result.data||[]).length<500) return rows;
  }
}

// Session tables have different failure columns. Keep their contracts separate.
export const invitationEvidenceFields = 'id,contact_id,status,message_snapshot,confirmation_signal,completed_at,failure_reason,skip_reason,preflight_evidence,recovered,recorded_at';
export const replyEvidenceFields = 'id,contact_id,status,message_snapshot,confirmation_signal,completed_at,skip_reason';
export async function readDeliveryEvidence(client) {
  const [invitations,replies] = await Promise.all([
    readEvidenceRows(client,'outreach_assist_sessions',invitationEvidenceFields),
    readEvidenceRows(client,'outreach_phase5_sessions',replyEvidenceFields),
  ]);
  return {invitations,replies};
}
