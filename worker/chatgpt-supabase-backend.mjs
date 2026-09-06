import {createClient} from '@supabase/supabase-js';

export function createChatGPTBackend(url, serviceKey) {
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  async function rpc(operation,site,identity,user=null,nonce=null) {
    const {data,error}=await admin.rpc('chatgpt_identity_operation',{p_operation:operation,p_site:site,p_identity:identity,p_user:user,p_nonce:nonce});
    if(error) throw new Error('Identity operation rejected');
    return data;
  }
  return {
    async lookup(site,identity) { return (await rpc('lookup',site,identity))?.user_id || null; },
    async authorized(id) { const {data,error}=await admin.from('outreach_app_access').select('user_id').eq('user_id',id).maybeSingle(); return !error && !!data; },
    async authenticate(token) { const {data,error}=await admin.auth.getUser(token); return error ? null : data.user; },
    async independentSignIn(token,id,now) {
      const {data,error}=await admin.auth.getClaims(token);
      if(error || data?.claims?.sub!==id) return false;
      return (data.claims.amr || []).some(claim=>['password','oauth'].includes(claim.method) && claim.timestamp*1000>now-300000);
    },
    consume: (site,identity,user,nonce)=>rpc('consume',site,identity,user,nonce),
    mutate: (operation,site,identity,user,nonce)=>rpc(operation,site,identity,user,nonce),
    async sessionFor(id) {
      const {data:account,error}=await admin.auth.admin.getUserById(id);
      if(error || !account.user?.email || !account.user.email_confirmed_at) throw new Error('Existing verified account required');
      const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:account.user.email});
      if(linkError || link.user?.id!==id || !link.properties?.hashed_token) throw new Error('Account mismatch');
      // Generation does not email the link. Consume it here; never return a link or OTP.
      const isolated=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const {data,error:verifyError}=await isolated.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token});
      if(verifyError || data.user?.id!==id) throw new Error('Session verification failed');
      return data.session;
    },
  };
}
