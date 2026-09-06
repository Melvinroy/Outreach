import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDemoControlCenter} from '../lib/control-center.mjs';
import {projectRelationships} from '../lib/relationship-projection.mjs';
test('uncertain delivery is visible in Do not contact without changing exclusion or resolving evidence',()=>{
 const s=createDemoControlCenter();const id=s.contacts[0].id;const evidence=[{id:'unknown-send',contact_id:id,status:'failed'}];const before=JSON.stringify({s,evidence});
 const p=projectRelationships(s,{manual:{invitations:{},batches:[],tasks:[]},evidence});
 assert.ok(p.groups.do_not_contact.includes(id));assert.ok(!p.groups.to_connect.includes(id));assert.ok(p.groups.uncertain_delivery.includes(id));assert.ok(p.reasons[id].some(r=>r.code==='uncertain'));assert.equal(JSON.stringify({s,evidence}),before);assert.equal(s.contacts[0].do_not_contact,false);
});
test('large persistent batch and exclusion banners are removed; welcome and individual batch commands remain',()=>{
 const read=p=>readFileSync(new URL(`../components/${p}`,import.meta.url),'utf8');const people=read('control-center.tsx'),queue=read('manual-queue.tsx');
 assert.ok(!people.includes('Do not contact saved.'));assert.ok(!queue.includes('cc-queue-receipt'));assert.ok(!queue.includes('receipt.label'));assert.ok(queue.includes('cc-person-batch'));assert.ok(queue.includes('queueReceipt(b).canCopy'));assert.ok(read('overview-dashboard.tsx').includes('ov-hero ov-welcome'));
});
