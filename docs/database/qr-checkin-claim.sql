-- The rotating QR is still verified against the current window and its original
-- 30-second expiry. A separate, short-lived claim is bound to the authenticated
-- student so GPS acquisition can finish after that QR has rotated.
CREATE TABLE IF NOT EXISTS me_smart_private.qr_checkin_claims (
  session_id bigint NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  window_opened_at timestamptz NOT NULL,
  claim_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (session_id, student_id)
);
REVOKE ALL ON TABLE me_smart_private.qr_checkin_claims FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION me_smart_private.smart_prepare_qr_checkin(p_session_id bigint, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_cancelled boolean;
  v_window public.smart_attendance_windows%rowtype;
  v_claim text;
  v_expires timestamptz;
BEGIN
  IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','sign_in'); END IF;

  -- Preparation only reads the current window. Completion rechecks membership,
  -- cancellation and window state under locks before writing attendance.
  SELECT s.is_cancelled INTO v_cancelled
  FROM public.attendance_sessions s
  JOIN public.enrollments e ON e.course_id=s.course_id
  WHERE s.id=p_session_id AND e.student_id=v_user AND e.status='approved';
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','not_enrolled'); END IF;

  SELECT * INTO v_window FROM public.smart_attendance_windows WHERE session_id=p_session_id;
  IF v_cancelled THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','cancelled'); END IF;
  IF v_window.session_id IS NULL OR NOT v_window.is_open OR clock_timestamp()>=v_window.closes_at THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','closed');
  END IF;
  IF p_token IS NULL OR length(p_token)>100 OR NOT EXISTS (
    SELECT 1 FROM public.smart_attendance_qr_tokens q
    WHERE q.session_id=p_session_id AND q.window_opened_at=v_window.opened_at
      AND q.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      AND clock_timestamp()<q.expires_at
  ) THEN
    INSERT INTO public.attendance_security_events(session_id,student_id,outcome)
    VALUES(p_session_id,v_user,'invalid_qr');
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','invalid_qr');
  END IF;
  IF EXISTS (SELECT 1 FROM public.attendance_records WHERE session_id=p_session_id AND student_id=v_user) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','already_recorded');
  END IF;

  v_claim := pg_catalog.gen_random_uuid()::text || '-' || pg_catalog.gen_random_uuid()::text;
  v_expires := LEAST(clock_timestamp()+interval '90 seconds',v_window.closes_at);
  DELETE FROM me_smart_private.qr_checkin_claims
  WHERE session_id=p_session_id AND expires_at<=clock_timestamp();
  INSERT INTO me_smart_private.qr_checkin_claims(session_id,student_id,window_opened_at,claim_hash,expires_at)
  VALUES(p_session_id,v_user,v_window.opened_at,encode(extensions.digest(v_claim,'sha256'),'hex'),v_expires)
  ON CONFLICT (session_id,student_id) DO UPDATE
    SET window_opened_at=EXCLUDED.window_opened_at,claim_hash=EXCLUDED.claim_hash,expires_at=EXCLUDED.expires_at;

  RETURN pg_catalog.jsonb_build_object('ok',true,'claim',v_claim,'expires_at',v_expires);
END
$function$;

CREATE OR REPLACE FUNCTION me_smart_private.smart_finish_qr_checkin(
  p_session_id bigint, p_claim text,
  p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL,
  p_accuracy double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_cancelled boolean;
  v_window public.smart_attendance_windows%rowtype;
  v_claim me_smart_private.qr_checkin_claims%rowtype;
  v_hash text;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','sign_in'); END IF;
  SELECT s.is_cancelled INTO v_cancelled
  FROM public.attendance_sessions s
  JOIN public.enrollments e ON e.course_id=s.course_id
  WHERE s.id=p_session_id AND e.student_id=v_user AND e.status='approved'
  FOR UPDATE OF s;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','not_enrolled'); END IF;

  SELECT * INTO v_window FROM public.smart_attendance_windows WHERE session_id=p_session_id FOR UPDATE;
  IF v_cancelled THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','cancelled'); END IF;
  IF v_window.session_id IS NULL OR NOT v_window.is_open OR clock_timestamp()>=v_window.closes_at THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','closed');
  END IF;
  IF p_claim IS NULL OR length(p_claim)>100 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','invalid_claim');
  END IF;
  v_hash := encode(extensions.digest(p_claim,'sha256'),'hex');
  SELECT * INTO v_claim FROM me_smart_private.qr_checkin_claims c
  WHERE c.session_id=p_session_id AND c.student_id=v_user
    AND c.window_opened_at=v_window.opened_at AND c.claim_hash=v_hash
  FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','invalid_claim'); END IF;
  IF clock_timestamp()>=v_claim.expires_at THEN
    DELETE FROM me_smart_private.qr_checkin_claims WHERE session_id=p_session_id AND student_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','claim_expired');
  END IF;

  -- This temporary token exists only inside the transaction. Reuse the current
  -- V7 policy unchanged, including enrollment, location, status and audit checks.
  INSERT INTO public.smart_attendance_qr_tokens(session_id,window_opened_at,token_hash,expires_at)
  VALUES(p_session_id,v_window.opened_at,v_hash,v_claim.expires_at);
  v_result := public.smart_checkin_v7(p_session_id,p_claim,p_lat,p_lng,p_accuracy);
  DELETE FROM public.smart_attendance_qr_tokens WHERE session_id=p_session_id AND token_hash=v_hash;
  IF v_result->>'ok'='true' OR v_result->>'code'='already_recorded' THEN
    DELETE FROM me_smart_private.qr_checkin_claims WHERE session_id=p_session_id AND student_id=v_user;
  END IF;
  RETURN v_result;
END
$function$;

-- The public API wrappers run as the caller. The privileged implementation is
-- in a non-exposed schema and verifies the signed-in user and course membership.
CREATE OR REPLACE FUNCTION public.smart_prepare_qr_checkin(p_session_id bigint,p_token text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT me_smart_private.smart_prepare_qr_checkin(p_session_id,p_token);
$function$;
CREATE OR REPLACE FUNCTION public.smart_finish_qr_checkin(
  p_session_id bigint,p_claim text,p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,p_accuracy double precision DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT me_smart_private.smart_finish_qr_checkin(p_session_id,p_claim,p_lat,p_lng,p_accuracy);
$function$;

REVOKE ALL ON FUNCTION me_smart_private.smart_prepare_qr_checkin(bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION me_smart_private.smart_finish_qr_checkin(bigint,text,double precision,double precision,double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.smart_prepare_qr_checkin(bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.smart_finish_qr_checkin(bigint,text,double precision,double precision,double precision) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA me_smart_private TO authenticated;
GRANT EXECUTE ON FUNCTION me_smart_private.smart_prepare_qr_checkin(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION me_smart_private.smart_finish_qr_checkin(bigint,text,double precision,double precision,double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.smart_prepare_qr_checkin(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.smart_finish_qr_checkin(bigint,text,double precision,double precision,double precision) TO authenticated;
