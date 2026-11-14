-- Draft for review and isolated testing only.  It must not be applied until
-- email confirmation and delivery are verified and both Auth hooks are configured.
-- Existing student accounts retain their user IDs; nonconforming accounts are
-- permitted to authenticate only so they can change their email, while all
-- course, attendance and leave access is denied by database guards.

CREATE OR REPLACE FUNCTION me_smart_private.expected_student_email(p_student_id text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN pg_catalog.btrim(p_student_id) ~ '^[0-9]+(-[0-9]+)?$'
    THEN pg_catalog.replace(pg_catalog.btrim(p_student_id), '-', '') || '@mail.rmutk.ac.th'
    ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION me_smart_private.expected_student_email(text) FROM PUBLIC, anon, authenticated;

CREATE TABLE me_smart_private.student_email_migration_allowlist (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE me_smart_private.student_email_migration_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE me_smart_private.student_email_migration_allowlist FROM PUBLIC, anon, authenticated;
INSERT INTO me_smart_private.student_email_migration_allowlist(user_id)
SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.role='student' AND (u.email_confirmed_at IS NULL OR
       pg_catalog.lower(u.email) IS DISTINCT FROM me_smart_private.expected_student_email(p.student_id));

CREATE OR REPLACE FUNCTION me_smart_private.current_user_institutional_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT CASE WHEN p.role='teacher' THEN true
    WHEN p.role='student' THEN u.email_confirmed_at IS NOT NULL AND
      pg_catalog.lower(u.email)=me_smart_private.expected_student_email(p.student_id)
    ELSE false END FROM public.profiles p JOIN auth.users u ON u.id=p.id
    WHERE p.id=auth.uid()), false);
$$;
REVOKE ALL ON FUNCTION me_smart_private.current_user_institutional_access() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION me_smart_private.current_user_institutional_access() TO authenticated;

-- Students can still read their own profile in order to change their email.
CREATE POLICY institutional_access_enrollments ON public.enrollments AS RESTRICTIVE
  FOR SELECT TO authenticated USING ((SELECT me_smart_private.current_user_institutional_access()));
CREATE POLICY institutional_access_sessions ON public.attendance_sessions AS RESTRICTIVE
  FOR SELECT TO authenticated USING ((SELECT me_smart_private.current_user_institutional_access()));
CREATE POLICY institutional_access_records ON public.attendance_records AS RESTRICTIVE
  FOR SELECT TO authenticated USING ((SELECT me_smart_private.current_user_institutional_access()));
CREATE POLICY institutional_access_leave ON public.attendance_leave_requests AS RESTRICTIVE
  FOR SELECT TO authenticated USING ((SELECT me_smart_private.current_user_institutional_access()));

