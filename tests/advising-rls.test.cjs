const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const teacherA = '11111111-1111-4111-8111-111111111111';
const teacherB = '22222222-2222-4222-8222-222222222222';
const student = '33333333-3333-4333-8333-333333333333';
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261112165702_advising_groups.sql'), 'utf8');

test('advising records are isolated by teacher and preserve meeting snapshots', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to authenticated, anon;
      create table public.profiles (id uuid primary key, role text not null);
      insert into public.profiles values ('${teacherA}', 'teacher'), ('${teacherB}', 'teacher'), ('${student}', 'student');
      alter table public.profiles enable row level security;
      create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));
      grant select on public.profiles to authenticated;
    `);
    await db.exec(migration);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${teacherA}', false);`);
    const groupA = (await db.query("insert into public.advising_groups(name) values ('กลุ่มทดสอบ A') returning id")).rows[0].id;
    const memberA = (await db.query("insert into public.advising_students(group_id, student_number, full_name) values ($1, 'S001', 'นักศึกษาทดสอบ') returning id", [groupA])).rows[0].id;
    const sessionA = (await db.query("insert into public.advising_sessions(group_id,meeting_date) values ($1, '2026-11-13') returning id", [groupA])).rows[0].id;
    await db.query("insert into public.advising_participants(group_id,session_id,student_id,student_number_snapshot,full_name_snapshot) values ($1,$2,$3,'S001','นักศึกษาทดสอบ')", [groupA, sessionA, memberA]);
    await db.query("update public.advising_students set full_name='ชื่อใหม่' where id=$1", [memberA]);
    assert.equal((await db.query('select full_name_snapshot from public.advising_participants')).rows[0].full_name_snapshot, 'นักศึกษาทดสอบ');
    await assert.rejects(db.query('delete from public.advising_groups where id=$1', [groupA]), /permission denied/i);
    await assert.rejects(db.query("insert into public.advising_sessions(group_id,meeting_date,start_time,end_time) values ($1,'2026-11-13','12:00','11:00')", [groupA]), /check constraint/i);

    await db.exec(`select set_config('request.jwt.claim.sub', '${teacherB}', false)`);
    assert.equal((await db.query('select * from public.advising_groups')).rows.length, 0);
    assert.equal((await db.query('select * from public.advising_participants')).rows.length, 0);
    assert.equal((await db.query("update public.advising_groups set name='แก้โดยผู้อื่น' where id=$1 returning id", [groupA])).rows.length, 0);
    await assert.rejects(db.query("insert into public.advising_groups(owner_id,name) values ($1,'ปลอมเจ้าของ')", [teacherA]), /row-level security/i);
    const groupB = (await db.query("insert into public.advising_groups(name) values ('กลุ่มทดสอบ B') returning id")).rows[0].id;
    const memberB = (await db.query("insert into public.advising_students(group_id,student_number,full_name) values ($1,'S002','คนทดสอบ B') returning id", [groupB])).rows[0].id;
    const sessionB = (await db.query("insert into public.advising_sessions(group_id,meeting_date) values ($1,'2026-11-13') returning id", [groupB])).rows[0].id;
    await assert.rejects(db.query("insert into public.advising_participants(group_id,session_id,student_id,student_number_snapshot,full_name_snapshot) values ($1,$2,$3,'S001','ข้ามกลุ่ม')", [groupB, sessionB, memberA]), /foreign key/i);
    assert.ok(memberB);

    await db.exec(`select set_config('request.jwt.claim.sub', '${student}', false)`);
    assert.equal((await db.query('select * from public.advising_groups')).rows.length, 0);
    await assert.rejects(db.query("insert into public.advising_groups(name) values ('นักศึกษาเพิ่ม')"), /row-level security/i);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.advising_groups'), /permission denied/i);
  } finally {
    await db.close();
  }
});
