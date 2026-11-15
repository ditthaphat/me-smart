const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('reviewed deletion removes only an owned advising session and its participant rows', async () => {
  const db = new PGlite();
  const teacher = '10000000-0000-4000-8000-000000000001';
  const otherTeacher = '10000000-0000-4000-8000-000000000002';
  const student = '10000000-0000-4000-8000-000000000003';
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      grant usage on schema auth to anon, authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.profiles(id uuid primary key,role text not null);
      create table public.advising_groups(id bigint primary key,owner_id uuid not null,name text,unique(id,owner_id));
      create table public.advising_students(id bigint primary key,owner_id uuid not null,group_id bigint not null,full_name text,unique(id,group_id,owner_id));
      create table public.advising_sessions(id bigint primary key,owner_id uuid not null,group_id bigint not null,meeting_date date not null,
        start_time time,end_time time,location text not null default '',discussion text not null default '',is_archived boolean not null default false,
        unique(id,group_id,owner_id),foreign key(group_id,owner_id) references public.advising_groups(id,owner_id));
      create table public.advising_participants(owner_id uuid not null,group_id bigint not null,session_id bigint not null,student_id bigint not null,
        student_number_snapshot text not null,full_name_snapshot text not null,attendance_status text not null,
        primary key(session_id,student_id),foreign key(session_id,group_id,owner_id) references public.advising_sessions(id,group_id,owner_id) on delete cascade,
        foreign key(student_id,group_id,owner_id) references public.advising_students(id,group_id,owner_id) on delete restrict);
      create table public.course_grades(id bigint primary key,score numeric);
      insert into public.profiles values('${teacher}','teacher'),('${otherTeacher}','teacher'),('${student}','student');
      insert into public.advising_groups values(10,'${teacher}','กลุ่ม ก'),(20,'${otherTeacher}','กลุ่ม ข');
      insert into public.advising_students values(1,'${teacher}',10,'นักศึกษาทดสอบ ก'),(2,'${teacher}',10,'นักศึกษาทดสอบ ข'),(3,'${otherTeacher}',20,'นักศึกษาทดสอบ ค');
      insert into public.advising_sessions values
        (100,'${teacher}',10,'2026-11-15','09:00','10:00','ทดสอบ','เนื้อหาทดสอบ',false),
        (101,'${teacher}',10,'2026-11-16',null,null,'อีกครั้ง','เก็บข้อมูลไว้',true),
        (200,'${otherTeacher}',20,'2026-11-15',null,null,'อีกกลุ่ม','เก็บข้อมูลไว้',false);
      insert into public.advising_participants values
        ('${teacher}',10,100,1,'S001','นักศึกษาทดสอบ ก','present'),
        ('${teacher}',10,100,2,'S002','นักศึกษาทดสอบ ข','not_recorded'),
        ('${teacher}',10,101,1,'S001','นักศึกษาทดสอบ ก','absent'),
        ('${otherTeacher}',20,200,3,'S003','นักศึกษาทดสอบ ค','present');
      insert into public.course_grades values(1,88);
      grant select on public.profiles,public.advising_students,public.advising_groups to authenticated;
      grant select,update on public.advising_sessions,public.advising_participants to authenticated;
      alter table public.advising_sessions enable row level security;
      alter table public.advising_participants enable row level security;
      create policy advising_sessions_owner on public.advising_sessions for all to authenticated
        using(owner_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher'))
        with check(owner_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher'));
      create policy advising_participants_owner on public.advising_participants for all to authenticated
        using(owner_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher'))
        with check(owner_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher'));
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '../docs/database/advising-session-delete.sql'), 'utf8'));
    async function asUser(id) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); }
    async function preview(id) { return (await db.query('select public.preview_advising_session_deletion($1) as value',[id])).rows[0].value; }
    async function remove(p, confirmation='ลบ') { return (await db.query('select public.delete_advising_session($1,$2,$3,$4) as value',[p.session_id,p.group_id,p.fingerprint,confirmation])).rows[0].value; }
    await asUser(teacher);
    let p = await preview(100);
    assert.equal(p.participant_count,2); assert.equal(p.recorded_count,1);
    await assert.rejects(remove(p,'ผิด'),/คำยืนยัน/);
    await asUser(otherTeacher);
    await assert.rejects(preview(100),/ไม่มีสิทธิ์/);
    await assert.rejects(remove(p),/ไม่มีสิทธิ์/);
    assert.equal((await db.query('delete from public.advising_sessions where id=100 returning id')).rows.length,0,'RLS blocks cross-owner direct deletion');
    await asUser(student); await assert.rejects(remove(p),/เฉพาะอาจารย์/);
    await db.exec('reset role');
    await db.exec("update public.advising_participants set attendance_status='absent' where session_id=100 and student_id=1");
    await asUser(teacher); await assert.rejects(remove(p),/เปลี่ยนไป/,'a same-count status change invalidates review');
    p = await preview(100);
    await db.exec('reset role'); await db.exec("update public.advising_sessions set discussion='แก้ไขหลังตรวจสอบ' where id=100");
    await asUser(teacher); await assert.rejects(remove(p),/เปลี่ยนไป/,'an edited consultation invalidates review');
    p = await preview(100);
    const removed = await remove(p);
    assert.equal(removed.session_id,100); assert.equal(removed.deleted_participants,2); assert.equal(removed.deleted_recorded,1);
    await assert.rejects(remove(p),/ไม่พบ/);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select id from public.advising_sessions order by id')).rows.map(r=>Number(r.id)),[101,200]);
    assert.deepEqual((await db.query('select session_id from public.advising_participants order by session_id')).rows.map(r=>Number(r.session_id)),[101,200]);
    assert.equal((await db.query('select count(*)::int n from public.advising_students')).rows[0].n,3);
    assert.equal((await db.query('select count(*)::int n from public.advising_groups')).rows[0].n,2);
    assert.equal((await db.query('select score::int n from public.course_grades')).rows[0].n,88);
    const rights=(await db.query("select has_function_privilege('anon','public.delete_advising_session(bigint,bigint,text,text)','execute') anon_execute,has_table_privilege('authenticated','public.advising_students','delete') student_delete")).rows[0];
    assert.equal(rights.anon_execute,false); assert.equal(rights.student_delete,false);
    await asUser(teacher); const archived = await preview(101); assert.equal((await remove(archived)).session_id,101);
    await db.exec('reset role'); assert.equal((await db.query('select count(*)::int n from public.advising_sessions where id=200')).rows[0].n,1);
  } finally { await db.close(); }
});
