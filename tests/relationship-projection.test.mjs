import test from 'node:test';
import assert from 'node:assert/strict';
import {projectRelationships,deliveryOutcome,batchOutcomes} from '../lib/relationship-projection.mjs';
const base=()=>({contacts:[],messages:[],threads:[],actions:[],jobs:[],events:[],restrictions:{excluded:[],discarded:[]}});
const manual=()=>({invitations:{},tasks:[],batches:[]});
test('Akhil missing historical preparation is one affected person, without invented data',()=>{
 const s=base();s.contacts=[{id:'akhil',connection_status:'not_contacted',origin:'legacy_unknown'}];const p=projectRelationships(s,{manual:manual()});assert.deepEqual(p.groups.to_connect,['akhil']);assert.deepEqual(p.groups.attention,['akhil']);assert.equal(p.reasons.akhil[0].code,'preparation');
});
test('14 confirmed sent and one explicit identity block reports only one affected person',()=>{
 const items=Array.from({length:14},(_,i)=>({id:String(i),contact_id:String(i),name:`Person ${i}`,status:'completed',confirmation_signal:'linkedin_invitation_sent_visible'}));items.push({id:'lonnie',contact_id:'lonnie',name:'Lonnie',status:'failed',failure_reason:'LinkedIn identity mismatch: prepared employer Datavant; live profile shows Ontellus.'});const b=batchOutcomes({items});assert.equal(b.label,'14 sent · 1 blocked');assert.deepEqual(b.affected.map(p=>p.id),['lonnie']);
});
test('failure and completion without confirmation are uncertain; post-send mismatch is not a safe block',()=>{
 for(const item of [{status:'failed'},{status:'completed',completed_at:'2026-09-01'},{status:'failed',failure_reason:'Post-send identity mismatch'}]) assert.equal(deliveryOutcome(item),'uncertain');
});
test('exclusion never removes unresolved delivery; multiple reasons count once in priority order',()=>{
 const s=base();s.contacts=[{id:'a',connection_status:'not_contacted',do_not_contact:true},{id:'b',connection_status:'not_contacted'}];const evidence=[{id:'a1',contact_id:'a',status:'failed'},{id:'b1',contact_id:'b',status:'failed',failure_reason:'Pre-send identity mismatch: employer differs'}];const p=projectRelationships(s,{manual:manual(),evidence});assert.deepEqual(p.groups.attention,['a','b']);assert.deepEqual(p.groups.do_not_contact,['a']);assert.equal(p.reasons.b.length,2);assert.equal(p.reasons.b[0].code,'identity');assert.ok(!p.groups.to_connect.includes('a'));
});
test('ordinary queued and waiting work is not attention and groups deduplicate batch items',()=>{
 const s=base();s.contacts=[{id:'q',connection_status:'not_contacted'},{id:'w',connection_status:'request_sent'}];const m=manual();m.batches=[{id:'b',items:[{id:'1',contact_id:'q',status:'prepared'},{id:'2',contact_id:'q',status:'prepared'}]}];const p=projectRelationships(s,{manual:m});assert.deepEqual(p.groups.execution,['q']);assert.deepEqual(p.groups.waiting,['w']);assert.deepEqual(p.groups.attention,[]);
});
test('milestones include outside connections, deduplicate evidence, overlap, never count hiring links',()=>{
 const s=base();s.contacts=[{id:'a',connection_status:'connected',origin:'outside'},{id:'a',connection_status:'connected',origin:'outside'},{id:'b',connection_status:'connected'}];s.messages=[{contact_id:'a',direction:'inbound'},{contact_id:'a',direction:'inbound'}];const activities=[{contact_id:'a',activity_type:'meeting_scheduled'},{contact_id:'a',activity_type:'meeting_scheduled'},{contact_id:'a',activity_type:'referral'}];const p=projectRelationships(s,{activities,recommendations:[{contact_id:'b',active_job_url:'https://example.com/job'}]});assert.equal(p.percent,50);assert.equal(p.connected,2);assert.deepEqual(p.milestones.map(m=>m.count),[2,1,1,1]);assert.deepEqual(p.groups.outside,['a']);
});
test('unavailable evidence differs from zero; empty conversion has no rate',()=>{
 const s=base();assert.equal(projectRelationships(s).percent,null);assert.deepEqual(projectRelationships(s).milestones.map(m=>m.count),[0,0,0,0]);assert.deepEqual(projectRelationships(s,{evidenceAvailable:false}).milestones.map(m=>m.count),[null,null,null,null]);
});
test('old invitations use stored send date and verified eligibility, not contact age',()=>{
 const s=base();s.contacts=[{id:'old',connection_status:'request_sent'},{id:'unknown',connection_status:'request_sent',created_at:'2020-01-01'}];s.invitation_backlog={policy:{withdrawal_days:14},items:[{contact_id:'old',sent_at:'2026-08-01',state:'pending'}]};const p=projectRelationships(s,{now:Date.parse('2026-09-07')});assert.deepEqual(p.groups.withdrawal,['old']);assert.equal(p.reasons.unknown,undefined);
});
test('reply and due follow-up reasons route to preparation or exact-message review',()=>{
 const s=base();s.contacts=[{id:'a',connection_status:'connected'},{id:'b',connection_status:'connected'}];const m=manual();m.tasks=[{id:1,contact_id:'a',task_type:'reply',status:'context_required'},{id:2,contact_id:'b',task_type:'follow_up',status:'needs_review',draft_message:'Saved exact text',due_at:'2026-09-01'}];const p=projectRelationships(s,{manual:m,now:Date.parse('2026-09-07')});assert.deepEqual(p.groups.prepare,['a']);assert.deepEqual(p.groups.review,['b']);assert.equal(p.reasons.a[0].code,'reply');assert.equal(p.reasons.b[0].code,'follow_up');
});
test('unselected prepared sessions never become an active manual queue',()=>{
 const s=base();s.contacts=[{id:'a',connection_status:'not_contacted'}];const p=projectRelationships(s,{manual:manual(),evidence:[{id:'old',contact_id:'a',status:'prepared'}]});assert.deepEqual(p.groups.execution,[]);assert.deepEqual(p.groups.to_connect,['a']);
});
