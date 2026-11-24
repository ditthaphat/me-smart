-- Integration smoke test for an already migrated test database. Every data
-- change is rolled back. Use only a disposable or explicitly approved DB.
begin;
do $test$
declare sid bigint; t uuid; v_course bigint; ids uuid[]; tok text; r jsonb; claim text;
begin
select id,teacher_id into v_course,t from public.courses where code='4112203' order by id limit 1;
select array_agg(student_id order by student_id) into ids from (select student_id from public.enrollments where enrollments.course_id=v_course and status='approved' order by student_id limit 5) a;
if t is null or coalesce(array_length(ids,1),0)<5 then raise exception 'Not enough approved test identities'; end if;
insert into public.attendance_sessions(course_id,session_date,topic) values(v_course,current_date,'temporary rolled-back two-window test') returning id into sid;
perform set_config('request.jwt.claim.sub',t::text,true); perform set_config('request.jwt.claims',json_build_object('sub',t,'role','authenticated')::text,true);
perform public.smart_start_window(sid,30,20,false,null,null,150);tok:=public.smart_rotate_qr(sid);
perform set_config('request.jwt.claim.sub',ids[1]::text,true);perform set_config('request.jwt.claims',json_build_object('sub',ids[1],'role','authenticated')::text,true);
r:=public.smart_prepare_qr_checkin(sid,tok);if r->>'ok'<>'true' then raise exception 'first prepare failed %',r;end if;
r:=public.smart_finish_qr_checkin(sid,r->>'claim',null,null,null);if r->>'ok'<>'true' then raise exception 'first checkin failed %',r;end if;
update public.smart_attendance_windows set closes_at=now()-interval '1 second' where session_id=sid;
perform public.finalize_smart_attendance(sid);
if not exists(select 1 from public.attendance_records where session_id=sid and student_id=ids[2] and status='absent' and automatic_absence) then raise exception 'absence not marked automatic';end if;
update public.attendance_records set status='absent' where session_id=sid and student_id=ids[3];
if exists(select 1 from public.attendance_records where session_id=sid and student_id=ids[3] and automatic_absence) then raise exception 'manual update not protected';end if;
insert into public.attendance_leave_requests(session_id,student_id,leave_type,reason,status) values(sid,ids[4],'other','temporary test','pending');
perform set_config('request.jwt.claim.sub',t::text,true);perform set_config('request.jwt.claims',json_build_object('sub',t,'role','authenticated')::text,true);
perform public.smart_start_window(sid,30,20,false,null,null,150);tok:=public.smart_rotate_qr(sid);
perform set_config('request.jwt.claim.sub',ids[2]::text,true);perform set_config('request.jwt.claims',json_build_object('sub',ids[2],'role','authenticated')::text,true);
r:=public.smart_prepare_qr_checkin(sid,'invalid-token');if r->>'code'<>'invalid_qr' then raise exception 'invalid QR accepted %',r;end if;
if not exists(select 1 from public.attendance_records where session_id=sid and student_id=ids[2] and status='absent' and automatic_absence) then raise exception 'invalid QR erased prior status';end if;
r:=public.smart_prepare_qr_checkin(sid,tok);if r->>'ok'<>'true' then raise exception 'second prepare failed %',r;end if;
r:=public.smart_finish_qr_checkin(sid,r->>'claim',null,null,null);if r->>'code'<>'accepted_present' then raise exception 'second checkin failed %',r;end if;
perform set_config('request.jwt.claim.sub',ids[1]::text,true);perform set_config('request.jwt.claims',json_build_object('sub',ids[1],'role','authenticated')::text,true);
r:=public.smart_prepare_qr_checkin(sid,tok);if r->>'code'<>'already_recorded' then raise exception 'first result not preserved %',r;end if;
begin
  perform public.smart_start_window(sid,30,20,false,null,null,150);
  raise exception 'unauthorized start was accepted';
exception when raise_exception then
  if sqlerrm<>'Not authorized' then raise;end if;
end;
perform set_config('request.jwt.claim.sub',ids[3]::text,true);perform set_config('request.jwt.claims',json_build_object('sub',ids[3],'role','authenticated')::text,true);
r:=public.smart_prepare_qr_checkin(sid,tok);if r->>'code'<>'already_recorded' then raise exception 'manual absence not protected %',r;end if;
perform set_config('request.jwt.claim.sub',ids[4]::text,true);perform set_config('request.jwt.claims',json_build_object('sub',ids[4],'role','authenticated')::text,true);
r:=public.smart_prepare_qr_checkin(sid,tok);if r->>'code'<>'already_recorded' then raise exception 'pending leave not protected %',r;end if;
update public.smart_attendance_windows set closes_at=now()-interval '1 second' where session_id=sid;
perform public.finalize_smart_attendance(sid);
perform set_config('request.jwt.claim.sub',t::text,true);perform set_config('request.jwt.claims',json_build_object('sub',t,'role','authenticated')::text,true);
perform public.smart_start_window(sid,30,20,true,13.7,100.5,150);tok:=public.smart_rotate_qr(sid);
perform set_config('request.jwt.claim.sub',ids[5]::text,true);perform set_config('request.jwt.claims',json_build_object('sub',ids[5],'role','authenticated')::text,true);
r:=public.smart_prepare_qr_checkin(sid,tok);if r->>'ok'<>'true' then raise exception 'GPS prepare failed %',r;end if;claim:=r->>'claim';
r:=public.smart_finish_qr_checkin(sid,claim,null,null,null);if r->>'code'<>'location_unavailable' then raise exception 'GPS requirement bypassed %',r;end if;
if not exists(select 1 from public.attendance_records where session_id=sid and student_id=ids[5] and status='absent' and automatic_absence) then raise exception 'GPS failure erased prior status';end if;
r:=public.smart_finish_qr_checkin(sid,claim,13.7,100.5,5);if r->>'code'<>'accepted_present' then raise exception 'GPS retry failed %',r;end if;
end $test$;
rollback;
