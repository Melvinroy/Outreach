import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationEvidence,opportunityDetails,readEvidenceRows,sourceContext} from '../lib/person-evidence.mjs';
test('source recovery stays within the matching invitation section and labels networking truthfully',()=>{
 const raw='### 1. First person\n- **Recent/current topic:** Governed AI. [Profile](https://example.com/profile) · [Announcement](https://example.com/news)\nHi First.\n### 2. Other person\n[Source](https://wrong.example.com)\nHi Other.';
 const row={id:1,run_id:'run',track:'executive',personalized_message:'Hi First.'};
 const [r]=sourceContext([row],[{id:'run',raw_report_text:raw}]);
 assert.equal(r.source_context_url,'https://example.com/news');assert.equal(r.source_context_title,'Governed AI.');
 assert.deepEqual(opportunityDetails([r]),{title:'Networking · Governed AI.',url:'https://example.com/news'});
 assert.equal(sourceContext([{...row,personalized_message:'Missing message'}],[{id:'run',raw_report_text:raw}])[0].source_context_url,undefined);
 assert.equal(sourceContext([row],[{id:'run',raw_report_text:raw+'\n### Duplicate\nHi First.'}])[0].source_context_url,undefined);
});
test('opportunity fields remain visible without requiring both a title and URL',()=>{
 assert.deepEqual(opportunityDetails([{id:1,opening_title:'Product lead'}]),{title:'Product lead',url:undefined});
 assert.deepEqual(opportunityDetails([{id:1,hiring_post_url:'https://example.com/post'}]),{title:'View hiring post',url:'https://example.com/post'});
 assert.equal(opportunityDetails([{id:2,verified_at:'2026-09-02'},{id:1,verified_at:'2026-09-01',opening_title:'Older saved role'}]).title,'Older saved role');
 assert.equal(opportunityDetails([{id:1,active_job_url:'javascript:alert(1)'}]).title,'No opportunity recorded');
});
test('only confirmed completed sessions enter history; drafts and uncertain sends never do',()=>{
 const base={id:'one',contact_id:'c',status:'completed',message_snapshot:'Original invitation',confirmation_signal:'linkedin_invitation_sent_visible',completed_at:'2026-08-01T00:00:00Z'};
 const rows=conversationEvidence([], [base,{...base,id:'two',status:'failed'},{...base,id:'three',status:'prepared'},{...base,id:'four',confirmation_signal:null}],[],[]);
 assert.equal(rows.length,1);assert.equal(rows[0].body,'Original invitation');assert.equal(rows[0].direction,'outbound');
});
test('history sorts sent invitation, incoming and reply, deduplicating mirrored evidence',()=>{
 const inbound={id:4,contact_id:'c',event_type:'inbound_message',message_body:'Thanks!',observed_at:'2026-08-02T00:00:00Z'};
 const messages=[{id:'m',evidence_key:'legacy_event:4',contact_id:'c',direction:'inbound',body:'Thanks!',occurred_at:inbound.observed_at,verified:true}];
 const base={contact_id:'c',status:'completed',confirmation_signal:'visible'};
 const rows=conversationEvidence(messages,[{...base,id:'i',message_snapshot:'Invite',completed_at:'2026-08-01T00:00:00Z'}],[{...base,id:'r',message_snapshot:'Reply',completed_at:'2026-08-03T00:00:00Z'}],[inbound]);
 assert.deepEqual(rows.map(r=>r.body),['Invite','Thanks!','Reply']);assert.equal(rows[1].verified,true);
});
test('evidence reads paginate and propagate permission errors',async()=>{
 let count=0;
 const client={from:()=>({select(){return this;},order(){return this;},range(){return Promise.resolve({data:++count===1?Array.from({length:500},(_,id)=>({id})):[],error:null});}})};
 assert.equal((await readEvidenceRows(client,'records','id')).length,500);assert.equal(count,2);
 const denied={from:()=>({select(){return this;},order(){return this;},range(){return Promise.resolve({error:{message:'permission denied'}});}})};
 await assert.rejects(()=>readEvidenceRows(denied,'records','id'),/permission denied/);
});
