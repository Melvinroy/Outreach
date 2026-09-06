begin;
do $$ declare u uuid:=gen_random_uuid(); r uuid; c uuid; ids uuid[]; all_items jsonb:='[]'; items jsonb; d jsonb; p jsonb; a jsonb; b jsonb; again jsonb; req uuid:=gen_random_uuid(); old_id uuid; current_id uuid; later uuid; qno bigint;
begin
 insert into auth.users(id) values(u);insert into public.outreach_app_access(user_id) values(u);perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.outreach_runs(run_date,generated_at_sgt) values(current_date,now()) returning id into r;
 for n in 1..70 loop
  if (n-1)%15=0 then insert into public.outreach_runs(run_date,generated_at_sgt) values(current_date+n,now()) returning id into r;end if;
  insert into public.outreach_contacts(full_name,employer,linkedin_profile_url,first_recommended_date,last_recommended_date) values('Queue fixture '||n,'Fixture','https://www.linkedin.com/in/rolling-'||u||'-'||n,current_date,current_date) returning id into c;
  insert into public.outreach_recommendations(run_id,contact_id,track,priority,fit_assessment,personalized_message,message_character_count,verified_at) values(r,c,'hiring_manager',((n-1)%15)+1,'Fixture','Hello fixture',13,now());
  ids:=array_append(ids,c);d:=outreach_private.manual_invitation(c);all_items:=all_items||jsonb_build_array(d);
 end loop;
 select jsonb_agg(v) into items from jsonb_array_elements(all_items) with ordinality x(v,n) where n<=10;
 p:=public.manual_outreach('queue_preview',jsonb_build_object('items',items));
 a:=public.manual_outreach('queue',jsonb_build_object('items',items,'allocation_token',p->>'token','request_id',req));
 again:=public.manual_outreach('queue',jsonb_build_object('items',items,'allocation_token',p->>'token','request_id',req));
 if a<>again then raise exception 'Idempotency failed';end if;old_id:=(a->>'batch_id')::uuid;
 select jsonb_agg(v) into items from jsonb_array_elements(all_items) with ordinality x(v,n) where n between 11 and 18;
 p:=public.manual_outreach('queue_preview',jsonb_build_object('items',items));
 if (p->'allocations'->0->>'count')::integer<>5 or (p->'allocations'->1->>'count')::integer<>3 then raise exception '10+8 plan failed';end if;
 b:=public.manual_outreach('queue',jsonb_build_object('items',items,'allocation_token',p->>'token','request_id',gen_random_uuid()));
 -- A stale allocation is a non-write response, never a partial save.
 again:=public.manual_outreach('queue',jsonb_build_object('items',jsonb_build_array(all_items->65),'allocation_token','stale','request_id',gen_random_uuid()));
 if again->>'allocation_changed' is distinct from 'true' then raise exception 'Stale allocation accepted';end if;
 begin perform public.manual_outreach('queue',jsonb_build_object('items',jsonb_build_array(all_items->0)));raise exception 'FAIL duplicate recipient';exception when others then if sqlerrm='FAIL duplicate recipient' then raise;end if;end;
 if (select status from public.outreach_assist_batches where id=old_id)<>'cancelled' then raise exception 'Old command retained';end if;
 current_id:=(b->'batches'->0->>'batch_id')::uuid;later:=(b->'batches'->1->>'batch_id')::uuid;
 if (select queue_number from public.outreach_assist_batches where id=current_id)<>1 then raise exception 'Replacement reordered';end if;
 begin perform public.start_browser_assisted_batch(later);raise exception 'FAIL out of order';exception when others then if sqlerrm='FAIL out of order' then raise;end if;end;
 -- Draft replacement also preserves logical order.
 select value into d from jsonb_array_elements(public.manual_outreach('snapshot')->'batches') where value->>'id'=current_id::text;
 again:=public.manual_outreach('replace_queued',jsonb_build_object('contact_id',ids[1],'text','Updated frozen fixture','token',outreach_private.manual_invitation(ids[1])->>'token','batch_id',current_id,'batch_token',d->>'token','kind','invitation'));
 current_id:=(again->>'batch_id')::uuid;
 if (select queue_number from public.outreach_assist_batches where id=current_id)<>1 then raise exception 'Edit reordered queue';end if;
 perform public.start_browser_assisted_batch(current_id);
 perform public.start_browser_assisted_batch(current_id);

 select jsonb_agg(v) into items from jsonb_array_elements(all_items) with ordinality x(v,n) where n between 19 and 60;
 p:=public.manual_outreach('queue_preview',jsonb_build_object('items',items));
 if (p->'allocations'->0->>'number')::integer<>2 then raise exception 'Running queue filled';end if;
 a:=public.manual_outreach('queue',jsonb_build_object('items',items,'allocation_token',p->>'token','request_id',gen_random_uuid()));
 if jsonb_array_length(public.manual_outreach('snapshot')->'queue_state'->'queues')<>4 then raise exception 'Expected four queues';end if;
 begin perform public.manual_outreach('queue',jsonb_build_object('items',jsonb_build_array(all_items->60)));raise exception 'FAIL excess capacity';exception when others then if sqlerrm='FAIL excess capacity' then raise;end if;end;
 for c in select id from public.outreach_assist_sessions where batch_id=current_id and status='prepared' loop perform public.confirm_browser_assisted_outreach(c,'linkedin_invitation_sent_visible');end loop;
 a:=public.manual_outreach('queue',jsonb_build_object('items',jsonb_build_array(all_items->60)));
 if (a->'batches'->0->>'queue_number')::integer<>5 then raise exception 'Capacity not released or number reused';end if;
 if exists(select 1 from public.outreach_assist_sessions where batch_id=(a->>'batch_id')::uuid and status<>'prepared') then raise exception 'Saving ran outreach';end if;
 -- Removing the only recipient retires an empty queue and releases capacity.
 perform public.manual_outreach('remove',jsonb_build_object('contact_id',ids[61]));
 if (select status from public.outreach_assist_batches where id=(a->>'batch_id')::uuid)<>'cancelled' then raise exception 'Empty queue not retired';end if;
 -- Unknown delivery blocks execution but still permits saving other people.
 select id into later from public.outreach_assist_batches where requested_by=u and status='ready' order by queue_number limit 1;
 update public.outreach_assist_sessions set status='failed',failure_reason='No confirmation from browser' where id=(select id from public.outreach_assist_sessions where batch_id=later and status='prepared' order by sequence_no limit 1);
 begin perform public.start_browser_assisted_batch(later);raise exception 'FAIL uncertain start';exception when others then if sqlerrm='FAIL uncertain start' then raise;end if;end;
 a:=public.manual_outreach('queue',jsonb_build_object('items',jsonb_build_array(all_items->66)));
 if a->>'batch_id' is null then raise exception 'Uncertain result prevented saving';end if;

end $$;
rollback;
