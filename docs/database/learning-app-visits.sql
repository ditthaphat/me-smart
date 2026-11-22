-- Learning Applications visit analytics. Count one launch per explicit app open (not every slider change).
create table if not exists public.learning_app_visits (
 id bigint generated always as identity primary key,
 app_id text not null check (app_id in ('pressure-manometry','couette-poiseuille')),
 user_id uuid not null references auth.users(id) on delete cascade,
 visited_at timestamptz not null default now()
);
create index if not exists learning_app_visits_app_time_idx on public.learning_app_visits(app_id,visited_at desc);
create index if not exists learning_app_visits_user_time_idx on public.learning_app_visits(user_id,visited_at desc);
alter table public.learning_app_visits enable row level security;
revoke all on public.learning_app_visits from anon, authenticated;
-- Expose only aggregated statistics, not individual students' activity.
create or replace function public.record_learning_app_visit(p_app_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_app_id not in ('pressure-manometry','couette-poiseuille') then raise exception 'Unknown app'; end if;
 if not exists(select 1 from public.profiles p where p.id=v_user and p.role='teacher')
 and not exists(select 1 from public.enrollments e join public.courses c on c.id=e.course_id
   where e.student_id=v_user and e.status='approved' and c.code='4112203')
 then raise exception 'Course access denied'; end if;
 insert into public.learning_app_visits(app_id,user_id) values(p_app_id,v_user);
end $$;
create or replace function public.learning_app_visit_stats()
returns table(app_id text,visit_count bigint,unique_users bigint)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.profiles p where p.id=v_user and p.role='teacher')
 and not exists(select 1 from public.enrollments e join public.courses c on c.id=e.course_id
   where e.student_id=v_user and e.status='approved' and c.code='4112203')
 then raise exception 'Course access denied'; end if;
 return query select v.app_id,count(*)::bigint,count(distinct v.user_id)::bigint
 from public.learning_app_visits v group by v.app_id;
end $$;
revoke all on function public.record_learning_app_visit(text) from public, anon;
revoke all on function public.learning_app_visit_stats() from public, anon;
grant execute on function public.record_learning_app_visit(text) to authenticated;
grant execute on function public.learning_app_visit_stats() to authenticated;
