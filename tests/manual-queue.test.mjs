import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationMessage, selectionSummary, queueBlockReason, batchCommand } from '../lib/manual-queue.mjs';
test('invitation fallback skips blank recent recommendations and does not use a later reply', () => {
 const recs=[{id:2,verified_at:'2026-09-02',personalized_message:' '},{id:1,verified_at:'2026-09-01',personalized_message:'Hello'}];
 assert.equal(invitationMessage([{intent:'reply',draft_text:'Reply'}],recs).text,'Hello');
 assert.equal(invitationMessage([{intent:'invitation',draft_text:'Saved'}],recs).text,'Saved');
 assert.equal(invitationMessage([],[]).text,'');
});
test('mixed counts and limits keep selection separate from sending', () => {
 assert.equal(selectionSummary([{id:'a',connection_status:'not_contacted'},{id:'b',connection_status:'connected'}],['a','b']).label,'2 selected: 1 connection request, 1 reply');
 assert.match(queueBlockReason(Array(16).fill('a'),{},true),/15/);
 assert.match(queueBlockReason(['a'],{},true),/No invitation/);
 assert.equal(queueBlockReason(['a'],{a:{text:'Saved'}},true),'');
 assert.equal(batchCommand({kind:'invitation',code:'ABC12345'}),'Run my selected outreach batch ABC12345');
});
