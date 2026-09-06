"use client";
import {ListOrdered} from 'lucide-react';
import {batchOutcomes} from '@/lib/relationship-projection.mjs';
import {batchCommand} from '@/lib/manual-queue.mjs';
import {queueReceipt} from '@/lib/queue-save.mjs';
import {useState} from 'react';
import type {ManualState} from './manual-queue';
export function QueueIndicator({data,stale,onPerson}:{data:ManualState;stale:boolean;onPerson:(id:string)=>void}) {
 const [copied,setCopied]=useState('');
 const active=new Set(data.queue_state?.queues.map(q=>q.id)||[]);
 const batches=data.batches.filter(b=>b.kind==='invitation' && active.has(b.id)).sort((a,b)=>(a.queue_number||0)-(b.queue_number||0));
 return <details className="cc-queues"><summary aria-label={`Connection queues: ${batches.length} unfinished`}><ListOrdered size={16}/> Queues <strong>{batches.length}/4</strong></summary>
  <div className="cc-queue-popover"><small role="status">{stale?'Update delayed · ':''}{data.queue_updated_at?`Last updated ${new Date(data.queue_updated_at).toLocaleTimeString()}`:'Loading recorded progress…'}</small>
   {!batches.length && <p>No unfinished connection queues.</p>}
   {batches.map(b=>{const counts=batchOutcomes(b).counts;const remaining=b.items.filter(i=>i.status==='prepared').length;return <section key={b.id}>
    <strong>Queue {b.queue_number} · {b.status==='running'?'Running':counts.uncertain?'Needs check':'Saved'}</strong>
    <small>{b.items.filter(i=>i.status!=='cancelled').length}/15 people · {b.code}</small>
    <p>{counts.sent} sent · {remaining} remaining{counts.blocked>0?` · ${counts.blocked} blocked`:''}{counts.uncertain>0?` · ${counts.uncertain} uncertain`:''}</p>
    {queueReceipt(b).canCopy ? <button onClick={async()=>{try{await navigator.clipboard.writeText(batchCommand(b));setCopied(b.id);}catch{setCopied('failed');}}}>{copied===b.id?'Command copied':'Copy run command'}</button> : <small>{b.run_block_reason||'Open the affected person to review.'}</small>}
    {copied==='failed' && queueReceipt(b).canCopy && <code>{batchCommand(b)}</code>}
    <details><summary>People</summary>{b.items.map(i=><button key={i.id} onClick={()=>onPerson(i.contact_id)}>{i.name} · {i.status==='completed'?'Sent':i.status==='prepared'?'Queued':i.status}</button>)}</details>
   </section>;})}
   <small>Recorded progress refreshes every 15 seconds. Each queue needs your ChatGPT Work command.</small>
  </div>
 </details>;
}
