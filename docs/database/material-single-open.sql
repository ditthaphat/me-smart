-- Limit opens through ME-Smart to one per student number and document version.
-- External links already disclosed to students remain subject to the provider's
-- sharing settings. This records an open request, not a successful download.
begin;

create table private.material_single_open_claims (
  publication_id bigint not null references public.material_publications(id) on delete cascade,
  course_id bigint not null references public.courses(id) on delete cascade,
  document_key text not null,
  student_key text not null,
  claimed_by uuid not null,
  claimed_at timestamptz not null default now(),
  primary key (publication_id, course_id, document_key, student_key),
  unique (publication_id, course_id, document_key, claimed_by)
);
alter table private.material_single_open_claims enable row level security;
revoke all on private.material_single_open_claims from public, anon, authenticated;

-- Hyphens, spacing and case do not create a separate allowance. The private
-- claims survive account recreation while the publication and course exist.
create function private.material_student_key(p_student_number text) returns text
language sql immutable set search_path = '' as $$
  select nullif(pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
    coalesce(p_student_number, ''), '[-[:space:]]', '', 'g'
  ))), pg_catalog.md5(''));
$$;

-- A changed link or explicit version represents a new document version.
create function private.material_document_key(p_url text, p_version text) returns text
language sql immutable set search_path = '' as $$
  select pg_catalog.md5(coalesce(p_url, '') || pg_catalog.chr(10) || coalesce(p_version, ''));
$$;

revoke all on function private.material_student_key(text) from public, anon, authenticated;
revoke all on function private.material_document_key(text, text) from public, anon, authenticated;

-- Existing requests count as having used the allowance, as directed by the
-- teacher. The original events and their historical counts are not changed.
-- Prevent an old client from inserting between the backfill and the trigger.
set local lock_timeout = '5s';
lock table public.material_open_events in share row exclusive mode;
insert into private.material_single_open_claims
  (publication_id,course_id,document_key,student_key,claimed_by,claimed_at)
select o.publication_id,o.course_id,
       private.material_document_key(m.external_url,m.version_label),
       private.material_student_key(p.student_id),p.id,min(o.opened_at)
from public.material_open_events o
join public.material_publications m on m.id=o.publication_id
join public.profiles p on p.id=o.student_id and p.role='student'
where private.material_student_key(p.student_id) is not null
group by o.publication_id,o.course_id,
         private.material_document_key(m.external_url,m.version_label),
         private.material_student_key(p.student_id),p.id
on conflict do nothing;

-- The primary key makes this an atomic claim even when two tabs click at once.
-- A rejected insert rolls its claim back together with the open-event insert.
create function private.claim_single_material_open() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_student_key text;
  v_document_key text;
  v_rows integer;
begin
  select private.material_student_key(p.student_id),
         private.material_document_key(m.external_url, m.version_label)
    into v_student_key, v_document_key
  from public.profiles p
  join public.enrollments e on e.student_id=p.id and e.status='approved'
  join public.material_publications m on m.id=new.publication_id
    and m.course_id=e.course_id and m.course_id=new.course_id and m.is_published
  where p.id=(select auth.uid()) and p.id=new.student_id and p.role='student';

  if not found then
    raise exception using errcode='42501', message='MATERIAL_OPEN_NOT_ALLOWED';
  end if;
  if v_student_key is null then
    raise exception using errcode='P0001', message='MATERIAL_STUDENT_ID_REQUIRED';
  end if;

  insert into private.material_single_open_claims
    (publication_id,course_id,document_key,student_key,claimed_by)
  values (new.publication_id,new.course_id,v_document_key,v_student_key,new.student_id)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows=0 then
    raise exception using errcode='P0001', message='MATERIAL_ALREADY_OPENED';
  end if;
  return new;
end;
$$;
revoke all on function private.claim_single_material_open() from public, anon, authenticated;

-- PostgreSQL runs BEFORE triggers in name order. The existing
-- material_open_record_course trigger supplies NEW.course_id first.
create trigger material_open_single_claim
  before insert on public.material_open_events
  for each row execute function private.claim_single_material_open();

-- Only status for the caller's approved, published documents is returned;
-- no other student's identity or open history is exposed.
create function public.student_material_open_status(p_publication_ids bigint[])
returns table(publication_id bigint, already_opened boolean, student_id_available boolean)
language sql stable security definer set search_path = '' as $$
  select m.id,
    exists (
      select 1 from private.material_single_open_claims c
      where c.publication_id=m.id and c.course_id=m.course_id
        and c.document_key=private.material_document_key(m.external_url,m.version_label)
        and (c.student_key=private.material_student_key(p.student_id) or c.claimed_by=p.id)
    ),
    private.material_student_key(p.student_id) is not null
  from public.material_publications m
  join public.enrollments e on e.course_id=m.course_id
    and e.student_id=(select auth.uid()) and e.status='approved'
  join public.profiles p on p.id=e.student_id and p.role='student'
  where m.is_published and m.id=any(p_publication_ids)
    and pg_catalog.cardinality(p_publication_ids) <= 100;
$$;
revoke all on function public.student_material_open_status(bigint[]) from public, anon, authenticated;
grant execute on function public.student_material_open_status(bigint[]) to authenticated;

notify pgrst, 'reload schema';
commit;