-- Preserve the original RPC implementations, keeping them inaccessible to API users.
ALTER FUNCTION public.my_courses() SET SCHEMA me_smart_private;
ALTER FUNCTION me_smart_private.my_courses() RENAME TO unguarded_my_courses_v1;
ALTER FUNCTION public.request_enrollment(bigint,text) SET SCHEMA me_smart_private;
ALTER FUNCTION me_smart_private.request_enrollment(bigint,text) RENAME TO unguarded_request_enrollment_v1;
ALTER FUNCTION public.submit_leave_request(bigint,text,text) SET SCHEMA me_smart_private;
ALTER FUNCTION me_smart_private.submit_leave_request(bigint,text,text) RENAME TO unguarded_submit_leave_request_v1;
ALTER FUNCTION public.smart_checkin_v7(bigint,text,double precision,double precision,double precision) SET SCHEMA me_smart_private;
ALTER FUNCTION me_smart_private.smart_checkin_v7(bigint,text,double precision,double precision,double precision) RENAME TO unguarded_smart_checkin_v7;
REVOKE ALL ON FUNCTION me_smart_private.unguarded_my_courses_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION me_smart_private.unguarded_request_enrollment_v1(bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION me_smart_private.unguarded_submit_leave_request_v1(bigint,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION me_smart_private.unguarded_smart_checkin_v7(bigint,text,double precision,double precision,double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.smart_checkin(bigint,text,double precision,double precision,double precision) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION me_smart_private.require_institutional_access()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT me_smart_private.current_user_institutional_access() THEN
    RAISE EXCEPTION 'University email verification required';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION me_smart_private.require_institutional_access() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION me_smart_private.guarded_my_courses()
RETURNS TABLE(id bigint,code text,title text,term text,status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM me_smart_private.require_institutional_access();
 RETURN QUERY SELECT * FROM me_smart_private.unguarded_my_courses_v1(); END;
$$;
CREATE OR REPLACE FUNCTION me_smart_private.guarded_request_enrollment(p_course_id bigint,p_join_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM me_smart_private.require_institutional_access();
 RETURN me_smart_private.unguarded_request_enrollment_v1(p_course_id,p_join_code); END;
$$;
CREATE OR REPLACE FUNCTION me_smart_private.guarded_submit_leave_request(p_session_id bigint,p_leave_type text,p_reason text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM me_smart_private.require_institutional_access();
 RETURN me_smart_private.unguarded_submit_leave_request_v1(p_session_id,p_leave_type,p_reason); END;
$$;
CREATE OR REPLACE FUNCTION me_smart_private.guarded_smart_checkin_v7(p_session_id bigint,p_token text,p_lat double precision,p_lng double precision,p_accuracy double precision)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM me_smart_private.require_institutional_access();
 RETURN me_smart_private.unguarded_smart_checkin_v7(p_session_id,p_token,p_lat,p_lng,p_accuracy); END;
$$;
REVOKE ALL ON FUNCTION me_smart_private.guarded_my_courses() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION me_smart_private.guarded_request_enrollment(bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION me_smart_private.guarded_submit_leave_request(bigint,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION me_smart_private.guarded_smart_checkin_v7(bigint,text,double precision,double precision,double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION me_smart_private.guarded_my_courses() TO authenticated;
GRANT EXECUTE ON FUNCTION me_smart_private.guarded_request_enrollment(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION me_smart_private.guarded_submit_leave_request(bigint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION me_smart_private.guarded_smart_checkin_v7(bigint,text,double precision,double precision,double precision) TO authenticated;

CREATE FUNCTION public.my_courses() RETURNS TABLE(id bigint,code text,title text,term text,status text)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT * FROM me_smart_private.guarded_my_courses(); $$;
CREATE FUNCTION public.request_enrollment(p_course_id bigint,p_join_code text) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT me_smart_private.guarded_request_enrollment(p_course_id,p_join_code); $$;
CREATE FUNCTION public.submit_leave_request(p_session_id bigint,p_leave_type text,p_reason text) RETURNS bigint
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT me_smart_private.guarded_submit_leave_request(p_session_id,p_leave_type,p_reason); $$;
CREATE FUNCTION public.smart_checkin_v7(p_session_id bigint,p_token text,p_lat double precision DEFAULT NULL,p_lng double precision DEFAULT NULL,p_accuracy double precision DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT me_smart_private.guarded_smart_checkin_v7(p_session_id,p_token,p_lat,p_lng,p_accuracy); $$;
REVOKE ALL ON FUNCTION public.my_courses() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_enrollment(bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_leave_request(bigint,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.smart_checkin_v7(bigint,text,double precision,double precision,double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_courses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_enrollment(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_leave_request(bigint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.smart_checkin_v7(bigint,text,double precision,double precision,double precision) TO authenticated;

-- Auth hooks: public invoker entry points can be called only by Supabase Auth.
CREATE OR REPLACE FUNCTION me_smart_private.student_signup_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email text := pg_catalog.lower(pg_catalog.btrim(event->'user'->>'email'));
  v_student_id text := event->'user'->'user_metadata'->>'student_id';
BEGIN
  -- app_metadata is only set by trusted admin operations, never by sign-up metadata.
  IF event->'user'->'app_metadata'->>'role'='teacher' THEN RETURN '{}'::jsonb; END IF;
  IF v_email IS NOT NULL AND v_email=me_smart_private.expected_student_email(v_student_id) THEN RETURN '{}'::jsonb; END IF;
  RETURN pg_catalog.jsonb_build_object('error',pg_catalog.jsonb_build_object('http_code',403,'message','อีเมลต้องเป็นรหัสนักศึกษาโดยไม่ใส่ขีด ตามด้วย @mail.rmutk.ac.th'));
END;
$$;
CREATE OR REPLACE FUNCTION me_smart_private.student_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_role text; v_email text; v_student_id text; v_confirmed timestamptz;
BEGIN
  v_id := (event->>'user_id')::uuid;
  SELECT p.role,u.email,p.student_id,u.email_confirmed_at INTO v_role,v_email,v_student_id,v_confirmed
    FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=v_id;
  IF v_role='teacher' OR (v_role='student' AND v_confirmed IS NOT NULL AND
      pg_catalog.lower(v_email)=me_smart_private.expected_student_email(v_student_id)) OR
      (v_role='student' AND EXISTS (SELECT 1 FROM me_smart_private.student_email_migration_allowlist a WHERE a.user_id=v_id)) THEN
    RETURN pg_catalog.jsonb_build_object('claims',event->'claims');
  END IF;
  RETURN pg_catalog.jsonb_build_object('error',pg_catalog.jsonb_build_object('http_code',403,'message','กรุณายืนยันอีเมลมหาวิทยาลัยก่อนเข้าสู่ระบบ'));
END;
$$;
REVOKE ALL ON FUNCTION me_smart_private.student_signup_hook(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION me_smart_private.student_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA me_smart_private TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION me_smart_private.student_signup_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION me_smart_private.student_access_token_hook(jsonb) TO supabase_auth_admin;
CREATE FUNCTION public.me_smart_student_signup_hook(event jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT me_smart_private.student_signup_hook(event); $$;
CREATE FUNCTION public.me_smart_student_access_token_hook(event jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT me_smart_private.student_access_token_hook(event); $$;
REVOKE ALL ON FUNCTION public.me_smart_student_signup_hook(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.me_smart_student_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.me_smart_student_signup_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.me_smart_student_access_token_hook(jsonb) TO supabase_auth_admin;
