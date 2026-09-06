-- Exercise an existing failed invitation inside a rollback-only transaction.
begin;
do $$ declare s public.outreach_assist_sessions%rowtype; result jsonb; begin
select * into s from public.outreach_assist_sessions where status='failed' and confirmation_signal is null limit 1;
if s.id is null then raise exception 'Missing correction test fixture';end if;
perform set_config('request.jwt.claim.sub',s.requested_by::text,true);
begin
 perform public.manual_outreach('record_invitation_not_sent',jsonb_build_object('session_id',s.id,'confirmed_not_sent',false,'note','Unchecked correction must fail'));
 raise exception 'Test accepted unchecked correction' using errcode='ZX001';
exception when sqlstate 'P0001' then null;end;
result:=public.manual_outreach('record_invitation_not_sent',jsonb_build_object('session_id',s.id,'confirmed_not_sent',true,'note','Transaction-only test of manual correction, rolled back'));
if (select status from public.outreach_assist_sessions where id=s.id)<>'skipped' then raise exception 'Correction did not skip';end if;
if (select failure_reason from public.outreach_assist_sessions where id=s.id) is distinct from s.failure_reason then raise exception 'Failure evidence changed';end if;
if (select connection_status from public.outreach_contacts where id=s.contact_id)<>'not_contacted' then raise exception 'Incorrect relationship';end if;
begin
 perform public.manual_outreach('record_invitation_not_sent',jsonb_build_object('session_id',s.id,'confirmed_not_sent',true,'note','Repeated correction must fail'));
 raise exception 'Test accepted repeated correction' using errcode='ZX001';
exception when sqlstate 'P0001' then null;end;
end $$;
select 'PASS: confirmation required, not-contacted preserved, failure evidence retained, duplicate rejected; all rolled back' as validation;
rollback;
