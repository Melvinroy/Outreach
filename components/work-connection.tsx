"use client";
import {useEffect,useState} from 'react';
import type {SupabaseClient,OAuthAuthorizationDetails} from '@supabase/supabase-js';
export const workEndpoint='https://phknvjttkjatzbhgnera.supabase.co/functions/v1/outreach-work/mcp';
export function WorkConsent({client,authorizationId}:{client:SupabaseClient;authorizationId:string}) {
 const [details,setDetails]=useState<OAuthAuthorizationDetails|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;void (async()=>{
  const access=await client.rpc('work_recording',{cmd:'status',p:{}});if(access.error)throw new Error('Sign in with your authorized Outreach account.');
  const {data,error}=await client.auth.oauth.getAuthorizationDetails(authorizationId);if(error)throw error;if(!active)return;
  if(data && 'redirect_url' in data){window.location.assign(data.redirect_url);return;}
  setDetails(data);
 })().catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[client,authorizationId]);
 async function decide(approve:boolean){if(!details||busy)return;setBusy(true);setError('');try{
  if(approve){const result=await client.rpc('work_recording',{cmd:'allow_client',p:{client_id:details.client.id}});if(result.error)throw result.error;}
  const result=approve?await client.auth.oauth.approveAuthorization(authorizationId,{skipBrowserRedirect:true}):await client.auth.oauth.denyAuthorization(authorizationId,{skipBrowserRedirect:true});
  if(result.error)throw result.error;if(result.data)window.location.assign(result.data.redirect_url);
 }catch(e){setError(e instanceof Error?e.message:'Could not complete authorization.');}finally{setBusy(false);}}
 return <main className="outreach-public outreach-sign-in"><section className="simple-sign-in"><h1>Connect Outreach Work</h1>{error&&<p role="alert">{error}</p>}{details?<><p><strong>{details.client.name}</strong> requests access to your Outreach account.</p><p>Read your saved queues and messages, claim the queue you request, and record observed LinkedIn outcomes. Connecting does not send invitations.</p><p>Requested scopes: {details.scope}</p><p>You can revoke access in Settings.</p><button className="public-primary" disabled={busy} onClick={()=>void decide(true)}>Allow access</button><button disabled={busy} onClick={()=>void decide(false)}>Cancel</button></>:!error&&<p>Loading authorization…</p>}</section></main>;
}
type WorkClient={client_id:string;enabled:boolean;last_seen_at?:string};
export function WorkConnection({client,demo}:{client?:SupabaseClient;demo:boolean}){
 const [clients,setClients]=useState<WorkClient[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
 useEffect(()=>{if(!client||demo)return;let active=true;void client.rpc('work_recording',{cmd:'status',p:{}}).then(({data,error})=>{if(active){if(error)setError('Connection status unavailable.');else setClients(data?.clients||[]);}});return()=>{active=false;};},[client,demo]);
 async function revoke(id:string){if(!client)return;setBusy(true);try{const result=await client.rpc('work_recording',{cmd:'revoke_client',p:{client_id:id}});if(result.error)throw result.error;const auth=await client.auth.oauth.revokeGrant({clientId:id});if(auth.error)throw auth.error;setClients(cs=>cs.map(c=>c.client_id===id?{...c,enabled:false}:c));}catch{setError('Access disabled if recorded; refresh Settings to verify revocation.');}finally{setBusy(false);}}
 const enabled=clients.filter(c=>c.enabled),last=enabled.map(c=>c.last_seen_at).filter(Boolean).sort().at(-1);
 return <section className="cc-settings-section"><h3>ChatGPT Work</h3><p>{demo?'Live integration unavailable in sample mode':last?'Recording access verified':enabled.length?'Authorized · First Work check pending':'Not connected'}</p>{last&&<small>Last successful Work call: {new Date(last).toLocaleString()}</small>}{error&&<p role="alert">{error}</p>}<p>Add the private Outreach integration in ChatGPT using OAuth, then sign in with your Outreach account. Reconnect there if access expires.</p><button disabled={demo} onClick={()=>void navigator.clipboard.writeText(workEndpoint).then(()=>setCopied(true)).catch(()=>setError(workEndpoint))}>{copied?'Link copied':'Copy integration URL'}</button>{enabled.map(c=><button key={c.client_id} disabled={busy} onClick={()=>void revoke(c.client_id)}>Disconnect Work</button>)}<details><summary>Setup details</summary><code style={{overflowWrap:'anywhere'}}>{workEndpoint}</code><p>OAuth consent is required once. Saved queues still need your explicit run command.</p></details></section>;
}
