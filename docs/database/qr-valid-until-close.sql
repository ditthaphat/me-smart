-- QR links and student claims are valid only within the teacher's open window.
-- Existing enrollment, cancellation, duplicate, GPS and audit checks remain in
-- the existing prepare/finish and V7 functions. Closing or reopening a window
-- invalidates its old QR links and claims.

CREATE OR REPLACE FUNCTION public.smart_rotate_qr(p_session_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_w public.smart_attendance_windows%rowtype;
  v_token text;
BEGIN
  -- Keep the existing lock order and verify the course owner.
  PERFORM 1 FROM public.attendance_sessions s
    JOIN public.courses c ON c.id=s.course_id
    WHERE s.id=p_session_id AND c.teacher_id=auth.uid() AND NOT s.is_cancelled
    FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized or class cancelled'; END IF;
  SELECT * INTO v_w FROM public.smart_attendance_windows
    WHERE session_id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_w.teacher_id IS DISTINCT FROM auth.uid() OR NOT EXISTS(
    SELECT 1 FROM public.attendance_sessions s JOIN public.courses c ON c.id=s.course_id
    WHERE s.id=p_session_id AND c.teacher_id=auth.uid()
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT v_w.is_open OR clock_timestamp()>=v_w.closes_at THEN
    RAISE EXCEPTION 'Attendance window closed';
  END IF;
  v_token := pg_catalog.gen_random_uuid()::text || '-' || pg_catalog.gen_random_uuid()::text;
  UPDATE public.smart_attendance_windows
    SET qr_hash=encode(extensions.digest(v_token,'sha256'),'hex'),
        qr_expires_at=closes_at, updated_at=clock_timestamp()
    WHERE session_id=p_session_id;
  RETURN v_token;
END
$function$;

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
  v_expires := v_window.closes_at;
  DELETE FROM me_smart_private.qr_checkin_claims
  WHERE session_id=p_session_id AND expires_at<=clock_timestamp();
  INSERT INTO me_smart_private.qr_checkin_claims(session_id,student_id,window_opened_at,claim_hash,expires_at)
  VALUES(p_session_id,v_user,v_window.opened_at,encode(extensions.digest(v_claim,'sha256'),'hex'),v_expires)
  ON CONFLICT (session_id,student_id) DO UPDATE
    SET window_opened_at=EXCLUDED.window_opened_at,claim_hash=EXCLUDED.claim_hash,expires_at=EXCLUDED.expires_at;

  RETURN pg_catalog.jsonb_build_object('ok',true,'claim',v_claim,'expires_at',v_expires);
END
$function$;

