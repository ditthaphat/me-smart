-- Student-facing document links and request-to-open statistics.
-- Existing teaching_materials, notes and chapter plans remain teacher-private.
begin;

create table public.material_publications (
  id bigint generated always as identity primary key,
  material_id bigint not null unique references public.teaching_materials(id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  course_id bigint not null references public.courses(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  material_type text not null check (material_type in ('textbook','lesson','slides','exercise','teaching_plan','other')),
  version_label text not null default '' check (length(version_label) <= 80),
  external_url text not null check (length(external_url) between 1 and 2048 and external_url ~* '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'),
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.material_open_events (
  id bigint generated always as identity primary key,
  publication_id bigint not null references public.material_publications(id) on delete cascade,
  course_id bigint not null references public.courses(id) on delete cascade,
  student_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  opened_at timestamptz not null default now()
);

create index material_publications_course_visible_idx on public.material_publications(course_id,created_at desc,id desc) where is_published;
create index material_publications_owner_idx on public.material_publications(owner_id,material_id);
create index material_open_events_publication_student_idx on public.material_open_events(publication_id,course_id,student_id,opened_at desc);

alter table public.material_publications enable row level security;
alter table public.material_open_events enable row level security;
revoke all on public.material_publications, public.material_open_events from public, anon, authenticated;
grant select,insert,update,delete on public.material_publications to authenticated;
grant select on public.material_open_events to authenticated;
grant insert (publication_id) on public.material_open_events to authenticated;
revoke all on sequence public.material_publications_id_seq,public.material_open_events_id_seq from public,anon,authenticated;
grant usage,select on sequence public.material_publications_id_seq,public.material_open_events_id_seq to authenticated;

create policy material_publications_teacher on public.material_publications
  for all to authenticated
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

create policy material_publications_student_read on public.material_publications
  for select to authenticated
  using (is_published and exists (
    select 1 from public.enrollments e
    where e.course_id=material_publications.course_id and e.student_id=(select auth.uid()) and e.status='approved'
  ));

create policy material_open_events_teacher_read on public.material_open_events
  for select to authenticated
  using (exists (
    select 1 from public.material_publications m
    where m.id=material_open_events.publication_id and m.owner_id=(select auth.uid())
  ));

create policy material_open_events_student_insert on public.material_open_events
  for insert to authenticated
  with check (student_id=(select auth.uid()) and exists (
    select 1 from public.material_publications m
    join public.enrollments e on e.course_id=m.course_id
    where m.id=material_open_events.publication_id and m.is_published
      and material_open_events.course_id=m.course_id
      and e.student_id=(select auth.uid()) and e.status='approved'
  ));

-- Store the course at the time of the click. If an existing document is later
-- republished in another course, its old clicks cannot count in the new course.
create function private.material_open_set_course() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  select m.course_id into new.course_id from public.material_publications m
  where m.id=new.publication_id and m.is_published;
  return new;
end;
$$;
revoke all on function private.material_open_set_course() from public,anon,authenticated;
create trigger material_open_record_course before insert on public.material_open_events
  for each row execute function private.material_open_set_course();

-- A previously shared snapshot must never remain visible after its source
-- changes, moves course, or is archived. The owner chooses to republish it.
create function private.material_source_changed() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (old.course_id,old.title,old.material_type,old.material_status,old.version_label,old.external_url,old.is_archived)
     is distinct from
     (new.course_id,new.title,new.material_type,new.material_status,new.version_label,new.external_url,new.is_archived) then
    update public.material_publications set is_published=false
    where material_id=new.id and owner_id=new.owner_id and is_published;
  end if;
  return new;
end;
$$;
revoke all on function private.material_source_changed() from public,anon,authenticated;
create trigger unpublish_changed_teaching_material
  after update on public.teaching_materials
  for each row execute function private.material_source_changed();

-- Runs with the caller's RLS privileges: only the owning teacher's current
-- approved roster is returned, including students who have not clicked.
create function public.teacher_material_open_stats(p_publication_id bigint)
returns table(student_id uuid,full_name text,student_number text,open_count bigint,last_open timestamptz)
language sql stable security invoker set search_path = '' as $$
  select e.student_id,p.full_name,p.student_id,count(o.id),max(o.opened_at)
  from public.material_publications m
  join public.enrollments e on e.course_id=m.course_id and e.status='approved'
  left join public.profiles p on p.id=e.student_id
  left join public.material_open_events o on o.publication_id=m.id and o.course_id=e.course_id and o.student_id=e.student_id
  where m.id=p_publication_id and m.owner_id=(select auth.uid())
  group by e.student_id,p.full_name,p.student_id
  order by p.full_name,e.student_id;
$$;
revoke all on function public.teacher_material_open_stats(bigint) from public,anon,authenticated;
grant execute on function public.teacher_material_open_stats(bigint) to authenticated;

commit;
