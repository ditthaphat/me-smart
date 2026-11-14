-- The existing delete_attendance_session() guard is intentionally unchanged.
-- Privileged functions are in a schema that is not exposed through the Data API.
CREATE SCHEMA me_smart_private;
REVOKE ALL ON SCHEMA me_smart_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA me_smart_private TO authenticated;

CREATE OR REPLACE FUNCTION me_smart_private.cancelled_session_delete_summary(p_session_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session record;
BEGIN
  SELECT s.id, s.course_id, s.session_date, s.topic, s.is_cancelled, c.code
    INTO v_session
    FROM public.attendance_sessions AS s
    JOIN public.courses AS c ON c.id = s.course_id
   WHERE s.id = p_session_id
     AND auth.uid() IS NOT NULL
     AND c.teacher_id = auth.uid()
     AND EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'teacher');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคาบเรียนหรือไม่มีสิทธิ์จัดการคาบนี้';
  END IF;
  IF v_session.is_cancelled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ต้องยกเลิกคาบเรียนก่อนจึงจะลบถาวรได้';
  END IF;
  IF EXISTS (SELECT 1 FROM public.smart_attendance_windows AS w
              WHERE w.session_id = p_session_id AND w.is_open IS TRUE) THEN
    RAISE EXCEPTION 'กรุณาปิดรับ QR ก่อนลบคาบเรียน';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'session_id', v_session.id,
    'course_id', v_session.course_id,
    'course_code', v_session.code,
    'session_date', v_session.session_date,
    'topic', v_session.topic,
    'attendance_records', (SELECT pg_catalog.count(*) FROM public.attendance_records WHERE session_id = p_session_id),
    'qr_windows', (SELECT pg_catalog.count(*) FROM public.smart_attendance_windows WHERE session_id = p_session_id),
    'qr_tokens', (SELECT pg_catalog.count(*) FROM public.smart_attendance_qr_tokens WHERE session_id = p_session_id),
    'qr_attempts', (SELECT pg_catalog.count(*) FROM public.smart_attendance_attempts WHERE session_id = p_session_id),
    'security_events', (SELECT pg_catalog.count(*) FROM public.attendance_security_events WHERE session_id = p_session_id),
    'leave_requests', (SELECT pg_catalog.count(*) FROM public.attendance_leave_requests WHERE session_id = p_session_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION me_smart_private.delete_cancelled_session_permanently(
  p_session_id bigint,
  p_confirmation text,
  p_expected_summary jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_summary jsonb;
BEGIN
  -- Lock the parent before re-checking the owner, status and dependent counts.
  PERFORM s.id
    FROM public.attendance_sessions AS s
    JOIN public.courses AS c ON c.id = s.course_id
   WHERE s.id = p_session_id
     AND auth.uid() IS NOT NULL
     AND c.teacher_id = auth.uid()
     AND EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'teacher')
   FOR UPDATE OF s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคาบเรียนหรือไม่มีสิทธิ์จัดการคาบนี้';
  END IF;

  IF p_confirmation IS DISTINCT FROM p_session_id::text THEN
    RAISE EXCEPTION 'หมายเลขคาบที่ยืนยันไม่ตรงกัน';
  END IF;
  v_current_summary := me_smart_private.cancelled_session_delete_summary(p_session_id);
  IF p_expected_summary IS DISTINCT FROM v_current_summary THEN
    RAISE EXCEPTION 'ข้อมูลคาบมีการเปลี่ยนแปลง กรุณาตรวจสอบรายการอีกครั้งก่อนลบ';
  END IF;

  -- Child records are removed by the existing foreign-key cascades.
  DELETE FROM public.attendance_sessions WHERE id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION me_smart_private.cancelled_session_delete_summary(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION me_smart_private.delete_cancelled_session_permanently(bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION me_smart_private.cancelled_session_delete_summary(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION me_smart_private.delete_cancelled_session_permanently(bigint, text, jsonb) TO authenticated;

-- API-callable wrappers run as the caller; the private functions verify identity and ownership.
CREATE OR REPLACE FUNCTION public.cancelled_session_delete_summary(p_session_id bigint)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT me_smart_private.cancelled_session_delete_summary(p_session_id);
$$;
CREATE OR REPLACE FUNCTION public.delete_cancelled_session_permanently(
  p_session_id bigint, p_confirmation text, p_expected_summary jsonb
)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT me_smart_private.delete_cancelled_session_permanently(p_session_id, p_confirmation, p_expected_summary);
$$;
REVOKE ALL ON FUNCTION public.cancelled_session_delete_summary(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_cancelled_session_permanently(bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelled_session_delete_summary(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_cancelled_session_permanently(bigint, text, jsonb) TO authenticated;
