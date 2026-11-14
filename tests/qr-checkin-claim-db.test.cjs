const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

const teacher = '00000000-0000-4000-8000-000000000001';
const student = '00000000-0000-4000-8000-000000000002';
const otherStudent = '00000000-0000-4000-8000-000000000003';
const outsider = '00000000-0000-4000-8000-000000000004';
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

test('a QR verified before GPS stays bound to the student, window, policy and one attendance record', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA me_smart_private;
      CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      GRANT USAGE ON SCHEMA auth,me_smart_private TO authenticated,anon;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text);
      CREATE TABLE public.courses(id bigint PRIMARY KEY,teacher_id uuid);
      CREATE TABLE public.enrollments(course_id bigint,student_id uuid,status text);
      CREATE TABLE public.attendance_sessions(id bigint PRIMARY KEY,course_id bigint,is_cancelled boolean);
      CREATE TABLE public.attendance_records(session_id bigint,student_id uuid,status text,note text,PRIMARY KEY(session_id,student_id));
      CREATE TABLE public.smart_attendance_attempts(session_id bigint,student_id uuid,outcome text);
      CREATE TABLE public.attendance_security_events(session_id bigint,student_id uuid,outcome text,distance_m double precision,accuracy_m double precision);
      CREATE TABLE public.smart_attendance_windows(
        session_id bigint PRIMARY KEY,is_open boolean,opened_at timestamptz,closes_at timestamptz,
        late_after_minutes integer,require_location boolean,latitude double precision,longitude double precision,radius_m integer
      );
      CREATE TABLE public.smart_attendance_qr_tokens(
        session_id bigint,window_opened_at timestamptz,token_hash text,expires_at timestamptz,
        PRIMARY KEY(session_id,token_hash)
      );
      INSERT INTO public.profiles VALUES
        ('${teacher}','teacher'),('${student}','student'),('${otherStudent}','student'),('${outsider}','student');
      INSERT INTO public.courses VALUES(1,'${teacher}');
      INSERT INTO public.enrollments VALUES(1,'${student}','approved'),(1,'${otherStudent}','approved'),(1,'${outsider}','pending');
      INSERT INTO public.attendance_sessions SELECT n,1,false FROM generate_series(101,112) n;
      INSERT INTO public.smart_attendance_windows
        SELECT n,true,now()-interval '10 seconds',now()+interval '15 minutes',10,n NOT IN (102,112),13.7563,100.5018,150
        FROM generate_series(101,112) n;
      INSERT INTO public.smart_attendance_qr_tokens
        SELECT session_id,opened_at,encode(extensions.digest('qr-'||session_id,'sha256'),'hex'),now()+interval '30 seconds'
        FROM public.smart_attendance_windows;
    `);
    await db.exec(read('fixtures/smart_checkin.sql'));
    await db.exec(read('fixtures/smart_checkin_v7.sql'));
    await db.exec(read('../docs/database/qr-checkin-claim.sql'));

    async function asUser(id, role='authenticated') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
      await db.exec('set role ' + role);
    }
    async function prepare(id, token='qr-'+id) {
      return (await db.query('select public.smart_prepare_qr_checkin($1,$2) as r',[id,token])).rows[0].r;
    }
    async function finish(id, claim, lat=null, lng=null, accuracy=null) {
      return (await db.query('select public.smart_finish_qr_checkin($1,$2,$3,$4,$5) as r',[id,claim,lat,lng,accuracy])).rows[0].r;
    }
    async function root(sql, params=[]) { await db.exec('reset role'); return db.query(sql,params); }

    await asUser(student);
    const gps = await prepare(101);
    assert.equal(gps.ok,true);
    await root('delete from public.smart_attendance_qr_tokens where session_id=101');
    await asUser(student);
    assert.equal((await finish(101,gps.claim,13.7563,100.5018,5)).code,'accepted_present',
      'an authenticated scan can complete after the displayed QR has rotated and expired');
    assert.equal((await finish(101,gps.claim,13.7563,100.5018,5)).code,'invalid_claim','a claim cannot be reused');

    const noGps = await prepare(102);
    assert.equal((await finish(102,noGps.claim)).code,'accepted_present','non-GPS mode still works');

    const location = await prepare(103);
    assert.equal((await finish(103,location.claim,13.7663,100.5018,5)).code,'outside_zone');
    assert.equal((await finish(103,location.claim,13.75759,100.5018,10)).code,'location_uncertain');
    assert.equal((await finish(103,location.claim)).code,'location_unavailable');
    assert.equal((await finish(103,location.claim,13.7563,100.5018,5)).code,'accepted_present',
      'location failures do not bypass GPS and allow a valid retry before expiry');

    const bound = await prepare(104);
    await asUser(otherStudent);
    assert.equal((await finish(104,bound.claim,13.7563,100.5018,5)).code,'invalid_claim','a different student cannot use a claim');
    assert.equal((await db.query('select public.smart_checkin_v7($1,$2,$3,$4,$5) as r',[104,bound.claim,13.7563,100.5018,5])).rows[0].r.code,'invalid_qr',
      'a claim is not a reusable QR token');
    await assert.rejects(db.query('select * from me_smart_private.qr_checkin_claims'),/permission denied/i);
    await asUser(outsider);
    assert.equal((await prepare(104)).code,'not_enrolled');
    await asUser(student);

    const closed = await prepare(105);
    await root('update public.smart_attendance_windows set is_open=false where session_id=105');
    await asUser(student);
    assert.equal((await finish(105,closed.claim,13.7563,100.5018,5)).code,'closed');

    const expired = await prepare(106);
    await root("update me_smart_private.qr_checkin_claims set expires_at=now()-interval '1 second' where session_id=106");
    await asUser(student);
    assert.equal((await finish(106,expired.claim,13.7563,100.5018,5)).code,'claim_expired');

    const reopened = await prepare(107);
    await root("update public.smart_attendance_windows set opened_at=opened_at+interval '1 second' where session_id=107");
    await asUser(student);
    assert.equal((await finish(107,reopened.claim,13.7563,100.5018,5)).code,'invalid_claim','a claim cannot cross windows');

    await root("update public.smart_attendance_qr_tokens set expires_at=now()-interval '1 second' where session_id=108");
    await asUser(student);
    assert.equal((await prepare(108)).code,'invalid_qr','an expired QR cannot create a claim');
    assert.equal((await prepare(109,'wrong-token')).code,'invalid_qr');

    const cancelled = await prepare(109);
    await root('update public.attendance_sessions set is_cancelled=true where id=109');
    await asUser(student);
    assert.equal((await finish(109,cancelled.claim,13.7563,100.5018,5)).code,'cancelled');

    const revoked = await prepare(110);
    await root("update public.enrollments set status='rejected' where student_id=$1",[student]);
    await asUser(student);
    assert.equal((await finish(110,revoked.claim,13.7563,100.5018,5)).code,'not_enrolled',
      'a claim cannot survive revoked course access');
    await root("update public.enrollments set status='approved' where student_id=$1",[student]);
    await asUser(student);

    const duplicate = await prepare(111);
    await root("insert into public.attendance_records values(111,$1,'leave','existing teacher decision')",[student]);
    await asUser(student);
    assert.equal((await finish(111,duplicate.claim,13.7563,100.5018,5)).code,'already_recorded');
    const untouched = await root('select status,note from public.attendance_records where session_id=111');
    assert.deepEqual(untouched.rows[0],{status:'leave',note:'existing teacher decision'});
    await asUser(student);
    assert.equal((await db.query("select public.smart_checkin_v7(112,'qr-112',null,null,null) as r")).rows[0].r.code,'accepted_present',
      'the existing check-in API remains usable during a staged rollout');

    await asUser('', 'anon');
    await assert.rejects(db.query("select public.smart_prepare_qr_checkin(109,'qr-109')"),/permission denied/i);
    await assert.rejects(db.query("select public.smart_finish_qr_checkin(109,'claim',null,null,null)"),/permission denied/i);

    const stats = (await root('select count(*)::int as n from public.attendance_records')).rows[0].n;
    assert.equal(stats,5,'the valid check-ins and pre-existing record remain');
    const leaked = (await db.query("select count(*)::int as n from public.smart_attendance_qr_tokens where token_hash not in (select encode(extensions.digest('qr-'||session_id,'sha256'),'hex') from public.smart_attendance_windows)")).rows[0].n;
    assert.equal(leaked,0,'temporary claim tokens never persist');
    await db.query('delete from public.attendance_sessions where id=109');
    assert.equal((await db.query('select count(*)::int as n from me_smart_private.qr_checkin_claims where session_id=109')).rows[0].n,0,
      'deleting a cancelled test session cleans up its temporary claim');
  } finally { await db.close(); }
});
