const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');

test('chapter plans are teacher-private and deletion stays within the selected material',async()=>{
 const db=new PGlite();
 const teacher='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',student='10000000-0000-4000-8000-000000000003';
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to anon,authenticated;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public.profiles(id uuid primary key references auth.users(id),role text not null);
   create table public.courses(id bigint primary key,teacher_id uuid not null references public.profiles(id),code text);
   create table public.advising_sessions(id bigint primary key,notes text);
   insert into auth.users values('${teacher}'),('${other}'),('${student}');
   insert into public.profiles values('${teacher}','teacher'),('${other}','teacher'),('${student}','student');
   insert into public.courses values(1,'${teacher}','4112203'),(2,'${other}','4111307');
   insert into public.advising_sessions values(1,'ข้อมูลเดิม');
   grant select on public.profiles,public.courses to authenticated;
   alter table public.courses enable row level security;
   create policy course_owner on public.courses for select to authenticated using(teacher_id=auth.uid());`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/teaching-materials.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/material-chapter-progress.sql'),'utf8'));
  async function asUser(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
  await asUser(teacher);
  const bookA=(await db.query("insert into public.teaching_materials(title,material_type) values('ตำราทดสอบ ก','textbook') returning id")).rows[0].id;
  const bookB=(await db.query("insert into public.teaching_materials(title,material_type) values('ตำราทดสอบ ข','textbook') returning id")).rows[0].id;
  const chapter=(await db.query("insert into public.material_chapters(material_id,chapter_number,title,due_date) values($1,1,'บทนำ','2026-11-20') returning id",[bookA])).rows[0].id;
  await db.query("insert into public.material_topics(material_id,chapter_id,title,topic_status) values($1,$2,'ความเป็นมา','done'),($1,$2,'ขอบเขต','writing')",[bookA,chapter]);
  await assert.rejects(db.query("insert into public.material_chapters(material_id,chapter_number,title) values($1,1,'ซ้ำ')",[bookA]),/unique constraint/);
  await assert.rejects(db.query("insert into public.material_topics(material_id,chapter_id,title) values($1,$2,'ผิดเล่ม')",[bookB,chapter]),/foreign key constraint/);
  await assert.rejects(db.query("insert into public.material_topics(material_id,chapter_id,title,topic_status) values($1,$2,'สถานะผิด','invalid')",[bookA,chapter]),/check constraint/);
  await asUser(other);
  const bookC=(await db.query("insert into public.teaching_materials(title,material_type) values('ตำราของอาจารย์อื่น','textbook') returning id")).rows[0].id;
  assert.equal((await db.query('select count(*)::int n from public.material_chapters')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.material_topics')).rows[0].n,0);
  assert.equal((await db.query('delete from public.material_chapters where id=$1 returning id',[chapter])).rows.length,0);
  await assert.rejects(db.query("insert into public.material_chapters(material_id,chapter_number,title) values($1,2,'ข้ามเจ้าของ')",[bookA]),/foreign key constraint/);
  await asUser(student);
  assert.equal((await db.query('select count(*)::int n from public.material_topics')).rows[0].n,0);
  await assert.rejects(db.query("insert into public.material_chapters(material_id,chapter_number,title) values($1,2,'นักศึกษา')",[bookA]),/row-level security/);
  await asUser(teacher);
  assert.equal((await db.query('delete from public.material_chapters where id=$1 returning id',[chapter])).rows.length,1);
  assert.equal((await db.query('select count(*)::int n from public.material_topics')).rows[0].n,0,'chapter deletion cascades its topics');
  const another=(await db.query("insert into public.material_chapters(material_id,chapter_number,title) values($1,2,'บทที่สอง') returning id",[bookA])).rows[0].id;
  await db.query("insert into public.material_topics(material_id,chapter_id,title) values($1,$2,'หัวข้อที่เหลือ')",[bookA,another]);
  const keep=(await db.query("insert into public.material_chapters(material_id,chapter_number,title) values($1,1,'บทของอีกเล่ม') returning id",[bookB])).rows[0].id;
  await db.query('delete from public.teaching_materials where id=$1',[bookA]);
  assert.equal((await db.query('select count(*)::int n from public.material_chapters where id=$1',[keep])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from public.material_topics')).rows[0].n,0);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from public.advising_sessions')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from public.teaching_materials where id=$1',[bookC])).rows[0].n,1);
  assert.equal((await db.query("select has_table_privilege('anon','public.material_topics','select') as allowed")).rows[0].allowed,false);
 } finally { await db.close(); }
});
