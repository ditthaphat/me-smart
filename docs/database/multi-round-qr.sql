-- A teacher can open additional QR windows for the same class session.
-- Previously finalized automatic absences are provisional; teacher decisions
-- and leave requests remain protected. Existing attendance is retained.
begin;
set local lock_timeout = '5s';
alter table public.attendance_records add column automatic_absence boolean not null default false;

-- Historic rows are classified only when their timestamp exactly matches the
-- finalization transaction. The observed finalization timestamp of the earlier
-- Fluid Mechanics emergency reopening was cleared, so it is matched by course
-- and date instead of an environment-specific generated session ID.
update public.attendance_records r set automatic_absence=true
from public.smart_attendance_windows w
join public.attendance_sessions s on s.id=w.session_id
join public.courses course on course.id=s.course_id
where w.session_id=r.session_id and r.status='absent'
  and r.note='Automatic absence after QR window expired'
  and (r.updated_at=w.finalized_at or
       (course.code='4112203' and s.session_date='2026-11-24'
        and r.updated_at='2026-11-24 06:36:00.032702+00'::timestamptz));

create function private.clear_automatic_absence_on_update() returns trigger
language plpgsql set search_path='' as $$
begin
  -- Any subsequent update, including saving the same status, is a decision.
  new.automatic_absence:=false;
  return new;
end;
$$;
revoke all on function private.clear_automatic_absence_on_update() from public,anon,authenticated;
create trigger attendance_clear_automatic_absence before update on public.attendance_records
for each row execute function private.clear_automatic_absence_on_update();

do $migration$
declare
  src text; old text;
  eligible text := 'automatic_absence AND status=''absent'' AND note=''Automatic absence after QR window expired'' AND NOT EXISTS (SELECT 1 FROM public.attendance_leave_requests lr WHERE lr.session_id=p_session_id AND lr.student_id=auth.uid() AND lr.status IN (''pending'',''approved''))';
begin
  -- The original finalizer creates the provisional marker atomically with the
  -- automatic absence. Manual inserts retain the column's false default.
  select pg_get_functiondef('public.finalize_smart_attendance(bigint)'::regprocedure) into src;
  old:='INSERT INTO public.attendance_records (';
  if position(old in src)=0 then raise exception 'Unexpected finalizer version'; end if;
  src:=replace(src,old,'INSERT INTO public.attendance_records (automatic_absence,');
  old:='        p_session_id,';
  if position(old in src)=0 then raise exception 'Unexpected finalizer SELECT'; end if;
  src:=replace(src,old,'        true, p_session_id,');
  execute src;

  -- Keep the teacher, cancelled-class and parameter checks in the existing
  -- function; only allow another window after finalization and reset its flag.
  select pg_get_functiondef('public.smart_start_window(bigint,integer,integer,boolean,double precision,double precision,integer)'::regprocedure) into src;
  old:='IF v_finalized_at IS NOT NULL THEN';
  if position(old in src)=0 then raise exception 'Unexpected start-window version'; end if;
  src:=regexp_replace(src,'IF v_finalized_at IS NOT NULL THEN[[:space:]]+RAISE EXCEPTION[[:space:]]+''Attendance already finalized; contact teacher'';[[:space:]]+END IF;','', '');
  if position(old in src)>0 then raise exception 'Finalization guard was not removed'; end if;
  old:='stopped_early_at = NULL,';
  if position(old in src)=0 then raise exception 'Unexpected window upsert'; end if;
  src:=replace(src,old,'stopped_early_at = NULL, finalized_at = NULL,');execute src;

  -- Update both QR preparation and completion. A QR may replace only an
  -- automatic absence, after successful authorization and GPS validation.
  select pg_get_functiondef('me_smart_private.smart_prepare_qr_checkin(bigint,text)'::regprocedure) into src;
  old:='p_session_id=30 AND status=''absent'' AND note=''Automatic absence after QR window expired''';
  if position(old in src)>0 then
    src:=replace(src,old,eligible);
  else
    old:='IF EXISTS (SELECT 1 FROM public.attendance_records WHERE session_id=p_session_id AND student_id=v_user) THEN';
    if position(old in src)=0 then raise exception 'Unexpected prepare version'; end if;
    src:=replace(src,old,'IF EXISTS (SELECT 1 FROM public.attendance_records WHERE session_id=p_session_id AND student_id=v_user AND NOT ('||eligible||')) THEN');
  end if;
  execute src;

  select pg_get_functiondef('public.smart_checkin_v7(bigint,text,double precision,double precision,double precision)'::regprocedure) into src;
  old:='p_session_id=30 AND status=''absent'' AND note=''Automatic absence after QR window expired''';
  if position(old in src)>0 then
    src:=replace(src,old,eligible);
  else
    old:='ELSIF EXISTS(SELECT 1 FROM public.attendance_records WHERE session_id=p_session_id AND student_id=auth.uid()) THEN code=''already_recorded'';';
    if position(old in src)=0 then raise exception 'Unexpected checkin version'; end if;
    src:=replace(src,old,'ELSIF EXISTS(SELECT 1 FROM public.attendance_records WHERE session_id=p_session_id AND student_id=auth.uid() AND NOT ('||eligible||')) THEN code=''already_recorded'';');
    old:='result=public.smart_checkin(p_session_id,p_token,p_lat,p_lng,p_accuracy);';
    if position(old in src)=0 then raise exception 'Unexpected underlying checkin'; end if;
    src:=replace(src,old,'DELETE FROM public.attendance_records WHERE session_id=p_session_id AND student_id=auth.uid() AND '||eligible||'; '||old);
  end if;
  execute src;
end $migration$;
notify pgrst, 'reload schema';
commit;
