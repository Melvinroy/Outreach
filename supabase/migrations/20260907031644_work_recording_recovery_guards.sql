do $$ declare d text;begin
 d:=pg_get_functiondef('outreach_private.work_recording(text,jsonb)'::regprocedure);
 d:=replace(d,'''queue_number'',b.queue_number,''recovery_required''','''queue_number'',b.queue_number,''execution_id'',(select execution_id from outreach_private.work_claims where batch_id=bid),''recovery_required''');
 d:=replace(d,'if s.status<>''prepared'' or exists','if outreach_private.manual_contact_block(s.contact_id) is not null then raise exception ''Recipient is excluded or requires review'';end if;
  if s.status<>''prepared'' or exists');
 d:=replace(d,'update outreach_private.work_recovery set resolved_at=stamp where session_id=sid;',
 'if outcome=''uncertain'' then insert into outreach_private.work_recovery(session_id,owner_id,reason) values(sid,u,note) on conflict(session_id) do update set reason=excluded.reason,resolved_at=null;
  else update outreach_private.work_recovery set resolved_at=stamp where session_id=sid;end if;');
 execute d;
end $$;
