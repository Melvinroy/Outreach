import subprocess,json,uuid,concurrent.futures,os
# Run only against a disposable database loaded with bootstrap.sql and all migrations.
DB=os.environ['OUTREACH_TEST_DATABASE']; U=str(uuid.uuid4()); EXE=os.environ.get('PSQL','psql')
assert os.environ.get('OUTREACH_DISPOSABLE_DATABASE') == 'yes', 'Requires a disposable test database'
def sql(q,check=True):
 r=subprocess.run([EXE,'-X','-q','-At','-v','ON_ERROR_STOP=1','-h',os.environ.get('PGHOST','127.0.0.1'),'-p',os.environ.get('PGPORT','55439'),'-U',os.environ.get('PGUSER','outreach_test'),'-d',DB],input="select set_config('request.jwt.claim.sub','"+U+"',false);\n"+q,capture_output=True,encoding='utf-8')
 if check and r.returncode:raise RuntimeError(r.stderr)
 return r
setup="""insert into auth.users(id) values('%s');insert into public.outreach_app_access(user_id) values('%s');
do $$ declare r uuid;c uuid;begin
 for n in 1..30 loop
 if (n-1)%%15=0 then insert into public.outreach_runs(run_date,generated_at_sgt) values((select coalesce(max(run_date),current_date)+1 from public.outreach_runs),now()) returning id into r;end if;
 insert into public.outreach_contacts(full_name,employer,linkedin_profile_url,first_recommended_date,last_recommended_date) values(current_setting('request.jwt.claim.sub')||lpad(n::text,2,'0'),'Fixture','https://www.linkedin.com/in/%s-'||n,current_date,current_date) returning id into c;
 insert into public.outreach_recommendations(run_id,contact_id,track,priority,fit_assessment,personalized_message,message_character_count,verified_at) values(r,c,'hiring_manager',((n-1)%%15)+1,'Fixture','Hello fixture',13,now());
 end loop;end $$;
select jsonb_agg(outreach_private.manual_invitation(id) order by full_name) from public.outreach_contacts where linkedin_profile_url like '%%%s%%';"""%(U,U,U,U)
items=json.loads(sql(setup).stdout.strip().splitlines()[-1])
def rpc(cmd,p):
 q="select public.manual_outreach('%s','%s'::jsonb);"%(cmd,json.dumps(p).replace("'","''"))
 return json.loads(sql(q).stdout.strip().splitlines()[-1])
plan=rpc('queue_preview',{'items':items[:10]});payload={'items':items[:10],'request_id':str(uuid.uuid4()),'allocation_token':plan['token']}
with concurrent.futures.ThreadPoolExecutor(2) as pool:
 results=list(pool.map(lambda _:rpc('queue',payload),range(2)))
assert results[0]==results[1], 'Concurrent identical request differs'
stale=rpc('queue',{'items':items[10:],'request_id':str(uuid.uuid4()),'allocation_token':plan['token']});assert stale['allocation_changed']
plan=rpc('queue_preview',{'items':items[10:]});rpc('queue',{'items':items[10:],'request_id':str(uuid.uuid4()),'allocation_token':plan['token']})
state=rpc('snapshot',{});ids=[q['id'] for q in state['queue_state']['queues']]
assert len(ids)==2
with concurrent.futures.ThreadPoolExecutor(2) as pool:
 results=list(pool.map(lambda bid:sql("select * from public.start_browser_assisted_batch('%s');"%bid,False),ids))
assert results[0].returncode==0 and results[1].returncode!=0,'Concurrent start skipped FIFO'
state=rpc('snapshot',{});assert len([q for q in state['queue_state']['queues'] if q['status']=='running'])==1
assert sql("select count(*) from public.outreach_assist_sessions where requested_by='%s' and status='prepared';"%U).stdout.strip().splitlines()[-1]=='30'
print('PASS concurrent idempotent saves, stale allocation, FIFO starts, no duplicate recipients, no sends')



