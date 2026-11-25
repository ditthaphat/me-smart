-- Grouped attendance windows; the private roster is loaded separately.
ALTER TABLE public.smart_attendance_windows ADD COLUMN IF NOT EXISTS group_code text;
CREATE TABLE IF NOT EXISTS me_smart_private.course_group_roster (course_id bigint NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE, student_number text NOT NULL, group_code text NOT NULL CHECK (group_code IN ('afternoon','evening')), PRIMARY KEY (course_id,student_number));
REVOKE ALL ON me_smart_private.course_group_roster FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION me_smart_private.student_in_group(p_course bigint,p_user uuid,p_group text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN me_smart_private.course_group_roster r ON r.course_id=p_course AND r.student_number=pg_catalog.regexp_replace(p.student_id,'[^0-9]','','g') AND r.group_code=p_group WHERE p.id=p_user) $$;
REVOKE ALL ON FUNCTION me_smart_private.student_in_group(bigint,uuid,text) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.smart_start_window(p_session_id bigint, p_minutes integer DEFAULT 15, p_late_minutes integer DEFAULT 10, p_require_location boolean DEFAULT false, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius integer DEFAULT 150)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_teacher uuid;
    v_cancelled boolean;
    v_finalized_at timestamptz;
BEGIN
    -- ล็อกคาบเรียนและตรวจสอบเจ้าของรายวิชา
    SELECT c.teacher_id, s.is_cancelled
    INTO v_teacher, v_cancelled
    FROM public.attendance_sessions s
    JOIN public.courses c
      ON c.id = s.course_id
    WHERE s.id = p_session_id
    FOR UPDATE OF s;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Class session not found';
    END IF;

    IF auth.uid() IS NULL
       OR v_teacher IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    IF v_cancelled THEN
        RAISE EXCEPTION
            'Cannot open QR: class session is cancelled';
    END IF;

    -- ตรวจสอบว่าคาบเรียนถูกสรุปผลแล้วหรือไม่
    SELECT w.finalized_at
    INTO v_finalized_at
    FROM public.smart_attendance_windows w
    WHERE w.session_id = p_session_id
    FOR UPDATE;

    

    -- ตรวจสอบค่าที่อาจารย์กำหนด
    IF p_minutes NOT BETWEEN 1 AND 180
       OR p_late_minutes NOT BETWEEN 0 AND 180
       OR p_radius NOT BETWEEN 30 AND 2000 THEN
        RAISE EXCEPTION 'Invalid time or radius';
    END IF;

    IF p_require_location AND (
        p_lat IS NULL
        OR p_lng IS NULL
        OR p_lat NOT BETWEEN -90 AND 90
        OR p_lng NOT BETWEEN -180 AND 180
    ) THEN
        RAISE EXCEPTION
            'Valid classroom coordinates required';
    END IF;

    -- เปิด QR สำหรับคาบเรียนที่ยังไม่สรุปผล
    INSERT INTO public.smart_attendance_windows (
        session_id,
        teacher_id,
        is_open,
        opened_at,
        closes_at,
        late_after_minutes,
        require_location,
        latitude,
        longitude,
        radius_m,
        qr_hash,
        qr_expires_at,
        stopped_early_at,
        finalized_at
    )
    VALUES (
        p_session_id,
        v_teacher,
        true,
        now(),
        now() + make_interval(mins => p_minutes),
        p_late_minutes,
        p_require_location,
        p_lat,
        p_lng,
        p_radius,
        NULL,
        NULL,
        NULL,
        NULL
    )
    ON CONFLICT (session_id)
    DO UPDATE SET
        is_open = true,
        opened_at = now(),
        closes_at = EXCLUDED.closes_at,
        late_after_minutes = EXCLUDED.late_after_minutes,
        require_location = EXCLUDED.require_location,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        radius_m = EXCLUDED.radius_m,
        qr_hash = NULL,
        qr_expires_at = NULL,
        stopped_early_at = NULL, finalized_at = NULL, group_code = NULL,
        updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_smart_attendance(p_session_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_course_id bigint;
    v_inserted integer := 0;
    v_finalized_at timestamptz;
    v_group text;
BEGIN
    -- ล็อกคาบเรียน ป้องกันการสรุปพร้อมกัน
    SELECT s.course_id
    INTO v_course_id
    FROM public.attendance_sessions s
    WHERE s.id = p_session_id
      AND s.is_cancelled = false
    FOR UPDATE;

    IF v_course_id IS NULL THEN
        RAISE EXCEPTION 'Session not found or cancelled';
    END IF;

    -- ตรวจสอบว่ารอบ QR หมดเวลาแล้ว
    SELECT w.finalized_at, w.group_code
    INTO v_finalized_at, v_group
    FROM public.smart_attendance_windows w
    WHERE w.session_id = p_session_id
      AND w.opened_at IS NOT NULL
      AND w.closes_at IS NOT NULL
      AND w.closes_at <= now()
      AND w.stopped_early_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'QR not expired or stopped early';
    END IF;

    -- ป้องกันการสรุปซ้ำ
    IF v_finalized_at IS NOT NULL THEN
        RETURN 0;
    END IF;

    -- บันทึกขาดเฉพาะนักศึกษาที่ไม่มีผลเช็คชื่อ
    -- และไม่มีคำขอลาที่ pending หรือ approved
    INSERT INTO public.attendance_records (automatic_absence,
        session_id,
        student_id,
        status,
        note
    )
    SELECT
        true, p_session_id,
        e.student_id,
        'absent',
        'Automatic absence after QR window expired'
    FROM public.enrollments e
    WHERE e.course_id = v_course_id
      AND e.status = 'approved'
      AND (v_group IS NULL OR me_smart_private.student_in_group(v_course_id,e.student_id,v_group))
      AND NOT EXISTS (
          SELECT 1
          FROM public.attendance_records r
          WHERE r.session_id = p_session_id
            AND r.student_id = e.student_id
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.attendance_leave_requests lr
          WHERE lr.session_id = p_session_id
            AND lr.student_id = e.student_id
            AND lr.status IN ('pending', 'approved')
      )
    ON CONFLICT (session_id, student_id)
    DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    -- บันทึกว่าคาบนี้สรุปผลแล้ว
    UPDATE public.smart_attendance_windows
    SET finalized_at = now(),
        is_open = false,
        qr_hash = NULL,
        qr_expires_at = NULL,
        updated_at = now()
    WHERE session_id = p_session_id;

    RETURN v_inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION me_smart_private.smart_prepare_qr_checkin(p_session_id bigint, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  IF v_window.group_code IS NOT NULL AND NOT me_smart_private.student_in_group((SELECT course_id FROM public.attendance_sessions WHERE id=p_session_id),v_user,v_window.group_code) THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','wrong_group'); END IF;
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
  IF EXISTS (SELECT 1 FROM public.attendance_records WHERE session_id=p_session_id AND student_id=v_user AND NOT (automatic_absence AND status='absent' AND note='Automatic absence after QR window expired' AND NOT EXISTS (SELECT 1 FROM public.attendance_leave_requests lr WHERE lr.session_id=p_session_id AND lr.student_id=auth.uid() AND lr.status IN ('pending','approved')))) THEN
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

CREATE OR REPLACE FUNCTION public.smart_checkin_v7(p_session_id bigint, p_token text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_accuracy double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w public.smart_attendance_windows%rowtype; d double precision; result text; code text; cancelled boolean;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'code','sign_in'); END IF;
 -- Only approved members may generate events; do not reveal another course's data.
 SELECT s.is_cancelled INTO cancelled FROM public.attendance_sessions s JOIN public.enrollments e ON e.course_id=s.course_id
 WHERE s.id=p_session_id AND e.student_id=auth.uid() AND e.status='approved' FOR UPDATE OF s;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','not_enrolled'); END IF;
 SELECT * INTO w FROM public.smart_attendance_windows WHERE session_id=p_session_id FOR UPDATE;
 IF cancelled THEN code='cancelled';
 ELSIF w.session_id IS NULL OR NOT w.is_open OR clock_timestamp()>=w.closes_at THEN code='closed';
 ELSIF w.group_code IS NOT NULL AND NOT me_smart_private.student_in_group((SELECT course_id FROM public.attendance_sessions WHERE id=p_session_id),auth.uid(),w.group_code) THEN code='wrong_group';
 ELSIF p_token IS NULL OR length(p_token)>100 OR NOT EXISTS(SELECT 1 FROM public.smart_attendance_qr_tokens q WHERE q.session_id=p_session_id AND q.window_opened_at=w.opened_at AND q.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') AND clock_timestamp()<q.expires_at) THEN code='invalid_qr';
 ELSIF EXISTS(SELECT 1 FROM public.attendance_records WHERE session_id=p_session_id AND student_id=auth.uid() AND NOT (automatic_absence AND status='absent' AND note='Automatic absence after QR window expired' AND NOT EXISTS (SELECT 1 FROM public.attendance_leave_requests lr WHERE lr.session_id=p_session_id AND lr.student_id=auth.uid() AND lr.status IN ('pending','approved')))) THEN code='already_recorded';
 ELSIF w.require_location THEN
  IF p_lat IS NULL OR p_lng IS NULL OR p_accuracy IS NULL OR NOT(p_lat BETWEEN -90 AND 90) OR NOT(p_lng BETWEEN -180 AND 180) OR NOT(p_accuracy BETWEEN 0 AND 100) THEN code='location_unavailable';
  ELSE
   d=6371000*2*asin(sqrt(least(1,power(sin(radians(p_lat-w.latitude)/2),2)+cos(radians(w.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-w.longitude)/2),2))));
   IF d-p_accuracy>w.radius_m THEN code='outside_zone';
   ELSIF d+p_accuracy>w.radius_m THEN code='location_uncertain'; END IF;
  END IF;
 END IF;
 IF code IS NULL THEN
  -- Inner subtransaction rolls back failed writes; event below survives a normal rejection.
  BEGIN
   DELETE FROM public.attendance_records WHERE session_id=p_session_id AND student_id=auth.uid() AND automatic_absence AND status='absent' AND note='Automatic absence after QR window expired' AND NOT EXISTS (SELECT 1 FROM public.attendance_leave_requests lr WHERE lr.session_id=p_session_id AND lr.student_id=auth.uid() AND lr.status IN ('pending','approved')); result=public.smart_checkin(p_session_id,p_token,p_lat,p_lng,p_accuracy);
   code='accepted_'||result;
  EXCEPTION WHEN OTHERS THEN code='server_rejected'; END;
 END IF;
 INSERT INTO public.attendance_security_events(session_id,student_id,outcome,distance_m,accuracy_m)
 VALUES(p_session_id,auth.uid(),code,d,CASE WHEN p_accuracy BETWEEN 0 AND 100 THEN p_accuracy ELSE NULL END);
 RETURN jsonb_build_object('ok',code IN ('accepted_present','accepted_late'),'code',code,'status',result);
END $function$;

REVOKE ALL ON FUNCTION public.smart_start_window(bigint,integer,integer,boolean,double precision,double precision,integer) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.smart_start_group_window(p_session_id bigint,p_minutes integer,p_late_minutes integer,p_require_location boolean,p_lat double precision,p_lng double precision,p_radius integer,p_group text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE cid bigint; BEGIN SELECT course_id INTO cid FROM public.attendance_sessions WHERE id=p_session_id; IF cid=1 AND (p_group IS NULL OR p_group NOT IN ('afternoon','evening')) THEN RAISE EXCEPTION 'Please select class group'; END IF; IF cid IS DISTINCT FROM 1 AND p_group IS NOT NULL THEN RAISE EXCEPTION 'Invalid class group'; END IF; PERFORM public.smart_start_window(p_session_id,p_minutes,p_late_minutes,p_require_location,p_lat,p_lng,p_radius); UPDATE public.smart_attendance_windows SET group_code=p_group WHERE session_id=p_session_id; END $$;
REVOKE ALL ON FUNCTION public.smart_start_group_window(bigint,integer,integer,boolean,double precision,double precision,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.smart_start_group_window(bigint,integer,integer,boolean,double precision,double precision,integer,text) TO authenticated;

