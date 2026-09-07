import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkHandler} from '../worker/work-mcp.mjs';
const url='https://fixture.supabase.co';
function setup({expired=false,wrongUser=false,revoked=false,noClient=false}={}){
 const calls=[];const client={auth:{getClaims:async()=>({data:{claims:{sub:'owner',iss:`${url}/auth/v1`,exp:Math.floor(Date.now()/1000)+(expired?-1:600),client_id:noClient?null:'client'}}}),getUser:async()=>({data:{user:{id:wrongUser?'other':'owner'}}})},rpc:async(name,args)=>{calls.push(args);return revoked?{error:{message:'revoked'}}:{data:args.cmd==='status'?{}:{ok:true}};}};
 return {calls,handler:createWorkHandler({url,anonKey:'public-test-key',clientFactory:()=>client})};
}
function request(body,token='token'){return new Request(`${url}/functions/v1/outreach-work/mcp`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});}
test('missing/expired/wrong-user/non-OAuth credentials fail closed',async()=>{
 for(const config of [{expired:true},{wrongUser:true},{noClient:true}]){const {handler,calls}=setup(config);assert.equal((await handler(request({}))).status,401);assert.equal(calls.length,0);}
 const {handler}=setup();const result=await handler(request({},null));assert.equal(result.status,401);assert.match(result.headers.get('www-authenticate'),/oauth-protected-resource/);
});
test('revoked workspace access cannot call tools',async()=>{const {handler,calls}=setup({revoked:true});assert.equal((await handler(request({method:'tools/call'}))).status,403);assert.deepEqual(calls.map(c=>c.cmd),['status']);});
test('MCP initializes with mandatory runner instructions',async()=>{const {handler}=setup();const response=await handler(request({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}}));assert.equal(response.status,200);const body=await response.json();assert.match(body.result.instructions,/retry ONLY that same recording/);});
test('tool list exposes only scoped operations with annotations',async()=>{const {handler}=setup();const r=await handler(request({jsonrpc:'2.0',id:2,method:'tools/list',params:{}}));const body=await r.json();assert.equal(body.result.tools.length,6);assert.ok(body.result.tools.every(t=>t.annotations.idempotentHint));assert.ok(!body.result.tools.some(t=>/sql|owner|allow_client/.test(t.name)));});
test('invalid recording arguments never reach database command',async()=>{const {handler,calls}=setup();const r=await handler(request({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'record_outcome',arguments:{owner_id:'someone'}}}));const body=await r.json();assert.ok(body.error||body.result?.isError);assert.deepEqual(calls.map(c=>c.cmd),['status']);});
test('metadata contains public OAuth discovery, no credentials',async()=>{const {handler}=setup();const r=await handler(new Request(`${url}/functions/v1/outreach-work/.well-known/oauth-protected-resource`));const b=await r.json();assert.deepEqual(b.authorization_servers,[`${url}/auth/v1`]);assert.equal(b.resource,`${url}/functions/v1/outreach-work/mcp`);});
