-- Approved students can read only their own gradebook marks.
-- Teacher write policies remain unchanged. Archived items and their marks
-- are not shown to students.
CREATE POLICY gradebook_settings_student_read
ON public.gradebook_settings FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.enrollments e
          WHERE e.course_id=gradebook_settings.course_id
            AND e.student_id=(SELECT auth.uid()) AND e.status='approved')
);

CREATE POLICY gradebook_items_student_read
ON public.gradebook_items FOR SELECT TO authenticated
USING (
  NOT is_archived
  AND EXISTS (SELECT 1 FROM public.enrollments e
              WHERE e.course_id=gradebook_items.course_id
                AND e.student_id=(SELECT auth.uid()) AND e.status='approved')
);

CREATE POLICY gradebook_marks_student_read
ON public.gradebook_marks FOR SELECT TO authenticated
USING (
  student_id=(SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.enrollments e
              WHERE e.course_id=gradebook_marks.course_id
                AND e.student_id=(SELECT auth.uid()) AND e.status='approved')
  AND EXISTS (SELECT 1 FROM public.gradebook_items i
              WHERE i.id=gradebook_marks.item_id
                AND i.course_id=gradebook_marks.course_id AND NOT i.is_archived)
);
