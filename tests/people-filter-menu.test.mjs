import test from 'node:test';
import assert from 'node:assert/strict';
import {peopleFilterGroups,peopleFilterOptions,createDemoControlCenter} from '../lib/control-center.mjs';
import {projectRelationships} from '../lib/relationship-projection.mjs';
test('every dropdown option has a shared People view',()=>{
 const p=projectRelationships(createDemoControlCenter());
 assert.deepEqual(peopleFilterGroups.map(g=>g.label),['People','Workflow','Needs attention','Set aside']);
 assert.equal(new Set(peopleFilterOptions.map(([id])=>id)).size,peopleFilterOptions.length);
 for(const [id] of peopleFilterOptions) assert.ok(Array.isArray(p.groups[id]),`Missing projection for ${id}`);
 for(const id of ['attention','missing_preparation','identity_blocked','uncertain_delivery','reply_needed','follow_up','withdrawal','execution','running','waiting','prepare','review','snoozed','closed']) assert.ok(peopleFilterOptions.some(([key])=>key===id));
});
test('issue filters preserve multiple reasons and excluded uncertain deliveries',()=>{
 const s=createDemoControlCenter();s.contacts=s.contacts.slice(0,2);s.contacts[0].do_not_contact=true;
 const evidence=[{id:'u',contact_id:s.contacts[0].id,status:'failed'},{id:'b',contact_id:s.contacts[1].id,status:'failed',failure_reason:'Pre-send identity mismatch: wrong employer'}];
 const p=projectRelationships(s,{manual:{invitations:{},batches:[],tasks:[]},evidence});
 assert.deepEqual(p.groups.uncertain_delivery,[s.contacts[0].id]);assert.deepEqual(p.groups.identity_blocked,[s.contacts[1].id]);assert.deepEqual(p.groups.missing_preparation,[s.contacts[1].id]);assert.deepEqual(p.groups.do_not_contact,[s.contacts[0].id]);
});
test('closed and snoozed remain separate from Do not contact',()=>{
 const s=createDemoControlCenter();s.threads[0].closed_at=new Date().toISOString();s.threads[1].snoozed_until='2099-01-01T00:00:00Z';s.contacts[2].do_not_contact=true;
 const p=projectRelationships(s);assert.ok(p.groups.closed.includes(s.contacts[0].id));assert.ok(p.groups.snoozed.includes(s.contacts[1].id));assert.ok(!p.groups.closed.includes(s.contacts[2].id));
});
