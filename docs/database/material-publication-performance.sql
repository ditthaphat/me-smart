-- Keep the publication access rules unchanged while avoiding duplicate
-- permissive SELECT checks and indexing referencing event columns.
begin;
create index material_open_events_course_idx on public.material_open_events(course_id);
create index material_open_events_student_idx on public.material_open_events(student_id);

drop policy material_publications_teacher on public.material_publications;
drop policy material_publications_student_read on public.material_publications;

create policy material_publications_read on public.material_publications
  for select to authenticated
  using (
    (owner_id=(select auth.uid()) and exists (
      select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher'
    ))
    or (is_published and exists (
      select 1 from public.enrollments e
      where e.course_id=material_publications.course_id and e.student_id=(select auth.uid()) and e.status='approved'
    ))
  );

create policy material_publications_teacher_insert on public.material_publications
  for insert to authenticated
  with check (
    owner_id=(select auth.uid())
    and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher')
    and exists (select 1 from public.courses c where c.id=material_publications.course_id and c.teacher_id=(select auth.uid()))
    and exists (
      select 1 from public.teaching_materials m
      where m.id=material_publications.material_id and m.owner_id=(select auth.uid())
        and (not material_publications.is_published or (
          not m.is_archived and m.course_id=material_publications.course_id
          and m.title=material_publications.title and m.material_type=material_publications.material_type
          and m.version_label=material_publications.version_label and m.external_url=material_publications.external_url
        ))
    )
  );

create policy material_publications_teacher_update on public.material_publications
  for update to authenticated
  using (owner_id=(select auth.uid()) and exists (
    select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher'
  ))
  with check (
    owner_id=(select auth.uid())
    and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher')
    and exists (select 1 from public.courses c where c.id=material_publications.course_id and c.teacher_id=(select auth.uid()))
    and exists (
      select 1 from public.teaching_materials m
      where m.id=material_publications.material_id and m.owner_id=(select auth.uid())
        and (not material_publications.is_published or (
          not m.is_archived and m.course_id=material_publications.course_id
          and m.title=material_publications.title and m.material_type=material_publications.material_type
          and m.version_label=material_publications.version_label and m.external_url=material_publications.external_url
        ))
    )
  );

create policy material_publications_teacher_delete on public.material_publications
  for delete to authenticated
  using (owner_id=(select auth.uid()) and exists (
    select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher'
  ));
commit;
