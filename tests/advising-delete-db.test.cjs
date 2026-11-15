const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');

test('only the owner can delete one reviewed advising student and their linked participant rows',async()=>{
 const db=new PGlite();
 const teacher='10000000-0000-4000-8000-000000000001',otherTeacher='10000000-0000-4000-8000-000000000002',studentUser='10000000-0000-4000-8000-000000000003';
 try{
  await db.exec(`
   create role anon;create role authenticated;create schema auth;
   grant usage on schema auth to authenticated,anon;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create table public.profiles(id uuid primary key,role text not null);
   create table public.advising_students(id bigint primary key,owner_id uuid not null,group_id bigint not null,student_number text not null,full_name text not null,is_archived boolean default false,unique(id,group_id,owner_id));
   create table public.advising_sessions(id bigint primary key,owner_id uuid not null,group_id bigint not null,unique(id,group_id,owner_id));
   create table public.advising_participants(owner_id uuid not null,group_id bigint not null,session_id bigint not null,student_id bigint not null,student_number_snapshot text not null,full_name_snapshot text not null,attendance_status text not null,
    primary key(session_id,student_id),foreign key(student_id,group_id,owner_id) references public.advising_students(id,group_id,owner_id) on delete restrict,
    foreign key(session_id,group_id,owner_id) references public.advising_sessions(id,group_id,owner_id) on delete cascade);
   create table public.course_enrollments(id bigint primary key,student_label text);
   create table public.course_grades(id bigint primary key,score numeric);
   insert into public.profiles values('${teacher}','teacher'),('${otherTeacher}','teacher'),('${studentUser}','student');
   insert into public.advising_students values(1,'${teacher}',10,'S001','นักศึกษาทดสอบ ก',false),(2,'${teacher}',10,'S002','นักศึกษาทดสอบ ข',false),(3,'${otherTeacher}',20,'S003','นักศึกษาทดสอบ ค',false);
   insert into public.advising_sessions values(100,'${teacher}',10),(101,'${teacher}',10),(200,'${otherTeacher}',20);
   insert into public.advising_participants values('${teacher}',10,100,1,'S001','นักศึกษาทดสอบ ก','present'),('${teacher}',10,101,1,'S001','นักศึกษาทดสอบ ก','not_recorded'),('${teacher}',10,100,2,'S002','นักศึกษาทดสอบ ข','present'),('${otherTeacher}',20,200,3,'S003','นักศึกษาทดสอบ ค','present');
   insert into public.course_enrollments values(1,'S001');insert into public.course_grades values(1,88);
   grant select on public.profiles,public.advising_students,public.advising_participants to authenticated;
   alter table public.advising_students enable row level security;alter table public.advising_participants enable row level security;
   create policy advising_students_owner on public.advising_students for select to authenticated using(owner_id=auth.uid());
   create policy advising_participants_owner on public.advising_participants for select to authenticated using(owner_id=auth.uid());
  `);
  await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/advising-student-delete.sql'),'utf8'));
  async function asUser(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
  async function preview(id){return (await db.query('select public.preview_advising_student_deletion($1) as value',[id])).rows[0].value}
  async function remove(p,confirmation=p.student_number){return (await db.query('select public.delete_advising_student($1,$2,$3,$4,$5,$6) as value',[p.student_id,p.group_id,p.student_number,p.full_name,p.fingerprint,confirmation])).rows[0].value}
  await asUser(teacher);
  let p=await preview(1);assert.equal(p.participant_count,2);assert.equal(p.recorded_count,1);
  await assert.rejects(remove(p,'WRONG'),/ไม่ตรงกัน/);
  await db.exec('reset role');
  await db.exec("update public.advising_participants set attendance_status='absent' where session_id=100 and student_id=1");
  await asUser(teacher);await assert.rejects(remove(p),/เปลี่ยนไป/,'same-count status changes invalidate the preview');
  await asUser(otherTeacher);await assert.rejects(preview(1),/ไม่มีสิทธิ์/);await assert.rejects(remove(p),/ไม่มีสิทธิ์/);
  await asUser(studentUser);await assert.rejects(remove(p),/เฉพาะอาจารย์/);
  await asUser(teacher);p=await preview(1);
  const removed=await remove(p);assert.equal(removed.deleted_participants,2);assert.equal(removed.deleted_recorded,1);
  await assert.rejects(remove(p),/ไม่พบรายชื่อ/);
  await db.exec('reset role');
  assert.deepEqual((await db.query('select id from public.advising_students order by id')).rows.map(r=>Number(r.id)),[2,3]);
  assert.deepEqual((await db.query('select student_id from public.advising_participants order by student_id')).rows.map(r=>Number(r.student_id)),[2,3]);
  assert.equal((await db.query('select count(*)::int as n from public.advising_sessions')).rows[0].n,3);
  assert.equal((await db.query('select score::int as score from public.course_grades')).rows[0].score,88);
  assert.equal((await db.query('select count(*)::int as n from public.course_enrollments')).rows[0].n,1);
  const privileges=(await db.query("select has_function_privilege('anon','public.delete_advising_student(bigint,bigint,text,text,text,text)','execute') as anon_execute,has_table_privilege('authenticated','public.advising_students','delete') as direct_delete")).rows[0];
  assert.equal(privileges.anon_execute,false);assert.equal(privileges.direct_delete,false);
 }finally{await db.close()}
});
