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
 ELSIF p_token IS NULL OR length(p_token)>100 OR NOT EXISTS(SELECT 1 FROM public.smart_attendance_qr_tokens q WHERE q.session_id=p_session_id AND q.window_opened_at=w.opened_at AND q.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') AND clock_timestamp()<q.expires_at) THEN code='invalid_qr';
 ELSIF EXISTS(SELECT 1 FROM public.attendance_records WHERE session_id=p_session_id AND student_id=auth.uid()) THEN code='already_recorded';
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
   result=public.smart_checkin(p_session_id,p_token,p_lat,p_lng,p_accuracy);
   code='accepted_'||result;
  EXCEPTION WHEN OTHERS THEN code='server_rejected'; END;
 END IF;
 INSERT INTO public.attendance_security_events(session_id,student_id,outcome,distance_m,accuracy_m)
 VALUES(p_session_id,auth.uid(),code,d,CASE WHEN p_accuracy BETWEEN 0 AND 100 THEN p_accuracy ELSE NULL END);
 RETURN jsonb_build_object('ok',code IN ('accepted_present','accepted_late'),'code',code,'status',result);
END $function$
