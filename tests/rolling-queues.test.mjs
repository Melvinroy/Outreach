import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateQueues,allocationLabel} from '../lib/rolling-queues.mjs';
import {saveConnectionQueue,queueReceipt} from '../lib/queue-save.mjs';
const state=(queues=[],next_number=1)=>({queues,next_number,capacity:queues.reduce((n,q)=>n+(!q.started&&!q.uncertain?15-q.remaining:0),0)+(4-queues.length)*15});
const q=(number,remaining,started=false)=>({id:String(number),number,remaining,started,uncertain:false});
test('10 plus 8 fills oldest queue then overflows',()=>{
 const p=allocateQueues(state([q(2,10)],3),8);assert.deepEqual(p.allocations,[{number:2,count:5,batch_id:'2'},{number:3,count:3}]);assert.equal(allocationLabel(p.allocations),'5 people → Queue 2 · 3 people → Queue 3');
});
test('running queues never receive new recipients; finished slots allow higher numbers',()=>{
 assert.deepEqual(allocateQueues(state([q(1,2,true)],2),16).allocations,[{number:2,count:15},{number:3,count:1}]);
 assert.equal(allocateQueues(state([q(2,15),q(3,15),q(4,15)],5),1).allocations[0].number,5);
});
test('capacity rejects complete selection rather than partial saves',()=>{
 const s=state([q(1,1,true),q(2,15),q(3,15),q(4,14)],5);assert.equal(s.capacity,1);assert.deepEqual(allocateQueues(s,2).allocations,[]);assert.match(allocateQueues(s,2).error,/Only 1 spaces/);
});
test('allocation change never reports a successful write or clears selection',async()=>{
 const result=await saveConnectionQueue({items:[{}],beforeIds:[],rpc:async()=>({data:{allocation_changed:true,plan:{}}}),refresh:async()=>{throw Error('not called');}});assert.equal(result.ok,false);assert.equal(result.allocationChanged,true);
});
test('interrupted multi-queue save recovers exact persisted receipt',async()=>{
 const receipt={request_id:'request',selected_count:18,batches:[{batch_id:'q1',added_count:15},{batch_id:'q2',added_count:3}]};let writes=0;
 const result=await saveConnectionQueue({items:Array(18).fill({}),beforeIds:[],rpc:async()=>{writes++;throw Error('disconnected');},recoverByRequest:async()=>receipt,refresh:async()=>({})});
 assert.equal(result.ok,true);assert.deepEqual(result.data,receipt);assert.equal(writes,1);
});
test('FIFO command access follows authoritative eligibility including resume',()=>{
 const batch={id:'b',code:'code',status:'ready',items:[{status:'prepared',contact_id:'a'}],can_run:false};assert.equal(queueReceipt(batch).canCopy,false);
 assert.equal(queueReceipt({...batch,status:'running',can_run:true}).canCopy,true);
});
