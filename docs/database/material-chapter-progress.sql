-- Chapter and topic plans belong to a teacher's existing material entry.
-- Removing an entry cascades only its own chapter/topic planning records.
begin;

create unique index teaching_materials_id_owner_unique on public.teaching_materials(id,owner_id);

create table public.material_chapters (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid(),
  material_id bigint not null,
  chapter_number integer not null check (chapter_number between 0 and 999),
  title text not null check (length(btrim(title)) between 1 and 200),
  due_date date,
  created_at timestamptz not null default now(),
  unique (material_id,chapter_number),
  unique (id,material_id,owner_id),
  foreign key (material_id,owner_id) references public.teaching_materials(id,owner_id) on delete cascade
);

create table public.material_topics (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid(),
  material_id bigint not null,
  chapter_id bigint not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  topic_status text not null default 'todo' check (topic_status in ('todo','writing','review','done')),
  created_at timestamptz not null default now(),
  foreign key (chapter_id,material_id,owner_id)
    references public.material_chapters(id,material_id,owner_id) on delete cascade
);

create index material_chapters_owner_material_idx on public.material_chapters(owner_id,material_id,chapter_number);
create index material_topics_owner_material_idx on public.material_topics(owner_id,material_id,id);
create index material_topics_chapter_idx on public.material_topics(chapter_id);

alter table public.material_chapters enable row level security;
alter table public.material_topics enable row level security;
revoke all on public.material_chapters,public.material_topics from public,anon,authenticated;
grant select,insert,update,delete on public.material_chapters,public.material_topics to authenticated;
revoke all on sequence public.material_chapters_id_seq,public.material_topics_id_seq from public,anon,authenticated;
grant usage,select on sequence public.material_chapters_id_seq,public.material_topics_id_seq to authenticated;

create policy material_chapters_teacher_owner on public.material_chapters for all to authenticated
  using (owner_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher'))
  with check (owner_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher'));

create policy material_topics_teacher_owner on public.material_topics for all to authenticated
  using (owner_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher'))
  with check (owner_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher'));

commit;
