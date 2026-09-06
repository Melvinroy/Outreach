// Called only from the Sites server boundary. Never import into a browser bundle.
const respond = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store',
    'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', ...headers },
});
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode = value => Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
const utf8 = new TextEncoder();

export function createChatGPTSessionHandler({origin, siteId, secret, backend, verifiedIdentity, enabled = false, now = Date.now}) {
  async function key() { return crypto.subtle.importKey('raw', utf8.encode(secret), {name:'HMAC',hash:'SHA-256'},false,['sign','verify']); }
  async function challenge(identity) {
    const payload = encode(utf8.encode(JSON.stringify({identity,siteId,expires:now()+300000,nonce:crypto.randomUUID()})));
    return `${payload}.${encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(),utf8.encode(payload))))}`;
  }
  async function verify(token,identity) {
    if (typeof token !== 'string' || token.length>2048) return false;
    try {
      const [payload,signature,extra] = token.split('.');
      if (extra || !await crypto.subtle.verify('HMAC',await key(),decode(signature),utf8.encode(payload))) return false;
      const data=JSON.parse(new TextDecoder().decode(decode(payload)));
      return data.identity===identity && data.siteId===siteId && data.expires>now() && data.expires<=now()+300000;
    } catch { return false; }
  }
  return async request => {
    const url = new URL(request.url);
    if (url.origin!==origin) return respond({error:'Origin denied'},403);
    if (!enabled || !secret || !backend) return respond({available:false},503);
    // The caller must supply dispatch-verified identity, never body/email claims.
    const identity=await verifiedIdentity(request);
    if (!identity) return respond({error:'ChatGPT sign-in required'},401);
    try {
      if (request.method==='GET' && url.pathname==='/api/chatgpt/status') {
        const token=await challenge(identity);
        const linked=await backend.lookup(siteId,identity);
        return respond({available:true,linked:!!linked,challenge:token},200,{
          'set-cookie':`__Host-outreach-exchange=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=300`,
        });
      }
      if (request.method!=='POST') return respond({error:'Method denied'},405);
      if (request.headers.get('origin')!==origin || request.headers.get('sec-fetch-site')!=='same-origin') return respond({error:'Cross-site request denied'},403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return respond({error:'JSON required'},415);
      const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-outreach-exchange='))?.slice(25);
      const raw=await request.text();
      if (raw.length>4096) return respond({error:'Request too large'},413);
      const body=JSON.parse(raw);
      if (!cookie || body.challenge!==cookie || !await verify(body.challenge,identity)) return respond({error:'Exchange expired. Try again.'},403);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(cookie))),x=>x.toString(16).padStart(2,'0')).join('');
      const operation=url.pathname.split('/').at(-1);
      if (!['link','unlink','exchange'].includes(operation)) return respond({error:'Not found'},404);
      if (operation==='exchange') {
        const linked=await backend.lookup(siteId,identity);
        if (!linked) return respond({error:'Sign in another way and link ChatGPT in Settings first.'},403);
        await backend.consume(siteId,identity,linked,hash);
        const session=await backend.sessionFor(linked);
        if (!session || session.user?.id!==linked || !await backend.authorized(linked)) return respond({error:'Workspace access denied'},403);
        return respond({session},200,{'set-cookie':'__Host-outreach-exchange=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'});
      }
      const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
      const user=token && await backend.authenticate(token);
      if (!user || !await backend.authorized(user.id)) return respond({error:'Workspace sign-in required'},401);
      // Linking and unlinking require a recent independent sign-in, not this exchange.
      if (!await backend.independentSignIn(token,user.id,now())) return respond({error:'Sign in again with Google or your Outreach password first.'},403);
      await backend.mutate(operation,siteId,identity,user.id,hash);
      return respond({linked:operation==='link'},200,{'set-cookie':'__Host-outreach-exchange=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'});
    } catch { return respond({error:'This request could not be completed. Sign in again and retry.'},400); }
  };
}
