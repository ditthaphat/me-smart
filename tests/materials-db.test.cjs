const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('teaching materials remain private to their teacher and may only reference their own courses', async () => {
  const db = new PGlite();
  const teacher = '10000000-0000-4000-8000-000000000001';
  const otherTeacher = '10000000-0000-4000-8000-000000000002';
  const student = '10000000-0000-4000-8000-000000000003';
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      grant usage on schema auth to anon,authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.profiles(id uuid primary key references auth.users(id),role text not null);
      create table public.courses(id bigint primary key,teacher_id uuid not null references public.profiles(id),code text);
      create table public.advising_sessions(id bigint primary key,notes text);
      insert into auth.users values('${teacher}'),('${otherTeacher}'),('${student}');
      insert into public.profiles values('${teacher}','teacher'),('${otherTeacher}','teacher'),('${student}','student');
      insert into public.courses values(5,'${teacher}','4112203'),(6,'${otherTeacher}','4111307');
      insert into public.advising_sessions values(1,'บันทึกที่ปรึกษาทดสอบ');
      grant select on public.profiles,public.courses to authenticated;
      alter table public.courses enable row level security;
      create policy courses_teacher_read on public.courses for select to authenticated using(teacher_id=auth.uid());
    `);
    await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/teaching-materials.sql'),'utf8'));
    async function asUser(id) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); }
    await asUser(teacher);
    const inserted=(await db.query("insert into public.teaching_materials(course_id,title,material_type,material_status,version_label,external_url) values(5,'ตำราทดสอบ','textbook','draft','1.0','https://drive.google.com/file/d/example/view') returning id")).rows[0];
    await db.query("insert into public.teaching_materials(title,material_type) values('บทเรียนที่ยังไม่เลือกวิชา','lesson')");
    await assert.rejects(db.query("insert into public.teaching_materials(course_id,title,material_type) values(6,'วิชาของอาจารย์อื่น','lesson')"),/row-level security/);
    await assert.rejects(db.query("update public.teaching_materials set course_id=6 where id=$1",[inserted.id]),/row-level security/);
    await assert.rejects(db.query("insert into public.teaching_materials(title,material_type,external_url) values('อันตราย','other','javascript:alert(1)')"),/check constraint/);
    await assert.rejects(db.query("insert into public.teaching_materials(title,material_type,external_url) values('อันตราย','other','https://user:password@example.com/')"),/check constraint/);
    await assert.rejects(db.query("insert into public.teaching_materials(title,material_type) values('   ','lesson')"),/check constraint/);
    await assert.rejects(db.query("insert into public.teaching_materials(title,material_type) values('ประเภทไม่ถูกต้อง','unknown')"),/check constraint/);
    await asUser(otherTeacher);
    assert.equal((await db.query('select count(*)::int n from public.teaching_materials')).rows[0].n,0);
    assert.equal((await db.query("update public.teaching_materials set title='changed' where id=$1 returning id",[inserted.id])).rows.length,0);
    assert.equal((await db.query('delete from public.teaching_materials where id=$1 returning id',[inserted.id])).rows.length,0);
    await asUser(student);
    assert.equal((await db.query('select count(*)::int n from public.teaching_materials')).rows[0].n,0);
    await assert.rejects(db.query("insert into public.teaching_materials(title,material_type) values('นักศึกษา','lesson')"),/row-level security/);
    await asUser(teacher);
    assert.equal((await db.query('update public.teaching_materials set is_archived=true where id=$1 returning id',[inserted.id])).rows.length,1);
    assert.equal((await db.query('delete from public.teaching_materials where id=$1 returning id',[inserted.id])).rows.length,1);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from public.teaching_materials')).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from public.courses')).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from public.advising_sessions')).rows[0].n,1);
    assert.equal((await db.query("select has_table_privilege('anon','public.teaching_materials','select') as allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});
