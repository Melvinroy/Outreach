import {createClient} from '@supabase/supabase-js';
import {createWorkHandler} from '../../../worker/work-mcp.mjs';
declare const Deno: {env:{get(key:string):string|undefined};serve(handler:(req:Request)=>Promise<Response>):void};
Deno.serve(createWorkHandler({url:Deno.env.get('SUPABASE_URL')!,anonKey:Deno.env.get('SUPABASE_ANON_KEY')!,clientFactory:createClient}));
