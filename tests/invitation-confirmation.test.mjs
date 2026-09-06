import test from 'node:test';
import assert from 'node:assert/strict';
import {readDeliveryEvidence} from '../lib/person-evidence.mjs';
import {confirmableInvitation} from '../lib/manual-confirmation.mjs';
import {projectRelationships} from '../lib/relationship-projection.mjs';
const snapshot={contacts:[{id:'p',connection_status:'request_sent'}],messages:[],threads:[],actions:[],jobs:[],events:[],restrictions:{excluded:[],discarded:[]}};
const item={id:'s',contact_id:'p',status:'completed'};
const manual={invitations:{},tasks:[],batches:[{id:'b',kind:'invitation',items:[item]}]};
test('distinct session schemas load confirmations and eliminate false attention',async()=>{
 const calls=[];
 const client={from(table){return {select(fields){calls.push([table,fields]);assert.ok(table!=='outreach_phase5_sessions'||!fields.includes('failure_reason'));return this;},order(){return this;},range(){return Promise.resolve({data:table==='outreach_assist_sessions'?[{...item,confirmation_signal:'linkedin_invitation_sent_visible'}]:[]});}};}};
 const {invitations,replies}=await readDeliveryEvidence(client);
 const p=projectRelationships(snapshot,{manual,evidence:[...invitations,...replies]});
 assert.deepEqual(p.groups.waiting,['p']);assert.deepEqual(p.groups.attention,[]);assert.deepEqual(p.groups.do_not_contact,[]);assert.equal(calls.length,2);
});
test('unloaded confirmations do not turn completed invitations into delivery failures',()=>{
 const p=projectRelationships(snapshot,{manual,evidenceAvailable:false});assert.deepEqual(p.groups.uncertain_delivery,[]);assert.deepEqual(p.groups.waiting,['p']);
 const loaded=projectRelationships(snapshot,{manual,evidenceAvailable:true});assert.deepEqual(loaded.groups.uncertain_delivery,['p']);
});
test('manual confirmation targets exactly one prepared invitation and cannot clear other holds',()=>{
 const c={id:'p',connection_status:'not_contacted'},pending={...item,status:'prepared'},b=[{kind:'invitation',items:[pending]}];
 assert.equal(confirmableInvitation(c,b,true).id,'s');assert.equal(confirmableInvitation(c,b,false),null);
 assert.equal(confirmableInvitation({...c,connection_status:'request_sent'},b,true),null);
 assert.equal(confirmableInvitation(c,[{kind:'reply',items:[pending]}],true),null);
 assert.equal(confirmableInvitation(c,[{kind:'invitation',items:[pending,{...pending,id:'other'}]}],true),null);
 for(const status of ['failed','running','uncertain','awaiting_confirmation']) assert.equal(confirmableInvitation(c,[...b,{kind:'reply',items:[{...item,id:'hold',status}]}],true),null);
});
