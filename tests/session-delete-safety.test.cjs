const {PGlite} = require('@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const teacher = '00000000-0000-4000-8000-000000000001';
const otherTeacher = '00000000-0000-4000-8000-000000000002';
const student = '00000000-0000-4000-8000-000000000003';
const schema = fs.readFileSync(path.join(__dirname,'../docs/database/cancelled-session-deletion.sql'),'utf8');
const children = ['attendance_records','smart_attendance_windows','smart_attendance_qr_tokens','smart_attendance_attempts','attendance_security_events','attendance_leave_requests'];

async function run() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    CREATE TABLE public.profiles(id uuid primary key,role text);
    CREATE TABLE public.courses(id bigint primary key,code text,teacher_id uuid references public.profiles(id));
    CREATE TABLE public.attendance_sessions(id bigint primary key,course_id bigint references public.courses(id),session_date date,topic text,is_cancelled boolean);
    CREATE TABLE public.attendance_records(session_id bigint references public.attendance_sessions(id) on delete cascade);
    CREATE TABLE public.smart_attendance_windows(session_id bigint references public.attendance_sessions(id) on delete cascade,is_open boolean);
    CREATE TABLE public.smart_attendance_qr_tokens(session_id bigint references public.attendance_sessions(id) on delete cascade);
    CREATE TABLE public.smart_attendance_attempts(session_id bigint references public.attendance_sessions(id) on delete cascade);
    CREATE TABLE public.attendance_security_events(session_id bigint references public.attendance_sessions(id) on delete cascade);
    CREATE TABLE public.attendance_leave_requests(session_id bigint references public.attendance_sessions(id) on delete cascade);
    INSERT INTO public.profiles VALUES ('${teacher}','teacher'),('${otherTeacher}','teacher'),('${student}','student');
    INSERT INTO public.courses VALUES (1,'4112203','${teacher}'),(2,'OTHER','${otherTeacher}');
    INSERT INTO public.attendance_sessions VALUES
       (21,1,'2026-11-14','คาบทดสอบ',true),
       (22,1,'2026-11-16','คาบจริง',false),
       (23,1,'2026-11-15','หน้าต่าง QR เปิดอยู่',true),
       (24,2,'2026-11-16','คาบของผู้สอนอื่น',true);
    INSERT INTO public.attendance_records VALUES (21),(22);
    INSERT INTO public.smart_attendance_windows VALUES (21,false),(23,true);
    INSERT INTO public.smart_attendance_qr_tokens VALUES (21);
    INSERT INTO public.smart_attendance_attempts VALUES (21);
    INSERT INTO public.attendance_security_events VALUES (21);
    INSERT INTO public.attendance_leave_requests VALUES (21);
  `);
  await db.exec(schema);

  async function asUser(id, role='authenticated') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id || '']);
    await db.exec('set role '+role);
  }
  async function summary(id) {
    return (await db.query('select public.cancelled_session_delete_summary($1) as s',[id])).rows[0].s;
  }
  async function remove(id,confirmation,expected) {
    return db.query('select public.delete_cancelled_session_permanently($1,$2,$3::jsonb)',[id,confirmation,JSON.stringify(expected)]);
  }

  await asUser('', 'anon');
  await assert.rejects(()=>summary(21),/permission denied/i,'anonymous cannot call the RPC');
  await asUser(otherTeacher);
  await assert.rejects(()=>summary(21),/ไม่มีสิทธิ์/,'another teacher cannot inspect');
  await assert.rejects(()=>remove(21,'21',{}),/ไม่มีสิทธิ์/,'another teacher cannot delete');
  await asUser(student);
  await assert.rejects(()=>remove(21,'21',{}),/ไม่มีสิทธิ์/,'a student cannot delete');
  await asUser(teacher);
  await assert.rejects(()=>summary(22),/ต้องยกเลิก/,'active session must not be deletable');
  await assert.rejects(()=>summary(23),/ปิดรับ QR/,'an open QR window must block deletion');

  let before = await summary(21);
  assert.equal(before.attendance_records,1);
  assert.equal(before.qr_windows,1);
  assert.equal(before.qr_tokens,1);
  assert.equal(before.qr_attempts,1);
  assert.equal(before.security_events,1);
  assert.equal(before.leave_requests,1);
  await assert.rejects(()=>remove(21,'22',before),/หมายเลขคาบ/,'confirmation must match');

  await db.exec('reset role');
  await db.exec('insert into public.attendance_security_events values (21)');
  await asUser(teacher);
  await assert.rejects(()=>remove(21,'21',before),/เปลี่ยนแปลง/,'stale summary must not delete');
  before = await summary(21);
  await remove(21,'21',before);
  await db.exec('reset role');
  const sessions=(await db.query('select id from public.attendance_sessions order by id')).rows.map(r=>Number(r.id));
  assert.deepEqual(sessions,[22,23,24],'only the selected session is removed');
  for(const table of children) {
    const rows=(await db.query(`select count(*)::integer as n from public.${table} where session_id=21`)).rows;
    assert.equal(rows[0].n,0,`${table} was removed through its foreign key`);
  }
  assert.equal((await db.query('select count(*)::integer as n from public.attendance_records where session_id=22')).rows[0].n,1,'real session data is untouched');
  assert.equal((await db.query('select count(*)::integer as n from public.profiles')).rows[0].n,3,'profiles are untouched');
  await db.close();
  console.log('PASS: owner-only, cancelled-only, closed QR, typed confirmation, stale summary, cascading scope and unrelated data.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
