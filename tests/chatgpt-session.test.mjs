import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTSessionHandler} from '../worker/chatgpt-session.mjs';

const origin='https://outreach.example';
function fixture() {
  let linked='owner', calls=0;
  const used=new Set();
  const backend={lookup:async()=>linked,authorized:async id=>id==='owner',authenticate:async t=>t==='real'?{id:'owner'}:null,
    independentSignIn:async t=>t==='real',consume:async(s,i,u,n)=>{if(used.has(n))throw Error();used.add(n);},
    sessionFor:async id=>{calls++;return {user:{id},access_token:'test-session'};},mutate:async()=>{}};
  const handle=createChatGPTSessionHandler({origin,siteId:'site',secret:'a'.repeat(64),backend,enabled:true,
    verifiedIdentity:async request=>request.headers.get('x-test-dispatch')==='verified'?'chatgpt-owner':null});
  async function challenge() {
    const response=await handle(new Request(origin+'/api/chatgpt/status',{headers:{'x-test-dispatch':'verified'}}));
    return {token:(await response.json()).challenge,cookie:response.headers.get('set-cookie').split(';')[0]};
  }
  function post({token,cookie}, extra={}) { return new Request(origin+'/api/chatgpt/exchange',{method:'POST',
    headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json','x-test-dispatch':'verified',cookie,...extra},body:JSON.stringify({challenge:token})}); }
  return {handle,challenge,post,setLinked:value=>linked=value,calls:()=>calls};
}
test('linked exchange succeeds once and rejects replay',async()=>{
  const f=fixture(),c=await f.challenge();
  const response=await f.handle(f.post(c));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.json()).session.user.id,'owner');
  assert.equal((await f.handle(f.post(c))).status,400);assert.equal(f.calls(),1);
});
test('unlinked identity, forged client identity, cross-site and tampered challenge cannot mint sessions',async()=>{
  const f=fixture(),c=await f.challenge();
  assert.equal((await f.handle(f.post(c,{'x-test-dispatch':'forged','oai-authenticated-user-id':'chatgpt-owner'}))).status,401);
  assert.equal((await f.handle(f.post(c,{origin:'https://evil.example'}))).status,403);
  assert.equal((await f.handle(f.post({...c,token:c.token+'x'}))).status,403);
  f.setLinked(null);assert.equal((await f.handle(f.post(c))).status,403);assert.equal(f.calls(),0);
});
test('feature stays unavailable until runtime explicitly enables it',async()=>{
  const handle=createChatGPTSessionHandler({origin});
  assert.equal((await handle(new Request(origin+'/api/chatgpt/status'))).status,503);
});
