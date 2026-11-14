const {PGlite} = require('@electric-sql/pglite');
const {pgcrypto} = require('@electric-sql/pglite/contrib/pgcrypto');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const schema = fs.readFileSync(path.join(__dirname,'../docs/proposed/student-organization-auth.sql'),'utf8');
const teacher = '00000000-0000-4000-8000-000000000001';
const valid = '00000000-0000-4000-8000-000000000002';
const legacy = '00000000-0000-4000-8000-000000000003';
const unconfirmed = '00000000-0000-4000-8000-000000000004';
const outsider = '00000000-0000-4000-8000-000000000005';
const claims = {role:'authenticated',sub:valid};

async function run() {
 const db=new PGlite({extensions:{pgcrypto}});
 await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE supabase_auth_admin;
  CREATE SCHEMA auth; CREATE SCHEMA me_smart_private; CREATE SCHEMA extensions;
  CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  GRANT USAGE ON SCHEMA auth,me_smart_private TO authenticated;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
  CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),role text,student_id text);
  CREATE TABLE public.enrollments(course_id bigint,student_id uuid,status text);
  CREATE TABLE public.attendance_sessions(id bigint PRIMARY KEY,course_id bigint,is_cancelled boolean);
  CREATE TABLE public.attendance_records(session_id bigint,student_id uuid,status text,note text);
  CREATE TABLE public.attendance_leave_requests(session_id bigint,student_id uuid);
  CREATE TABLE public.attendance_security_events(session_id bigint,student_id uuid,outcome text,distance_m double precision,accuracy_m double precision);
  CREATE TABLE public.smart_attendance_attempts(session_id bigint,student_id uuid,outcome text);
  CREATE TABLE public.smart_attendance_windows(session_id bigint,is_open boolean,closes_at timestamptz,opened_at timestamptz,late_after_minutes integer,require_location boolean,latitude double precision,longitude double precision,radius_m integer);
  CREATE TABLE public.smart_attendance_qr_tokens(session_id bigint,window_opened_at timestamptz,token_hash text,expires_at timestamptz);
  ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.attendance_leave_requests ENABLE ROW LEVEL SECURITY;
  GRANT SELECT ON public.enrollments,public.attendance_sessions,public.attendance_records,public.attendance_leave_requests,public.profiles TO authenticated;
  CREATE POLICY open_read ON public.enrollments FOR SELECT TO authenticated USING (true);
  CREATE POLICY open_read ON public.attendance_sessions FOR SELECT TO authenticated USING (true);
  CREATE POLICY open_read ON public.attendance_records FOR SELECT TO authenticated USING (true);
  CREATE POLICY open_read ON public.attendance_leave_requests FOR SELECT TO authenticated USING (true);
  CREATE FUNCTION public.my_courses() RETURNS TABLE(id bigint,code text,title text,term text,status text) LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1::bigint,'4112203'::text,'Fluid'::text,'2'::text,'approved'::text $$;
  CREATE FUNCTION public.request_enrollment(p_course_id bigint,p_join_code text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'pending'::text $$;
  CREATE FUNCTION public.submit_leave_request(p_session_id bigint,p_leave_type text,p_reason text) RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$ SELECT 55::bigint $$;
  INSERT INTO auth.users VALUES
    ('${teacher}','teacher@example.org',now()),
    ('${valid}','665040300410@mail.rmutk.ac.th',now()),
    ('${legacy}','legacy@example.org',now()),
    ('${unconfirmed}','665040300430@mail.rmutk.ac.th',NULL);
  INSERT INTO public.profiles VALUES
    ('${teacher}','teacher',NULL),('${valid}','student','66504030041-0'),
    ('${legacy}','student','66504030042-8'),('${unconfirmed}','student','66504030043-0');
  INSERT INTO public.enrollments VALUES (1,'${valid}','approved'),(1,'${legacy}','approved');
  INSERT INTO public.attendance_sessions VALUES (101,1,false),(102,1,false);
  INSERT INTO public.smart_attendance_windows VALUES
    (101,true,now()+interval '20 minutes',now()-interval '1 minute',10,false,13.7563,100.5018,150),
    (102,true,now()+interval '20 minutes',now()-interval '1 minute',10,true,13.7563,100.5018,150);
  INSERT INTO public.smart_attendance_qr_tokens SELECT session_id,opened_at,encode(extensions.digest('test-token','sha256'),'hex'),now()+interval '20 minutes' FROM public.smart_attendance_windows;
  INSERT INTO public.attendance_leave_requests VALUES (101,'${legacy}');
 `);
 const fixtureDir=process.env.ME_SMART_QR_FIXTURES;
 if(fixtureDir){
   await db.exec(fs.readFileSync(path.join(fixtureDir,'smart-checkin.sql'),'utf8'));
   await db.exec(fs.readFileSync(path.join(fixtureDir,'smart-checkin-v7.sql'),'utf8'));
 } else {
   await db.exec(`CREATE FUNCTION public.smart_checkin(p_session_id bigint,p_token text,p_lat double precision DEFAULT NULL,p_lng double precision DEFAULT NULL,p_accuracy double precision DEFAULT NULL) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'present'::text $$;
   CREATE FUNCTION public.smart_checkin_v7(p_session_id bigint,p_token text,p_lat double precision DEFAULT NULL,p_lng double precision DEFAULT NULL,p_accuracy double precision DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT jsonb_build_object('ok',true,'code','accepted_present','status','present','lat',p_lat,'lng',p_lng,'accuracy',p_accuracy) $$`);
 }
 async function asUser(id,role='authenticated'){
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);
 }
 async function qr(session,lat,lng,accuracy){return (await db.query('select public.smart_checkin_v7($1,$2,$3,$4,$5) as result',[session,'test-token',lat,lng,accuracy])).rows[0].result;}
 async function clearAttendance(){await db.exec('reset role; delete from public.attendance_records; delete from public.smart_attendance_attempts; delete from public.attendance_security_events;');}
 async function hook(fn,event){return (await db.query(`select public.${fn}($1::jsonb) as result`,[JSON.stringify(event)])).rows[0].result;}

 await asUser(valid);const beforeNoGps=await qr(101,null,null,null),beforeGps=await qr(102,13.7563,100.5018,5);
 assert.equal(beforeNoGps.ok,true);assert.equal(beforeGps.ok,true);
 await clearAttendance();await db.exec(schema);
 await asUser(valid);assert.deepEqual(await qr(101,null,null,null),beforeNoGps);assert.deepEqual(await qr(102,13.7563,100.5018,5),beforeGps);
 await clearAttendance();await asUser(valid);const outside=await qr(102,13.7663,100.5018,5);
 if(fixtureDir)assert.equal(outside.code,'outside_zone');
 assert.equal((await db.query('select count(*)::int as n from public.enrollments')).rows[0].n,2);

 await asUser(legacy);
 assert.equal((await db.query('select count(*)::int as n from public.enrollments')).rows[0].n,0,'legacy user cannot read enrollment data');
 for(const query of ["select * from public.my_courses()","select public.request_enrollment(1,'code')","select public.submit_leave_request(101,'leave','reason')","select public.smart_checkin_v7(101,'test-token',null,null,null)"])
   await assert.rejects(()=>db.query(query),/University email verification required/);
 await assert.rejects(()=>db.query("select me_smart_private.unguarded_smart_checkin_v7(101,'test-token',null,null,null)"),/permission denied/i);
 await assert.rejects(()=>db.query("select public.smart_checkin(101,'test-token',null,null,null)"),/permission denied/i);
 await asUser('', 'supabase_auth_admin');
 assert.deepEqual((await hook('me_smart_student_access_token_hook',{user_id:legacy,claims})).claims,claims,'legacy student can authenticate only to migrate email');

 await asUser(teacher);assert.equal((await db.query('select count(*)::int as n from public.enrollments')).rows[0].n,2,'teacher remains able to read');
 await asUser(unconfirmed);assert.equal((await db.query('select count(*)::int as n from public.enrollments')).rows[0].n,0,'unconfirmed students are blocked');
 await db.exec('reset role');
 await db.query('update auth.users set email=$1,email_confirmed_at=now() where id=$2',['665040300428@mail.rmutk.ac.th',legacy]);
 await asUser(legacy);assert.equal((await db.query('select count(*)::int as n from public.enrollments')).rows[0].n,2,'verified email unlocks original account');
 assert.equal((await db.query('select count(*)::int as n from public.attendance_leave_requests where student_id=$1',[legacy])).rows[0].n,1,'historical data remains linked to same user');

 await db.exec('reset role');await db.exec(`insert into auth.users values ('${outsider}','outside@example.org',now()); insert into public.profiles values ('${outsider}','student','66504030044-0');`);
 await db.exec('set role supabase_auth_admin');
 let response=await hook('me_smart_student_signup_hook',{user:{email:'665040300410@mail.rmutk.ac.th',user_metadata:{student_id:'66504030041-0'},app_metadata:{}}});
 assert.deepEqual(response,{});
 response=await hook('me_smart_student_signup_hook',{user:{email:'665040300410@gmail.com',user_metadata:{student_id:'66504030041-0'},app_metadata:{}}});
 assert.equal(response.error.http_code,403);
 response=await hook('me_smart_student_signup_hook',{user:{email:'teacher@example.org',app_metadata:{role:'teacher'}}});assert.deepEqual(response,{});
 response=await hook('me_smart_student_access_token_hook',{user_id:teacher,claims});assert.deepEqual(response.claims,claims);
 response=await hook('me_smart_student_access_token_hook',{user_id:legacy,claims});assert.deepEqual(response.claims,claims);
 response=await hook('me_smart_student_access_token_hook',{user_id:outsider,claims});assert.equal(response.error.http_code,403);
 await db.close();
 console.log(`PASS: signup identity, old account migration, teacher access, database guards and QR with/without GPS (${fixtureDir?'actual production functions':'simulated QR function'}).`);
}
run().catch(e=>{console.error(e);process.exitCode=1});
