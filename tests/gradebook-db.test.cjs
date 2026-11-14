const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('gradebook marks are private to the course teacher and validated by the database', async () => {
  const db = new PGlite();
  const teacher = '00000000-0000-4000-8000-000000000001';
  const student = '00000000-0000-4000-8000-000000000002';
  const otherTeacher = '00000000-0000-4000-8000-000000000003';
  const pending = '00000000-0000-4000-8000-000000000004';
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      grant usage on schema auth to authenticated, anon;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
      $$;
      create table public.courses(id bigint primary key, teacher_id uuid not null);
      create table public.enrollments(course_id bigint, student_id uuid, status text, primary key(course_id, student_id));
      insert into public.courses values (1,'${teacher}'), (2,'${otherTeacher}');
      insert into public.enrollments values (1,'${student}','approved'), (1,'${pending}','pending'), (2,'${student}','approved');
      grant select on public.courses, public.enrollments to authenticated;
      alter table public.courses enable row level security;
      alter table public.enrollments enable row level security;
      create policy own_courses on public.courses for select to authenticated using (teacher_id=auth.uid());
      create policy own_enrollments on public.enrollments for select to authenticated using (
        student_id=auth.uid() or exists(select 1 from public.courses c where c.id=course_id and c.teacher_id=auth.uid())
      );
    `);
    await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/gradebook.sql'),'utf8'));
    async function asUser(id) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
      await db.exec('set role authenticated');
    }
    await asUser(teacher);
    const items = await db.query("insert into gradebook_items(course_id,category,title,max_score) values (1,'homework','WS1',1),(1,'project','Report',5) returning id,category");
    const homework = items.rows.find(x=>x.category==='homework').id;
    const project = items.rows.find(x=>x.category==='project').id;
    await db.query('insert into gradebook_marks(course_id,item_id,student_id,submitted) values(1,$1,$2,true)',[homework,student]);
    await db.query('insert into gradebook_marks(course_id,item_id,student_id,score) values(1,$1,$2,4.5)',[project,student]);
    await assert.rejects(db.query('update gradebook_marks set score=6 where item_id=$1',[project]),/maximum/i);
    await assert.rejects(db.query('insert into gradebook_marks(course_id,item_id,student_id,submitted) values(1,$1,$2,true)',[homework,pending]),/row-level security/i);
    await assert.rejects(db.query('insert into gradebook_items(course_id,category,title,max_score) values(2,\'homework\',\'not mine\',1)'),/row-level security/i);
    await assert.rejects(db.query('update gradebook_items set max_score=4 where id=$1',[project]),/conflict/i);
    await asUser(student);
    assert.equal((await db.query('select * from gradebook_marks')).rows.length,0,'students cannot read marks directly');
    assert.equal((await db.query('select * from gradebook_items')).rows.length,0,'students cannot read the gradebook');
    await assert.rejects(db.query('insert into gradebook_marks(course_id,item_id,student_id,submitted) values(1,$1,$2,true)',[homework,student]),/row-level security|item not found/i);
    await asUser(otherTeacher);
    assert.equal((await db.query('select * from gradebook_marks')).rows.length,0,'other teachers cannot read marks');
    assert.equal((await db.query('select * from gradebook_items')).rows.length,0,'other teachers cannot read this course');
  } finally { await db.close(); }
});
