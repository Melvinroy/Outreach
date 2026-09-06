import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOverview } from '../lib/overview.mjs';
const base = () => ({contacts:[],messages:[],threads:[],actions:[],jobs:[],events:[],restrictions:{excluded:[],discarded:[]}});
test('conversion counts unique connected people and includes outside connections',()=>{
 const s=base();s.contacts=[{id:'a',full_name:'A',connection_status:'connected',origin:'outside'},{id:'b',full_name:'B',connection_status:'referred',origin:'discovery'},{id:'c',full_name:'C',connection_status:'not_contacted'}];
 s.messages=[{id:'m1',contact_id:'a',direction:'inbound'},{id:'m2',contact_id:'a',direction:'inbound'},{id:'m3',contact_id:'c',direction:'inbound'}];
 const p=projectOverview(s,[{contact_id:'b',activity_type:'reply_received'},{contact_id:'a',activity_type:'reply_received'}]);
 assert.equal(p.connected,2);assert.equal(p.replied,2);assert.equal(p.percent,100);
});
test('missing connection evidence is not a zero percent cohort',()=>{const p=projectOverview(base());assert.equal(p.percent,null);assert.equal(p.replied,0);assert.deepEqual(p.recent,[]);});
test('activity deduplicates equivalent evidence and sorts actual occurrence dates',()=>{
 const s=base();s.contacts=[{id:'a',full_name:'A',connection_status:'connected'}];
 s.messages=[{id:'m1',contact_id:'a',direction:'inbound',occurred_at:'2026-09-01T12:00:00Z',observed_at:'2026-09-06T00:00:00Z'}];
 s.jobs=[{id:'job',contact_id:'a',state:'confirmed',created_at:'2026-09-02T00:00:00Z'}];
 const p=projectOverview(s,[{id:1,contact_id:'a',activity_type:'reply_received',activity_at:'2026-09-01T12:00:00Z'},{id:2,contact_id:'missing',activity_type:'connected',activity_at:'2026-09-03T00:00:00Z'}]);
 assert.equal(p.recent.length,2);assert.equal(p.recent[0].label,'Outreach queued');assert.equal(p.recent[1].kind,'reply');
});
test('historical connection evidence survives later statuses; no-reply cohort is accurate',()=>{const s=base();s.contacts=[{id:'a',connection_status:'closed'},{id:'b',connection_status:'connected'}];const p=projectOverview(s,[{contact_id:'a',activity_type:'connected'},{contact_id:'a',activity_type:'reply_received'}]);assert.equal(p.connected,2);assert.equal(p.percent,50);assert.equal(p.noReply,1);});


test('stage shares use unique people, independent of connection conversion', () => {
 const s = base(); s.contacts = [{id:'a',full_name:'A',connection_status:'connected'}, {id:'a',full_name:'A',connection_status:'connected'}, {id:'b',full_name:'B',connection_status:'not_contacted'}];
 s.messages = [{id:'m',contact_id:'a',direction:'inbound'}];
 const p = projectOverview(s);
 assert.equal(p.people,2); assert.equal(p.percent,100);
 assert.deepEqual(p.stages.map(stage=>stage.label), ['From discovery','People & history','Prepare','Review & approve','Execute','Waiting']);
 assert.equal(p.stages.find(stage=>stage.id === 'people').count,2);
 for (const stage of p.stages) { assert.equal(stage.percent,Math.round(stage.count / 2 * 100)); assert.ok(stage.percent <= 100); }
});
test('empty stage breakdown preserves all six rows without invented percentages', () => {
 const p = projectOverview(base()); assert.equal(p.stages.length,6);
 for (const stage of p.stages) { assert.equal(stage.count,0); assert.equal(stage.percent,null); }
});

test('unknown historical source remains separate from discovery and outside cohorts', () => {
 const s=base();s.contacts=[{id:'a',origin:'discovery',connection_status:'connected'},{id:'b',origin:'legacy_unknown',connection_status:'connected'},{id:'c',origin:'outside',connection_status:'connected'},{id:'d',connection_status:'connected'}];
 const p=projectOverview(s);assert.equal(p.people,4);assert.equal(p.discovered,1);assert.equal(p.outside,1);assert.equal(p.unknownSource,2);
});
