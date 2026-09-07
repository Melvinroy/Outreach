import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {z} from 'zod';

export const runnerInstructions = `Use only the user's explicitly selected frozen connection queue. Inspect it, then claim it before any LinkedIn action. Stop if claim fails. Keep the returned execution ID and operation IDs. Verify each profile and existing relationship; never infer connected from a missing Connect button. Before processing each recipient, persist begin_attempt (including recipients who may be skipped). Require its receipt before clicking Send. Use the exact frozen message. Record each visible outcome immediately. If recording fails, STOP further outreach: retrieve the operation receipt and retry ONLY that same recording, never the LinkedIn send. An unfinished attempt requires read-only verification and recovery. Follow is not an invitation or connection. Connect unavailable and email required are non-send outcomes. Do not start the next queue automatically. Report only database-confirmed outcomes. Recovery tools never authorize sending, following or withdrawing.`;
const uuid=z.string().uuid();
const operation={operation_id:uuid.describe('Unique ID for this operation. Reuse it unchanged after an interrupted request.')};
const recipient={session_id:uuid};
const evidence={outcome:z.enum(['sent','already_pending','already_connected','connect_unavailable','email_required','identity_mismatch','uncertain','verified_not_sent']),evidence:z.string().min(10).max(2000),observed_at:z.string().datetime({offset:true}),confirmation_signal:z.literal('linkedin_invitation_sent_visible').optional()};
const definitions=[
 ['inspect_queue','inspect','Use this to read the exact saved queue and frozen recipients before acting.',{batch_code:z.string().regex(/^[0-9a-f]{8}$/i)},true],
 ['claim_queue','claim','Use this only after the user explicitly asks to run this queue. A successful claim is required before LinkedIn outreach.',{batch_code:z.string().regex(/^[0-9a-f]{8}$/i),execution_id:uuid,...operation},false],
 ['begin_attempt','begin','Use this before processing one recipient, including a non-send outcome. Require its receipt before Send; stop if it cannot be persisted.',{...recipient,execution_id:uuid,...operation},false],
 ['record_outcome','record','Use this immediately after observing the result. This records evidence and never sends an invitation.',{...recipient,execution_id:uuid,...operation,...evidence},false],
 ['recover_outcome','recover','Use this only to reconcile a pending recording incident using fresh read-only LinkedIn verification. Never resend.',{...recipient,...operation,...evidence},false],
 ['get_receipt','receipt','Use this after an interrupted update to find its durable receipt before retrying the same recording.',operation,true],
];
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}});
export function createWorkHandler({url,anonKey,clientFactory}) {
 const resource=`${url}/functions/v1/outreach-work/mcp`;
 const metadata=`${url}/functions/v1/outreach-work/.well-known/oauth-protected-resource`;
 const challenge=`Bearer resource_metadata="${metadata}"`;
 return async req=>{
  const path=new URL(req.url).pathname;
  if(req.method==='GET' && path.endsWith('/.well-known/oauth-protected-resource')) return json({resource,authorization_servers:[`${url}/auth/v1`],scopes_supported:['openid'],bearer_methods_supported:['header'],resource_name:'Outreach Work'});
  if(!path.endsWith('/mcp')) return json({error:'Not found'},404);
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token) return json({error:'Connect your Outreach account'},401,{'www-authenticate':challenge});
  const client=clientFactory(url,anonKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  try {
   const {data,error}=await client.auth.getClaims(token);
   const claims=data?.claims;
   if(error || !claims?.sub || !claims.client_id || claims.iss!==`${url}/auth/v1` || !claims.exp || claims.exp*1000<=Date.now()) return json({error:'Reconnect your Outreach account'},401,{'www-authenticate':challenge});
   const user=await client.auth.getUser(token);
   if(user.error || user.data?.user?.id!==claims.sub) return json({error:'Reconnect your Outreach account'},401,{'www-authenticate':challenge});
   const access=await client.rpc('work_recording',{cmd:'status',p:{}});
   if(access.error) return json({error:'Outreach access is not authorized'},403);
   if(req.method!=='POST') return json({error:'Method not allowed'},405,{allow:'POST'});
   const raw=await req.text();if(raw.length>65536) return json({error:'Request too large'},413);
   let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
   const server=new McpServer({name:'outreach-work',version:'1.0.0'},{instructions:runnerInstructions});
   for(const [name,cmd,description,inputSchema,readOnly] of definitions) server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:true,openWorldHint:false},_meta:{securitySchemes:[{type:'oauth2',scopes:['openid']}]}},async args=>{
    const {data,error}=await client.rpc('work_recording',{cmd,p:args});
    if(error) return {isError:true,content:[{type:'text',text:`Recording rejected: ${error.message}. Do not send again.`}]};
    const result=cmd==='inspect'?{...data,runner_instructions:runnerInstructions}:{receipt:data};
    return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
   });
   const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
   await server.connect(transport);
   try{return await transport.handleRequest(req,{parsedBody:body});}finally{await server.close();}
  } catch {return json({error:'Recording service unavailable. Retrieve the receipt before retrying; do not resend.'},503);}
 };
}
