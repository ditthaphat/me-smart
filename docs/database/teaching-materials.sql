-- Teaching material metadata is private to its teacher. Files remain at the
-- external HTTPS link and are not uploaded to or shared by ME-Smart.
begin;

create table public.teaching_materials (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  course_id bigint references public.courses(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 200),
  material_type text not null check (material_type in ('textbook','lesson','slides','exercise','teaching_plan','other')),
  material_status text not null default 'draft' check (material_status in ('draft','review','ready')),
  version_label text not null default '' check (length(version_label) <= 80),
  external_url text not null default '' check (
    external_url = '' or (length(external_url) <= 2048 and external_url ~* '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')
  ),
  notes text not null default '' check (length(notes) <= 2000),
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index teaching_materials_owner_archive_created_idx
  on public.teaching_materials(owner_id,is_archived,created_at desc,id desc);
create index teaching_materials_course_idx on public.teaching_materials(course_id);

alter table public.teaching_materials enable row level security;
revoke all on public.teaching_materials from public, anon, authenticated;
grant select, insert, update, delete on public.teaching_materials to authenticated;
revoke all on sequence public.teaching_materials_id_seq from public, anon, authenticated;
grant usage, select on sequence public.teaching_materials_id_seq to authenticated;

create policy teaching_materials_teacher_owner on public.teaching_materials
  for all to authenticated
  using (
    owner_id = (select auth.uid()) and
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher')
  )
  with check (
    owner_id = (select auth.uid()) and
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher') and
    (course_id is null or exists (
      select 1 from public.courses c
      where c.id = teaching_materials.course_id and c.teacher_id = (select auth.uid())
    ))
  );

commit;
