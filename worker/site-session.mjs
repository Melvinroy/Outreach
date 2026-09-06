import {createChatGPTSessionHandler} from './chatgpt-session.mjs';
import {createChatGPTBackend} from './chatgpt-supabase-backend.mjs';

const worker = {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/chatgpt/')) {
      const configured=env.CHATGPT_LOGIN_ENABLED==='true' && !!env.SUPABASE_SERVICE_ROLE_KEY && !!env.CHATGPT_EXCHANGE_SECRET;
      const handler=createChatGPTSessionHandler({origin:env.OUTREACH_SITE_ORIGIN,
        siteId:env.OUTREACH_SITE_ID,secret:env.CHATGPT_EXCHANGE_SECRET,enabled:configured,
        backend:configured?createChatGPTBackend(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY):null,
        // Only enable after verifying Sites dispatch strips/replaces forged headers
        // and the worker has no direct public ingress bypassing that dispatcher.
        verifiedIdentity:async req=>env.SITES_IDENTITY_BOUNDARY_VERIFIED==='true'?req.headers.get('oai-authenticated-user-id'):null,
      });
      return handler(request);
    }
    let response=await env.ASSETS.fetch(request);
    if(response.status===404 && request.method==='GET' && request.headers.get('accept')?.includes('text/html')) {
      response=await env.ASSETS.fetch(new Request(new URL('/index.html',request.url),request));
    }
    return response;
  },
};

export default worker;
