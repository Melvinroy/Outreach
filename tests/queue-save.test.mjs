import test from 'node:test';
import assert from 'node:assert/strict';
import {saveConnectionQueue, findSavedQueue, queueReceipt} from '../lib/queue-save.mjs';
const items=[{contact_id:'one',text:'Saved invitation'}];
const batch={id:'new',code:'NEW',kind:'invitation',status:'ready',items:[{...items[0],status:'prepared'}]};
const data={batch_id:'new',batch_code:'NEW',selected_count:1};
test('confirmed save retains receipt even if subsequent refresh fails',async()=>{
 let writes=0;
 const result=await saveConnectionQueue({items,beforeIds:[],rpc:async()=>{writes++;return {data};},refresh:async()=>{throw Error('offline');}});
 assert.deepEqual(result,{ok:true,data,refreshFailed:true});assert.equal(writes,1);
});
test('interrupted save reconciles exact frozen batch without repeating write',async()=>{
 let writes=0;
 const result=await saveConnectionQueue({items,beforeIds:['old'],rpc:async()=>{writes++;throw Error('connection lost');},refresh:async()=>({batches:[batch]})});
 assert.deepEqual(result,{ok:true,data});assert.equal(writes,1);
});
test('unknown outcome never claims success or retries',async()=>{
 let writes=0;
 const result=await saveConnectionQueue({items,beforeIds:[],rpc:async()=>{writes++;throw Error('offline');},refresh:async()=>({batches:[]})});
 assert.equal(result.ok,false);assert.equal(result.uncertain,true);assert.equal(writes,1);
});
test('explicit database rejection preserves failed-save outcome',async()=>{
 const result=await saveConnectionQueue({items,beforeIds:[],rpc:async()=>({error:{code:'P0001',message:'Invitation changed'}}),refresh:async()=>{throw Error('must not run');}});
 assert.deepEqual(result,{ok:false,error:'Invitation changed'});
});
test('reconciliation excludes prior batches and requires all exact messages',()=>{
 assert.equal(findSavedQueue([batch],items,['new']),undefined);
 assert.equal(findSavedQueue([batch],[{...items[0],text:'Changed'}],[]),undefined);
 assert.equal(findSavedQueue([batch],[...items,{contact_id:'two',text:'Other'}],[]),undefined);
});
test('receipt disables commands for superseded and uncertain batches',()=>{
 assert.equal(queueReceipt(batch).canCopy,true);
 assert.equal(queueReceipt({...batch,status:'cancelled'}).canCopy,false);
 assert.equal(queueReceipt({...batch,items:[{...batch.items[0],status:'failed'}]}).label,'1 uncertain');
 assert.equal(queueReceipt({...batch,status:'running'}).canCopy,false);
});
