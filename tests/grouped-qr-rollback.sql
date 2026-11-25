DO $test$
DECLARE cid bigint:=1; t uuid; sid bigint; a uuid; b uuid; an text; bn text; tok text; result jsonb;
BEGIN
 SELECT teacher_id INTO t FROM public.courses WHERE id=cid;
 SELECT e.student_id,regexp_replace(p.student_id,'[^0-9]','','g') INTO a,an FROM public.enrollments e JOIN public.profiles p ON p.id=e.student_id WHERE e.course_id=cid AND e.status='approved' AND p.student_id IS NOT NULL LIMIT 1;
 SELECT e.student_id,regexp_replace(p.student_id,'[^0-9]','','g') INTO b,bn FROM public.enrollments e JOIN public.profiles p ON p.id=e.student_id WHERE e.course_id=cid AND e.status='approved' AND regexp_replace(p.student_id,'[^0-9]','','g')<>an LIMIT 1;
 IF t IS NULL OR a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'Missing test identities'; END IF;
 INSERT INTO me_smart_private.course_group_roster VALUES (cid,an,'afternoon'),(cid,bn,'evening') ON CONFLICT(course_id,student_number) DO UPDATE SET group_code=excluded.group_code;
 INSERT INTO public.attendance_sessions(course_id,session_date,topic) VALUES(cid,current_date,'rolled-back group test') RETURNING id INTO sid;
 PERFORM set_config('request.jwt.claim.sub',t::text,true);PERFORM set_config('request.jwt.claims',json_build_object('sub',t,'role','authenticated')::text,true);
 PERFORM public.smart_start_group_window(sid,30,20,false,null,null,150,'afternoon');tok:=public.smart_rotate_qr(sid);
 PERFORM set_config('request.jwt.claim.sub',b::text,true);PERFORM set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 result:=public.smart_prepare_qr_checkin(sid,tok);IF result->>'code'<>'wrong_group' THEN RAISE EXCEPTION 'wrong group accepted %',result;END IF;
 UPDATE public.smart_attendance_windows SET closes_at=now()-interval '1 sec' WHERE session_id=sid;
 PERFORM public.finalize_smart_attendance(sid);
 IF NOT EXISTS(SELECT 1 FROM public.attendance_records WHERE session_id=sid AND student_id=a AND status='absent') THEN RAISE EXCEPTION 'afternoon absence missing';END IF;
 IF EXISTS(SELECT 1 FROM public.attendance_records WHERE session_id=sid AND student_id=b) THEN RAISE EXCEPTION 'evening marked early'; END IF;
 PERFORM set_config('request.jwt.claim.sub',t::text,true);PERFORM set_config('request.jwt.claims',json_build_object('sub',t,'role','authenticated')::text,true);
 PERFORM public.smart_start_group_window(sid,30,20,false,null,null,150,'evening');tok:=public.smart_rotate_qr(sid);
 PERFORM set_config('request.jwt.claim.sub',b::text,true);PERFORM set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 result:=public.smart_prepare_qr_checkin(sid,tok);IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'evening prepare %',result;END IF;
 result:=public.smart_finish_qr_checkin(sid,result->>'claim',null,null,null);IF result->>'code'<>'accepted_present' THEN RAISE EXCEPTION 'evening checkin %',result;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.attendance_records WHERE session_id=sid AND student_id=a AND status='absent') THEN RAISE EXCEPTION 'afternoon changed';END IF;
END $test$;
