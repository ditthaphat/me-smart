CREATE OR REPLACE FUNCTION public.smart_checkin(p_session_id bigint, p_token text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_accuracy double precision DEFAULT NULL::double precision)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_w public.smart_attendance_windows%rowtype;
    v_course bigint;
    v_cancelled boolean;
    v_dist double precision;
    v_status text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Please sign in';
    END IF;

    SELECT course_id, is_cancelled
    INTO v_course, v_cancelled
    FROM public.attendance_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Class session not found';
    END IF;

    IF v_cancelled THEN
        RAISE EXCEPTION 'Check-in denied: class session is cancelled';
    END IF;

    IF NOT EXISTS(
        SELECT 1
        FROM public.enrollments
        WHERE course_id = v_course
          AND student_id = auth.uid()
          AND status = 'approved'
    ) THEN
        RAISE EXCEPTION 'Not enrolled in this course';
    END IF;

    SELECT *
    INTO v_w
    FROM public.smart_attendance_windows
    WHERE session_id = p_session_id
    FOR UPDATE;

    IF NOT FOUND
       OR NOT v_w.is_open
       OR now() >= v_w.closes_at THEN
        RAISE EXCEPTION 'Check-in closed';
    END IF;

    IF p_token IS NULL
       OR length(p_token) > 100
       OR NOT EXISTS (
           SELECT 1 FROM public.smart_attendance_qr_tokens q
           WHERE q.session_id = p_session_id
             AND q.window_opened_at = v_w.opened_at
             AND q.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
             AND clock_timestamp() < q.expires_at
       ) THEN
        RAISE EXCEPTION 'QR expired or invalid';
    END IF;

    IF v_w.require_location THEN
        IF p_lat IS NULL OR p_lng IS NULL
           OR p_accuracy IS NULL
           OR p_lat NOT BETWEEN -90 AND 90
           OR p_lng NOT BETWEEN -180 AND 180
           OR p_accuracy < 0
           OR p_accuracy > 100 THEN
            RAISE EXCEPTION
                'Location unavailable or accuracy too low; ask teacher to verify';
        END IF;

        v_dist = 6371000 * 2 * asin(
            sqrt(
                least(
                    1,
                    power(sin(radians(p_lat-v_w.latitude)/2),2)
                    + cos(radians(v_w.latitude))
                    * cos(radians(p_lat))
                    * power(sin(radians(p_lng-v_w.longitude)/2),2)
                )
            )
        );

        IF v_dist > v_w.radius_m + p_accuracy THEN
            RAISE EXCEPTION
                'Outside classroom zone; ask teacher to verify';
        END IF;
    END IF;

    IF EXISTS(
        SELECT 1
        FROM public.attendance_records
        WHERE session_id = p_session_id
          AND student_id = auth.uid()
    ) THEN
        RAISE EXCEPTION
            'Attendance already recorded; ask teacher if correction needed';
    END IF;

    v_status = CASE
        WHEN now() > v_w.opened_at
            + make_interval(mins => v_w.late_after_minutes)
        THEN 'late'
        ELSE 'present'
    END;

    INSERT INTO public.attendance_records(
        session_id, student_id, status, note
    )
    VALUES(
        p_session_id, auth.uid(),
        v_status, 'Smart QR self check-in'
    );

    INSERT INTO public.smart_attendance_attempts(
        session_id, student_id, outcome
    )
    VALUES(
        p_session_id, auth.uid(),
        'accepted_' || v_status
    );

    RETURN v_status;
END;
$function$
