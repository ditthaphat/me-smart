-- Delete one selected advising roster entry, after reviewing linked meeting records.
-- Course enrollments, attendance, grades and student accounts are not touched.

create or replace function public.preview_advising_student_deletion(p_student_id bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_student public.advising_students%rowtype;
  v_count integer;
  v_recorded integer;
  v_fingerprint text;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบก่อน'; end if;
  select * into v_student from public.advising_students s
    where s.id=p_student_id and s.owner_id=auth.uid();
  if not found then raise exception 'ไม่พบรายชื่อนักศึกษาหรือไม่มีสิทธิ์เข้าถึง'; end if;

  select count(*)::integer,
    count(*) filter(where p.attendance_status <> 'not_recorded')::integer,
    pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(p.session_id,p.attendance_status,p.student_number_snapshot,p.full_name_snapshot)
      order by p.session_id)::text,'[]'))
    into v_count,v_recorded,v_fingerprint
  from public.advising_participants p
  where p.student_id=v_student.id and p.group_id=v_student.group_id and p.owner_id=v_student.owner_id;

  return pg_catalog.jsonb_build_object('student_id',v_student.id,'group_id',v_student.group_id,
    'student_number',v_student.student_number,'full_name',v_student.full_name,
    'participant_count',v_count,'recorded_count',v_recorded,'fingerprint',v_fingerprint);
end $$;

create or replace function public.delete_advising_student(
  p_student_id bigint, p_expected_group_id bigint, p_expected_student_number text,
  p_expected_full_name text, p_expected_fingerprint text, p_confirmation text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_student public.advising_students%rowtype;
  v_count integer;
  v_recorded integer;
  v_fingerprint text;
begin
  if v_user is null or not exists(select 1 from public.profiles p where p.id=v_user and p.role='teacher') then
    raise exception 'เฉพาะอาจารย์เจ้าของข้อมูลเท่านั้นที่สามารถลบได้';
  end if;
  select * into v_student from public.advising_students s
    where s.id=p_student_id and s.owner_id=v_user for update;
  if not found then raise exception 'ไม่พบรายชื่อนักศึกษาหรือไม่มีสิทธิ์เข้าถึง'; end if;
  if v_student.group_id is distinct from p_expected_group_id
     or v_student.student_number is distinct from p_expected_student_number
     or v_student.full_name is distinct from p_expected_full_name then
    raise exception 'ข้อมูลรายชื่อเปลี่ยนไป กรุณาตรวจสอบใหม่ก่อนลบ';
  end if;
  if p_confirmation is null or pg_catalog.btrim(p_confirmation) <> v_student.student_number then
    raise exception 'รหัสนักศึกษาที่พิมพ์เพื่อยืนยันไม่ตรงกัน';
  end if;

  -- Lock the referenced rows, then reject stale previews before deleting anything.
  perform 1 from public.advising_participants p
    where p.student_id=v_student.id and p.group_id=v_student.group_id and p.owner_id=v_user for update;
  select count(*)::integer,
    count(*) filter(where p.attendance_status <> 'not_recorded')::integer,
    pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(p.session_id,p.attendance_status,p.student_number_snapshot,p.full_name_snapshot)
      order by p.session_id)::text,'[]'))
    into v_count,v_recorded,v_fingerprint
  from public.advising_participants p
  where p.student_id=v_student.id and p.group_id=v_student.group_id and p.owner_id=v_user;
  if v_fingerprint is distinct from p_expected_fingerprint then
    raise exception 'ประวัติการปรึกษาเปลี่ยนไป กรุณาตรวจสอบใหม่ก่อนลบ';
  end if;

  delete from public.advising_participants p
    where p.student_id=v_student.id and p.group_id=v_student.group_id and p.owner_id=v_user;
  delete from public.advising_students s where s.id=v_student.id and s.owner_id=v_user;
  return pg_catalog.jsonb_build_object('student_id',v_student.id,'deleted_participants',v_count,'deleted_recorded',v_recorded);
end $$;

revoke all on function public.preview_advising_student_deletion(bigint) from public,anon,authenticated;
revoke all on function public.delete_advising_student(bigint,bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.preview_advising_student_deletion(bigint) to authenticated;
grant execute on function public.delete_advising_student(bigint,bigint,text,text,text,text) to authenticated;
