const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('one open per student number and document version, including historical clicks', async () => {
  const db = new PGlite();
  const teacher='10000000-0000-4000-8000-000000000001';
  const oldStudent='10000000-0000-4000-8000-000000000002';
  const newStudent='10000000-0000-4000-8000-000000000003';
  const sameNumber='10000000-0000-4000-8000-000000000004';
  const pending='10000000-0000-4000-8000-000000000005';
  const missing='10000000-0000-4000-8000-000000000006';
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema private;
      grant usage on schema auth,private to anon,authenticated;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.profiles(id uuid primary key,role text not null,full_name text not null,student_id text unique);
      create table public.courses(id bigint primary key,teacher_id uuid not null references public.profiles(id),code text);
      create table public.enrollments(course_id bigint references public.courses(id),student_id uuid references public.profiles(id),status text,primary key(course_id,student_id));
      insert into public.profiles values
        ('${teacher}','teacher','Teacher',null),
        ('${oldStudent}','student','Student A','TEST-00002'),
        ('${newStudent}','student','Student B','TEST-00001'),
        ('${sameNumber}','student','Student B re-created','TEST00001'),
        ('${pending}','student','Pending','PENDING'),
        ('${missing}','student','Missing ID',null);
      insert into public.courses values (5,'${teacher}','4112203'),(7,'${teacher}','4112311');
      insert into public.enrollments values
        (5,'${oldStudent}','approved'),(5,'${newStudent}','approved'),
        (5,'${sameNumber}','approved'),(5,'${pending}','pending'),(5,'${missing}','approved');
      grant select on public.profiles,public.courses,public.enrollments to authenticated;
      alter table public.courses enable row level security;
      create policy courses_teacher_read on public.courses for select to authenticated using(teacher_id=auth.uid());
      alter table public.enrollments enable row level security;
      create policy enrollment_read on public.enrollments for select to authenticated using(
        student_id=auth.uid() or exists(select 1 from public.courses c where c.id=course_id and c.teacher_id=auth.uid())
      );
    `);
    for (const file of ['teaching-materials.sql','material-publication.sql','material-publication-performance.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database',file),'utf8'));
    }
    async function asUser(id) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
      await db.exec('set role authenticated');
    }
    await asUser(teacher);
    async function publish(title,url) {
      const material=(await db.query("insert into public.teaching_materials(course_id,title,material_type,external_url) values(5,$1,'lesson',$2) returning id",[title,url])).rows[0];
      const pub=(await db.query("insert into public.material_publications(material_id,course_id,title,material_type,external_url,is_published) values($1,5,$2,'lesson',$3,true) returning id",[material.id,title,url])).rows[0];
      return {material:material.id,pub:pub.id};
    }
    const first=await publish('Document 1','https://example.com/first');
    const second=await publish('Document 2','https://example.com/second');
    await asUser(oldStudent);
    await db.query('insert into public.material_open_events(publication_id) values($1)',[first.pub]);
    await db.query('insert into public.material_open_events(publication_id) values($1)',[first.pub]);

    await db.exec('reset role');
    await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/material-single-open.sql'),'utf8'));
    await asUser(oldStudent);
    let status=(await db.query('select * from public.student_material_open_status(array[$1,$2]::bigint[]) order by publication_id',[first.pub,second.pub])).rows;
    assert.deepEqual(status.map(row=>row.already_opened),[true,false]);
    await assert.rejects(db.query('insert into public.material_open_events(publication_id) values($1)',[first.pub]),/MATERIAL_ALREADY_OPENED/);
    await assert.rejects(db.query('select * from private.material_single_open_claims'),/permission denied/);

    await asUser(newStudent);
    status=(await db.query('select * from public.student_material_open_status(array[$1]::bigint[])',[first.pub])).rows;
    assert.equal(status[0].already_opened,false);
    const concurrent=await Promise.allSettled([
      db.query('insert into public.material_open_events(publication_id) values($1)',[first.pub]),
      db.query('insert into public.material_open_events(publication_id) values($1)',[first.pub]),
    ]);
    assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(concurrent.filter(result=>result.status==='rejected').length,1);
    await db.query('insert into public.material_open_events(publication_id) values($1)',[second.pub]);
    await asUser(sameNumber);
    assert.equal((await db.query('select * from public.student_material_open_status(array[$1]::bigint[])',[first.pub])).rows[0].already_opened,true);
    await assert.rejects(db.query('insert into public.material_open_events(publication_id) values($1)',[first.pub]),/MATERIAL_ALREADY_OPENED/);
    await db.exec('reset role');
    await db.query("update public.profiles set student_id='TEST-00003' where id=$1",[newStudent]);
    await asUser(newStudent);
    assert.equal((await db.query('select * from public.student_material_open_status(array[$1]::bigint[])',[first.pub])).rows[0].already_opened,true);
    await assert.rejects(db.query('insert into public.material_open_events(publication_id) values($1)',[first.pub]),/MATERIAL_ALREADY_OPENED/);

    await asUser(pending);
    assert.equal((await db.query('select * from public.student_material_open_status(array[$1]::bigint[])',[first.pub])).rows.length,0);
    await assert.rejects(db.query('insert into public.material_open_events(publication_id) values($1)',[first.pub]));
    await asUser(missing);
    status=(await db.query('select * from public.student_material_open_status(array[$1]::bigint[])',[first.pub])).rows;
    assert.equal(status[0].student_id_available,false);
    await assert.rejects(db.query('insert into public.material_open_events(publication_id) values($1)',[first.pub]),/MATERIAL_STUDENT_ID_REQUIRED/);

    await asUser(teacher);
    let stats=(await db.query('select * from public.teacher_material_open_stats($1)',[first.pub])).rows;
    assert.equal(Number(stats.find(row=>row.student_id===oldStudent).open_count),2);
    assert.equal(Number(stats.find(row=>row.student_id===newStudent).open_count),1);
    await db.query("update public.teaching_materials set version_label='2' where id=$1",[first.material]);
    await db.query("update public.material_publications set version_label='2',is_published=true where id=$1",[first.pub]);
    await asUser(oldStudent);
    assert.equal((await db.query('select * from public.student_material_open_status(array[$1]::bigint[])',[first.pub])).rows[0].already_opened,false);
    await db.query('insert into public.material_open_events(publication_id) values($1)',[first.pub]);
    await assert.rejects(db.query('insert into public.material_open_events(publication_id) values($1)',[first.pub]),/MATERIAL_ALREADY_OPENED/);
    await asUser(teacher);
    stats=(await db.query('select * from public.teacher_material_open_stats($1)',[first.pub])).rows;
    assert.equal(Number(stats.find(row=>row.student_id===oldStudent).open_count),3);
  } finally { await db.close(); }
});
