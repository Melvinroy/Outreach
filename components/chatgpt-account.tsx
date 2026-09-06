"use client";
import {useEffect,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';

export function ChatGPTAccount({client,signIn=false}:{client:SupabaseClient;signIn?:boolean}) {
  const [available,setAvailable]=useState(false),[linked,setLinked]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    const abort=new AbortController();
    void fetch('/api/chatgpt/status',{cache:'no-store',signal:abort.signal}).then(async response=>{
      if(!response.ok)return;
      const status=await response.json();
      if(!abort.signal.aborted){setAvailable(status.available===true);setLinked(status.linked===true);}
    }).catch(()=>{});
    return ()=>abort.abort();
  },[]);
  async function perform(operation:'exchange'|'link'|'unlink') {
    if(busy)return;setBusy(true);setError('');
    try {
      const challenge=await fetch('/api/chatgpt/status',{cache:'no-store'});
      if(!challenge.ok)throw new Error('ChatGPT sign-in is not available yet.');
      const status=await challenge.json();
      const {data}=await client.auth.getSession();
      const response=await fetch(`/api/chatgpt/${operation}`,{method:'POST',headers:{'content-type':'application/json',
        ...(data.session?{authorization:`Bearer ${data.session.access_token}`}:{})},body:JSON.stringify({challenge:status.challenge})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || 'Please sign in again and retry.');
      if(operation==='exchange') {
        const {error}=await client.auth.setSession(result.session);
        if(error)throw error;
      } else setLinked(result.linked);
    }catch(error){setError(error instanceof Error?error.message:'Could not connect. Try again.');}
    finally{setBusy(false);}
  }
  if(!available)return null;
  return <div><button type="button" className="public-secondary" disabled={busy} onClick={()=>void perform(signIn?'exchange':linked?'unlink':'link')}>
    {busy?'Please wait…':signIn?'Continue with ChatGPT':linked?'Unlink ChatGPT':'Link ChatGPT'}
  </button>{error&&<p className="form-error" role="alert">{error}</p>}</div>;
}
