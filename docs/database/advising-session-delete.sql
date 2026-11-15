-- Allow the authenticated owner, subject to the existing teacher/owner RLS
-- policy, to delete one advising session. Its participant rows cascade with
-- the session; the group, student roster, courses, attendance and grades stay.
grant delete on public.advising_sessions to authenticated;

create or replace function public.preview_advising_session_deletion(p_session_id bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.advising_sessions%rowtype;
  v_participants jsonb;
  v_count integer;
  v_recorded integer;
  v_fingerprint text;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher') then
    raise exception 'เฉพาะอาจารย์เจ้าของข้อมูลเท่านั้นที่สามารถลบได้';
  end if;
  select * into v_session from public.advising_sessions s
    where s.id=p_session_id and s.owner_id=auth.uid();
  if not found then raise exception 'ไม่พบบันทึกการปรึกษาหรือไม่มีสิทธิ์เข้าถึง'; end if;

  select count(*)::integer,
    count(*) filter(where p.attendance_status <> 'not_recorded')::integer,
    coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(p.student_id,p.student_number_snapshot,p.full_name_snapshot,p.attendance_status)
      order by p.student_id),'[]'::jsonb)
    into v_count,v_recorded,v_participants
  from public.advising_participants p
  where p.session_id=v_session.id and p.group_id=v_session.group_id and p.owner_id=v_session.owner_id;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_array(pg_catalog.to_jsonb(v_session),v_participants)::text);

  return pg_catalog.jsonb_build_object('session_id',v_session.id,'group_id',v_session.group_id,
    'meeting_date',v_session.meeting_date,'start_time',v_session.start_time,'end_time',v_session.end_time,
    'location',v_session.location,'is_archived',v_session.is_archived,
    'participant_count',v_count,'recorded_count',v_recorded,'fingerprint',v_fingerprint);
end $$;

create or replace function public.delete_advising_session(
  p_session_id bigint, p_expected_group_id bigint, p_expected_fingerprint text, p_confirmation text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.advising_sessions%rowtype;
  v_participants jsonb;
  v_count integer;
  v_recorded integer;
  v_fingerprint text;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher') then
    raise exception 'เฉพาะอาจารย์เจ้าของข้อมูลเท่านั้นที่สามารถลบได้';
  end if;
  select * into v_session from public.advising_sessions s
    where s.id=p_session_id and s.owner_id=auth.uid() for update;
  if not found then raise exception 'ไม่พบบันทึกการปรึกษาหรือไม่มีสิทธิ์เข้าถึง'; end if;
  if v_session.group_id is distinct from p_expected_group_id then
    raise exception 'กลุ่มของบันทึกเปลี่ยนไป กรุณาตรวจสอบใหม่ก่อนลบ';
  end if;
  if p_confirmation is null or pg_catalog.btrim(p_confirmation) <> 'ลบ' then
    raise exception 'กรุณาพิมพ์คำยืนยันให้ถูกต้อง';
  end if;

  -- Lock the selected session and its participants before checking for changes.
  perform 1 from public.advising_participants p
    where p.session_id=v_session.id and p.group_id=v_session.group_id and p.owner_id=v_session.owner_id for update;
  select count(*)::integer,
    count(*) filter(where p.attendance_status <> 'not_recorded')::integer,
    coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(p.student_id,p.student_number_snapshot,p.full_name_snapshot,p.attendance_status)
      order by p.student_id),'[]'::jsonb)
    into v_count,v_recorded,v_participants
  from public.advising_participants p
  where p.session_id=v_session.id and p.group_id=v_session.group_id and p.owner_id=v_session.owner_id;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_array(pg_catalog.to_jsonb(v_session),v_participants)::text);
  if v_fingerprint is distinct from p_expected_fingerprint then
    raise exception 'บันทึกหรือรายชื่อผู้เข้าร่วมเปลี่ยนไป กรุณาตรวจสอบใหม่ก่อนลบ';
  end if;

  delete from public.advising_sessions s where s.id=v_session.id and s.owner_id=auth.uid();
  if not found then raise exception 'ไม่สามารถลบบันทึกการปรึกษาได้'; end if;
  return pg_catalog.jsonb_build_object('session_id',v_session.id,'deleted_participants',v_count,'deleted_recorded',v_recorded);
end $$;

revoke all on function public.preview_advising_session_deletion(bigint) from public,anon,authenticated;
revoke all on function public.delete_advising_session(bigint,bigint,text,text) from public,anon,authenticated;
grant execute on function public.preview_advising_session_deletion(bigint) to authenticated;
grant execute on function public.delete_advising_session(bigint,bigint,text,text) to authenticated;
