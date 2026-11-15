const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('publication, student access, open logs and statistics respect course and teacher boundaries', async () => {
  const db = new PGlite();
  const teacher='10000000-0000-4000-8000-000000000001';
  const otherTeacher='10000000-0000-4000-8000-000000000002';
  const approved='10000000-0000-4000-8000-000000000003';
  const otherApproved='10000000-0000-4000-8000-000000000004';
  const pending='10000000-0000-4000-8000-000000000005';
  const rejected='10000000-0000-4000-8000-000000000006';
  const notEnrolled='10000000-0000-4000-8000-000000000007';
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema private;
      grant usage on schema auth,private to anon,authenticated;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.profiles(id uuid primary key,role text not null,full_name text not null,student_id text);
      create table public.courses(id bigint primary key,teacher_id uuid not null references public.profiles(id),code text);
      create table public.enrollments(course_id bigint references public.courses(id),student_id uuid references public.profiles(id),status text,primary key(course_id,student_id));
      create table public.advising_sessions(id bigint primary key,notes text);
      insert into public.profiles values
        ('${teacher}','teacher','Teacher',null),('${otherTeacher}','teacher','Other teacher',null),
        ('${approved}','student','Student A','A'),('${otherApproved}','student','Student B','B'),
        ('${pending}','student','Student C','C'),('${rejected}','student','Student D','D'),('${notEnrolled}','student','Student E','E');
      insert into public.courses values(5,'${teacher}','4112203'),(6,'${otherTeacher}','4111307'),(7,'${teacher}','4112311');
      insert into public.enrollments values
        (5,'${approved}','approved'),(5,'${otherApproved}','approved'),
        (5,'${pending}','pending'),(5,'${rejected}','rejected'),(6,'${notEnrolled}','approved'),(7,'${approved}','approved');
      insert into public.advising_sessions values(1,'private advising example');
      grant select on public.profiles,public.courses,public.enrollments to authenticated;
      alter table public.courses enable row level security;
      create policy courses_teacher_read on public.courses for select to authenticated using(teacher_id=auth.uid());
      alter table public.enrollments enable row level security;
      create policy enrollment_read on public.enrollments for select to authenticated using(
        student_id=auth.uid() or exists(select 1 from public.courses c where c.id=course_id and c.teacher_id=auth.uid())
      );
    `);
    await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/teaching-materials.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/material-publication.sql'),'utf8'));
    async function asUser(id) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); }
    await asUser(teacher);
    const material=(await db.query("insert into public.teaching_materials(course_id,title,material_type,external_url,notes) values(5,'บทที่ 1','lesson','https://example.com/chapter1','private teacher note') returning id")).rows[0];
    const pub=(await db.query("insert into public.material_publications(material_id,course_id,title,material_type,external_url,is_published) values($1,5,'บทที่ 1','lesson','https://example.com/chapter1',true) returning id",[material.id])).rows[0];
    await assert.rejects(db.query("update public.material_publications set external_url='https://example.com/other' where id=$1",[pub.id]),/row-level security/);
    await asUser(approved);
    assert.equal((await db.query('select count(*)::int n from public.teaching_materials')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from public.material_publications')).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from public.material_open_events')).rows[0].n,0);
    await db.query('insert into public.material_open_events(publication_id) values($1)',[pub.id]);
    await db.query('insert into public.material_open_events(publication_id) values($1)',[pub.id]);
    await assert.rejects(db.query("insert into public.material_open_events(publication_id,student_id) values($1,$2)",[pub.id,otherApproved]),/permission denied/);
    await assert.rejects(db.query("insert into public.material_open_events(publication_id,opened_at) values($1,'2020-01-01')",[pub.id]),/permission denied/);
    assert.equal((await db.query('select * from public.teacher_material_open_stats($1)',[pub.id])).rows.length,0);
    for (const user of [pending,rejected,notEnrolled]) {
      await asUser(user);
      assert.equal((await db.query('select count(*)::int n from public.material_publications')).rows[0].n,0);
      await assert.rejects(db.query('insert into public.material_open_events(publication_id) values($1)',[pub.id]),/row-level security/);
    }
    await asUser(otherTeacher);
    assert.equal((await db.query('select count(*)::int n from public.material_publications')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from public.material_open_events')).rows[0].n,0);
    assert.equal((await db.query('select * from public.teacher_material_open_stats($1)',[pub.id])).rows.length,0);
    await asUser(teacher);
    const stats=(await db.query('select * from public.teacher_material_open_stats($1)',[pub.id])).rows;
    assert.equal(stats.length,2);
    assert.equal(Number(stats.find(r=>r.student_id===approved).open_count),2);
    assert.equal(Number(stats.find(r=>r.student_id===otherApproved).open_count),0);
    assert.ok(stats.find(r=>r.student_id===approved).last_open);
    await db.query("update public.teaching_materials set notes='private edited note' where id=$1",[material.id]);
    assert.equal((await db.query('select is_published from public.material_publications where id=$1',[pub.id])).rows[0].is_published,true);
    await db.query("update public.teaching_materials set title='บทที่ 1 แก้ไข' where id=$1",[material.id]);
    assert.equal((await db.query('select is_published from public.material_publications where id=$1',[pub.id])).rows[0].is_published,false);
    await asUser(approved);
    assert.equal((await db.query('select count(*)::int n from public.material_publications')).rows[0].n,0);
    await assert.rejects(db.query('insert into public.material_open_events(publication_id) values($1)',[pub.id]),/row-level security/);
    await asUser(teacher);
    await assert.rejects(db.query('update public.material_publications set is_published=true where id=$1',[pub.id]),/row-level security/);
    await db.query("update public.material_publications set title='บทที่ 1 แก้ไข',is_published=true where id=$1",[pub.id]);
    await db.query('update public.teaching_materials set course_id=7 where id=$1',[material.id]);
    assert.equal((await db.query('select is_published from public.material_publications where id=$1',[pub.id])).rows[0].is_published,false);
    await db.query('update public.material_publications set course_id=7,is_published=true where id=$1',[pub.id]);
    assert.equal(Number((await db.query('select open_count from public.teacher_material_open_stats($1)',[pub.id])).rows[0].open_count),0);
    await asUser(approved);
    await db.query('insert into public.material_open_events(publication_id) values($1)',[pub.id]);
    await asUser(teacher);
    assert.equal(Number((await db.query('select open_count from public.teacher_material_open_stats($1)',[pub.id])).rows[0].open_count),1);
    await db.query('update public.teaching_materials set course_id=5 where id=$1',[material.id]);
    await db.query('update public.material_publications set course_id=5,is_published=true where id=$1',[pub.id]);
    assert.equal(Number((await db.query('select open_count from public.teacher_material_open_stats($1) where student_id=$2',[pub.id,approved])).rows[0].open_count),2);
    await db.query('update public.teaching_materials set is_archived=true where id=$1',[material.id]);
    assert.equal((await db.query('select is_published from public.material_publications where id=$1',[pub.id])).rows[0].is_published,false);
    await db.query('delete from public.teaching_materials where id=$1',[material.id]);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from public.material_open_events')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from public.advising_sessions')).rows[0].n,1);
    assert.equal((await db.query("select has_table_privilege('anon','public.material_publications','select') allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});
