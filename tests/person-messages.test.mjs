import test from 'node:test';
import assert from 'node:assert/strict';
import {manualPersonStatus,selectionSummary,queueBlockReason} from '../lib/manual-queue.mjs';
import {matchesPeopleFocus,createDemoControlCenter,peopleFocusOptions} from '../lib/control-center.mjs';
test('four views include waiting connected people, with exclusions separate',()=>{
 const s=createDemoControlCenter();
 const c={...s.contacts[0],connection_status:'connected'};s.contacts[0]=c;
 assert.deepEqual(peopleFocusOptions.map(x=>x[1]),['All people','To connect','Conversations','Do not contact']);
 assert.equal(matchesPeopleFocus(s,c,'conversations'),true);
 c.do_not_contact=true;
 assert.equal(matchesPeopleFocus(s,c,'conversations'),false);
 assert.equal(matchesPeopleFocus(s,c,'do_not_contact'),true);
 assert.equal(matchesPeopleFocus(s,c,'all'),true);
});
test('manual queue states take precedence over obsolete automatic-workflow projections',()=>{
 const c={id:'one',connection_status:'not_contacted'};
 const d={invitations:{one:{text:'Saved invite'}},tasks:[],batches:[]};
 assert.equal(manualPersonStatus(c,d),'Invitation ready');
 d.batches=[{status:'ready',items:[{contact_id:'one',status:'prepared'}]}];
 assert.equal(manualPersonStatus(c,d),'Queued');
 d.batches[0].status='running';assert.equal(manualPersonStatus(c,d),'Needs reconciliation');
 d.batches[0].items[0].status='failed';assert.equal(manualPersonStatus(c,d),'Needs reconciliation');
 c.do_not_contact=true;assert.equal(manualPersonStatus(c,d),'Do not contact');
});
test('processing invitation subset retains selected conversations and enforces 15 limit',()=>{
 const contacts=[{id:'a',connection_status:'not_contacted'},{id:'b',connection_status:'connected'}],ids=['a','b'];
 const summary=selectionSummary(contacts,ids);
 assert.deepEqual(ids.filter(id=>!summary.invitations.includes(id)),['b']);
 assert.match(queueBlockReason(Array.from({length:16},(_,i)=>String(i)),{},true),/at most 15/);
 assert.deepEqual(ids,['a','b']);
});
