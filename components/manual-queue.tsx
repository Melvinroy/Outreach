"use client";
import { deliveryOutcome } from "@/lib/relationship-projection.mjs";
import { queueReceipt } from "@/lib/queue-save.mjs";
import { confirmableInvitation } from "@/lib/manual-confirmation.mjs";
import { useState } from "react";
import { batchCommand, queueBlockReason, selectionSummary } from "@/lib/manual-queue.mjs";
export type Invitation = { text:string;source:string;date?:string;token?:string;recommendation_id?:number;blocked_reason?:string;history?:{text:string;date:string;source:string}[] };
type QueueItem = {id:string;contact_id:string;task_id?:number;name:string;text:string;status:string;removable:boolean;blocked_reason?:string};
type Task = {id:number;contact_id:string;task_type:string;status:string;draft_message?:string;inbound_message?:string;updated_at:string;due_at:string;context_token?:string;approval_blocked_reason?:string};
export type ManualState = { invitations:Record<string,Invitation>;batches:{id:string;code:string;kind:string;status:string;token?:string;items:QueueItem[]}[];tasks:Task[];people?:Record<string,{can_edit:boolean;can_select:boolean;can_prepare:boolean;can_restore:boolean;blocked_reason?:string;latest_inbound?:string}> };
type Run = (command:string,payload?:Record<string,unknown>)=>Promise<boolean>;
export type MessageEdit = {text:string;token?:string;context_token?:string};
type Props = {saveQueue:(items:{contact_id:string;text:string;token?:string}[])=>Promise<boolean>;savingQueue:boolean;recovery:{confirmed?:{batch_id:string;batch_code:string;selected_count:number}}|null;retryRefresh:()=>Promise<void>;refreshing:boolean;data:ManualState;contacts:{id:string;full_name:string;connection_status:string}[];selection:string[];clear:(ids:string[])=>void;busy:boolean;enabled:boolean;run:Run;dirty:string[];exclude:(ids:string[])=>Promise<void>};
export function ManualQueue({data,contacts,selection,clear,busy,enabled,run,dirty,exclude,saveQueue,savingQueue,recovery,retryRefresh,refreshing}:Props) {
  const summary=selectionSummary(contacts,selection);
  const missingNames=contacts.filter(c=>summary.invitations.includes(c.id)&&!data.invitations[c.id]?.text?.trim()).map(c=>c.full_name);
  const blocked=summary.invitations.some((id:string)=>dirty.includes(id)) ? 'Save or cancel your invitation edits before queuing.' : queueBlockReason(summary.invitations,data.invitations,enabled);
  const readyReplies=summary.replies.filter((id:string)=>data.people?.[id]?.can_prepare);
  const replyReason=!enabled ? 'Reply preparation is unavailable.' : !readyReplies.length ? (summary.replies.length ? 'These conversations are already queued or need reconciliation. Open the person for details.' : 'Select connected people who have a next message to prepare.') : '';
  return <section className="cc-manual-queue" aria-label="Selected people actions">{selection.length > 0 && <div className="cc-selection-bar cc-three-actions">
    <strong>{summary.label}</strong>
    <div><button aria-describedby="queue-reason" disabled={busy || !!blocked} onClick={async()=>{if(await saveQueue(summary.invitations.map((id:string)=>({contact_id:id,text:data.invitations[id].text,token:data.invitations[id].token})))) clear(summary.invitations);}}>{savingQueue ? 'Saving queue…' : `Save connection queue (${summary.invitations.length})`}</button><small id="queue-reason">{blocked || 'Saves this selection. Nothing is sent.'}{missingNames.length>0 && ` Missing: ${missingNames.slice(0,3).join(', ')}${missingNames.length>3 ? ` and ${missingNames.length-3} more`:''}.`}</small></div>
    <div><button aria-describedby="reply-reason" disabled={busy || !!replyReason} onClick={async()=>{if(await run('prepare_replies',{contact_ids:readyReplies})) clear(readyReplies);}}>Prepare replies ({readyReplies.length})</button><small id="reply-reason">{replyReason || 'Prepare only these people. Review their messages inside each row.'}</small></div>
    <div><button disabled={busy || !enabled || !selection.length} onClick={()=>void exclude(selection)}>Do not contact ({selection.length})</button><small>{selection.length ? 'Exclude selected people from outreach.' : 'Select people to exclude.'}</small></div>
  </div>}
    {recovery && <div className="cc-queue-inline-status" role="status">
      <strong>{recovery.confirmed ? `Queue saved · ${recovery.confirmed.selected_count} people · Batch ${recovery.confirmed.batch_code}` : 'Checking save outcome'}</strong>
      <span>{recovery.confirmed ? 'Nothing sent. Refresh to show current queue details.' : 'Save confirmation was interrupted. Another save is paused until confirmed.'}</span>
      <button disabled={refreshing} onClick={()=>void retryRefresh()}>{refreshing ? 'Refreshing…' : 'Check saved queue'}</button>
    </div>}

  </section>;
}
function Command({text}:{text:string}) {
  const [status,setStatus]=useState('');
  return <div className="cc-person-command"><code>{text}</code><button onClick={async()=>{try {await navigator.clipboard.writeText(text);setStatus('Copied. Paste into ChatGPT Work when ready.');}catch {setStatus('Select and copy the command above.');}}}>Copy ChatGPT Work command</button><small role="status">{status}</small></div>;
}
function Editor({label,text,token,contextToken,edit,onEdit,busy,disabled,reason,limit,onSave,saveLabel='Save'}:{label:string;text:string;token?:string;contextToken?:string;edit?:MessageEdit;onEdit:(edit?:MessageEdit)=>void;busy:boolean;disabled:boolean;reason?:string;limit:number;onSave:(edit:MessageEdit)=>Promise<boolean>;saveLabel?:string}) {
  const value=edit?.text ?? text;
  return <div className="cc-person-editor"><label>{label}<textarea aria-label={label} value={value} readOnly={disabled || busy} rows={3} data-message-kind={limit===300 ? "invitation":"reply"} onChange={e=>onEdit({text:e.target.value,token:edit?.token ?? token,context_token:edit?.context_token ?? contextToken})}/></label>
    <div className="cc-editor-footer"><small>{Array.from(value).length} / {limit} characters</small><button disabled={busy || disabled || !edit || value===text || !value.trim() || Array.from(value.trim()).length>limit} onClick={async()=>{if(await onSave(edit!))onEdit();}}>{saveLabel}</button><button disabled={busy || !edit} onClick={()=>onEdit()}>Cancel</button></div>{reason && <p className="cc-muted">{reason}</p>}
  </div>;
}
export function PersonMessage({evidenceLoaded,contact,data,busy,enabled,run,edits,setEdit,history,now}:{evidenceLoaded:boolean;now:number;contact:{id:string;full_name:string;connection_status:string};data:ManualState;busy:boolean;enabled:boolean;run:Run;edits:Record<string,MessageEdit>;setEdit:(key:string,edit?:MessageEdit)=>void;history:{id:number;personalized_message?:string|null;verified_at?:string}[]}) {
  const [sentChecked,setSentChecked]=useState(false);
  const [sentRecorded,setSentRecorded]=useState(false);
  const confirmable=confirmableInvitation(contact,data.batches,evidenceLoaded);
  const invitation=data.invitations[contact.id], permissions=data.people?.[contact.id];
  const batches=data.batches.filter(b=>(['ready','running','awaiting_confirmation'].includes(b.status)||b.items.some(i=>i.status==='failed'))&&b.items?.some(i=>i.contact_id===contact.id));
  const invitationBatch=batches.find(b=>b.kind==='invitation'&&b.items.some(i=>i.contact_id===contact.id&&i.status==='prepared'));
  const invitationItem=invitationBatch?.items.find(i=>i.contact_id===contact.id);
  const tasks=data.tasks.filter(t=>t.contact_id===contact.id).sort((a,b)=>Number(b.task_type==='reply')-Number(a.task_type==='reply'));
  const stamp=(date?:string)=>date ? new Date(date).toLocaleString():'';
  const inviteHistory=<details className="cc-message-history"><summary>Invitation history</summary>{invitation?.text && <p className="cc-frozen-message">{invitation.text}</p>}{invitation?.history?.map((h,i)=><div key={i}><small>{h.source} · {stamp(h.date)}</small><p className="cc-frozen-message">{h.text}</p></div>)}{history.filter(r=>r.personalized_message?.trim()).map(r=><div key={r.id}><small>ChatGPT recommendation · {stamp(r.verified_at)}</small><p className="cc-frozen-message">{r.personalized_message}</p></div>)}{!invitation?.text && <p>No invitation message saved</p>}</details>;
  return <section className="cc-person-messages" aria-label={`Messages for ${contact.full_name}`}>
    {confirmable && <details className="cc-message-history"><summary>Already sent this invitation?</summary>
      <p>Check this person’s LinkedIn profile for Pending or a visible invitation confirmation. This records the existing send; it sends nothing.</p>
      <label><input type="checkbox" checked={sentChecked} disabled={busy} onChange={e=>setSentChecked(e.target.checked)}/> I checked LinkedIn and confirmed this invitation was sent.</label>
      <button disabled={busy || !enabled || !sentChecked} onClick={async()=>{if(await run('confirm_invitation_sent',{session_id:confirmable.id})){setSentChecked(false);setSentRecorded(true);}}}>Confirm sent</button>
    </details>}
    {sentRecorded && <small role="status">Invitation recorded. Waiting for acceptance.</small>}
    {contact.connection_status==='not_contacted' ? <>{!invitation?.text && <p>No invitation message saved</p>}
      <Editor label="Invitation message" text={invitationItem?.text ?? invitation?.text ?? ''} token={invitation?.token} edit={edits[contact.id]} onEdit={e=>setEdit(contact.id,e)} busy={busy} disabled={!enabled || !permissions?.can_edit || (!!invitationItem && !invitationItem.removable)} limit={300} reason={permissions?.blocked_reason || (invitationItem && !invitationItem.removable ? 'This batch has started. Reconcile it before editing.' : undefined)} saveLabel={invitationItem?.removable ? 'Save queued message':'Save'} onSave={e=>run(invitationItem ? 'replace_queued':'save_invitation',{contact_id:contact.id,text:e.text,token:e.token,batch_id:invitationBatch?.id,batch_token:invitationBatch?.token,kind:'invitation'})}/>
      <small>{invitation?.text ? 'Saved · ' : ''}{invitation?.source} {invitation?.date && `· ${stamp(invitation.date)}`}</small>{inviteHistory}
    </> : <>{tasks.length===0 && <p>{contact.connection_status==='request_sent' ? 'Invitation sent. Waiting for acceptance.' : 'No reply is due. Prepare a message when needed.'}</p>}
      {tasks.map(task=>{const key=`${contact.id}:${task.id}`, b=batches.find(b=>b.items.some(i=>i.task_id===task.id&&i.status==='prepared')),item=b?.items.find(i=>i.task_id===task.id);const disabled=!enabled || !permissions?.can_edit || (!!item&&!item.removable);return <div key={task.id} className="cc-conversation-draft">
        <Editor label={task.task_type==='reply' ? 'Reply message':'Follow-up message'} text={item?.text ?? task.draft_message ?? ''} token={task.updated_at} contextToken={task.context_token} edit={edits[key]} onEdit={e=>setEdit(key,e)} busy={busy} disabled={disabled} limit={2000} reason={permissions?.blocked_reason || (item&&!item.removable ? 'This batch has started. Reconcile it before editing.' : undefined)} saveLabel={item ? 'Save & approve revised message':'Save'} onSave={e=>run(item ? 'replace_queued':'save_reply',{contact_id:contact.id,task_id:task.id,text:e.text,updated_at:e.token,context_token:e.context_token,batch_id:b?.id,batch_token:b?.token,kind:b?.kind})}/>
        {!item && <button disabled={busy || disabled || !!edits[key] || !!task.approval_blocked_reason || task.status!=='needs_review' || !task.draft_message || Date.parse(task.due_at)>now} onClick={()=>void run('approve_reply',{task_id:task.id,text:task.draft_message,updated_at:task.updated_at,context_token:task.context_token})}>Approve exact message &amp; queue</button>}
        {!item && <p className="cc-muted">{task.approval_blocked_reason || (edits[key] ? 'Save or cancel edits before approving.' : Date.parse(task.due_at)>now ? `Available after ${stamp(task.due_at)}.` : !task.draft_message ? 'Prepare conversation context and a draft in ChatGPT Work, then refresh.' : 'Your approval applies to this exact saved message.')}</p>}
        {!item && ['waiting','context_required'].includes(task.status) && <Command text={`Prepare a ${task.task_type==='reply'?'reply':'follow-up'} draft for Outreach contact ${contact.id}, conversation task ${task.id}. Check the current conversation and save the draft for my review. Do not send messages.`}/>}</div>;})}{inviteHistory}</>}
    {batches.map(b=><section key={b.id} className="cc-person-batch"><h4>{b.status==='ready' ? 'Queued — waiting for you to trigger ChatGPT Work':'Batch history — review outcomes before continuing'}</h4>{b.items.filter(i=>i.contact_id===contact.id).map(i=><div key={i.id}><small>{deliveryOutcome(i) || i.status}</small><p className="cc-frozen-message">{i.text}</p>{i.removable && <button disabled={busy || !enabled} onClick={()=>void run('remove',{contact_id:contact.id})}>Remove unsent item</button>}{['prepared','failed'].includes(i.status)&&!i.removable&&<p>Needs reconciliation. This item cannot safely be edited or repeated.</p>}</div>)}<small>Batch {b.code} · {b.items.filter(i=>i.status==='prepared').length} remaining of {b.items.length} recipients. This command addresses the entire batch.</small>{queueReceipt(b).canCopy && <Command text={batchCommand(b)}/>}</section>)}
  </section>;
}
