'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { db } from '../lib/supabase';
import styles from './dashboard.module.css';
import AttendancePanel from './AttendancePanel';
import AttendanceAnalytics from './AttendanceAnalytics';
import SmartAttendanceTeacher from './SmartAttendanceTeacher';
import StudentLeaveRequest from './StudentLeaveRequest';
import TeacherLeaveApproval from './TeacherLeaveApproval';

type Profile = { id: string; full_name: string; student_id: string | null; role: 'teacher' | 'student' };
type Course = { id: number; code: string; title: string; term: string; status?: string };
type Enrollment = { course_id: number; student_id: string; status: string; profiles: { full_name: string; student_id: string | null } | null };
type Approved = { course_id: number; student_id: string };
type CourseMember = Enrollment;

function errorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const e = value as { message?: string; details?: string; hint?: string; code?: string };
    return [e.message, e.details, e.hint].filter(Boolean).join(' — ') || JSON.stringify(value);
  }
  return 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง';
}

export default function Home() {
  const [user, setUser] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [requests, setRequests] = useState<Enrollment[]>([]);
  const [approved, setApproved] = useState<Approved[]>([]);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [term, setTerm] = useState('2/2569');
  const [joinCode, setJoinCode] = useState('');
  const [courseId, setCourseId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [members, setMembers] = useState<CourseMember[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberStatus, setMemberStatus] = useState('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: { user: u }, error: authError } = await db().auth.getUser();
      if (authError) throw authError;
      setUser(u?.id ?? null);
      if (!u) {
        setProfile(null); setCourses([]); setRequests([]); setApproved([]); setSelectedCourseId(null); setMembers([]);
        return;
      }
      const { data: p, error: profileError } = await db().from('profiles')
        .select('id,full_name,student_id,role').eq('id', u.id).single();
      if (profileError || !p) throw profileError ?? new Error('ไม่พบโปรไฟล์ผู้ใช้');
      const me = p as Profile;
      setProfile(me);
      if (me.role === 'teacher') {
        const [courseResult, requestResult, approvedResult] = await Promise.all([
          db().from('courses').select('id,code,title,term').order('created_at', { ascending: false }),
          db().from('enrollments').select('course_id,student_id,status,profiles!enrollments_student_id_fkey(full_name,student_id)').eq('status', 'pending'),
          db().from('enrollments').select('course_id,student_id').eq('status', 'approved'),
        ]);
        if (courseResult.error) throw courseResult.error;
        if (requestResult.error) throw requestResult.error;
        setCourses((courseResult.data ?? []) as Course[]);
        setRequests((requestResult.data ?? []) as unknown as Enrollment[]);
        if (approvedResult.error) {
          setApproved([]);
          setError(`ไม่สามารถโหลดจำนวนนักศึกษา: ${errorText(approvedResult.error)}`);
        } else setApproved((approvedResult.data ?? []) as Approved[]);
      } else {
        const { data, error: courseError } = await db().rpc('my_courses');
        if (courseError) throw courseError;
        setCourses((data ?? []) as Course[]);
        setRequests([]); setApproved([]);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const { data: { subscription } } = db().auth.onAuthStateChange(() => {
      // Delay reads until the auth callback has finished processing the session.
      setTimeout(() => { void load(); }, 0);
    });
    return () => subscription.unsubscribe();
  }, [load]);

  const openCourse = async (id: number) => {
    if (profile?.role !== 'teacher') return;
    setSelectedCourseId(id); setMemberSearch(''); setMemberStatus('all'); setSelectedStudentId(null); setMembersLoading(true); setError('');
    try {
      const { data, error: e } = await db().from('enrollments')
        .select('course_id,student_id,status,profiles!enrollments_student_id_fkey(full_name,student_id)')
        .eq('course_id', id).order('requested_at', { ascending: false });
      if (e) throw e;
      setMembers((data ?? []) as unknown as CourseMember[]);
    } catch (e) { setError(errorText(e)); setMembers([]); }
    finally { setMembersLoading(false); }
  };

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMsg('');
    try { await action(); } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function authenticate() {
    await run(async () => {
      if (signup) {
        if (!name.trim() || !studentId.trim()) throw new Error('กรุณากรอกชื่อและรหัสนักศึกษา');
        const { error: e } = await db().auth.signUp({
          email, password, options: { data: { full_name: name.trim(), student_id: studentId.trim() } },
        });
        if (e) throw e;
        setMsg('สมัครสำเร็จ โปรดตรวจอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ');
        setSignup(false);
      } else {
        const { error: e } = await db().auth.signInWithPassword({ email, password });
        if (e) throw e;
        await load();
      }
    });
  }
  async function createCourse() {
    await run(async () => {
      const { error: e } = await db().rpc('create_course', {
        p_code: code, p_title: title, p_term: term, p_join_code: joinCode,
      });
      if (e) throw e;
      setCode(''); setTitle(''); setJoinCode('');
      setMsg('สร้างรายวิชาแล้ว กรุณาส่ง Course ID และรหัสเข้าร่วมให้นักศึกษา');
      await load();
    });
  }
  async function join() {
    await run(async () => {
      const id = Number(courseId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Course ID ไม่ถูกต้อง');
      const { error: e } = await db().rpc('request_enrollment', { p_course_id: id, p_join_code: joinCode });
      if (e) throw e;
      setJoinCode(''); setMsg('ส่งคำขอแล้ว รออาจารย์อนุมัติ');
      await load();
    });
  }
  async function decide(course: number, student: string, approve: boolean) {
    await run(async () => {
      const { error: e } = await db().rpc('decide_enrollment', {
        p_course_id: course, p_student_id: student, p_approve: approve,
      });
      if (e) throw e;
      setMsg(approve ? 'อนุมัติแล้ว' : 'ปฏิเสธคำขอแล้ว');
      await load();
      if (selectedCourseId === course) await openCourse(course);
    });
  }
  async function signOut() {
    await run(async () => {
      const { error: e } = await db().auth.signOut();
      if (e) throw e;
      setUser(null); setProfile(null); setCourses([]); setRequests([]); setApproved([]); setSelectedCourseId(null); setMembers([]);
    });
  }

  async function removeStudent(course: number, student: string) {
    if (!window.confirm('ยืนยันการนำสมาชิกออกจากรายวิชานี้? นักศึกษาจะต้องขอเข้าร่วมใหม่')) return;
    await run(async () => {
      const { error: e } = await db().rpc('remove_course_member', { p_course_id: course, p_student_id: student });
      if (e) throw e;
      setSelectedStudentId(null);
      setMsg('นำสมาชิกออกจากรายวิชาแล้ว');
      await load(); await openCourse(course);
    });
  }
  function exportMembers() {
    if (!selectedCourse) return;
    const esc = (v: string) => '"' + v.replace(/"/g, '""') + '"';
    // Prefix potentially formula-like values to prevent spreadsheet formula injection.
    const safe = (v: string) => /^[\s]*[=+@-]/.test(v) ? "'" + v : v;
    const rows = [['ชื่อ–นามสกุล','รหัสนักศึกษา','สถานะ'], ...filteredMembers.map(m => [m.profiles?.full_name ?? '', m.profiles?.student_id ?? '', statusText(m.status)])];
    const csv = '\uFEFF' + rows.map(r => r.map(v => esc(safe(v))).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `ME-Smart-${selectedCourse.code}-students.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const filteredMembers = members.filter(m => {
    const q = memberSearch.trim().toLocaleLowerCase();
    return (memberStatus === 'all' || m.status === memberStatus) && (!q || [m.profiles?.full_name, m.profiles?.student_id, m.student_id].some(v => (v ?? '').toLocaleLowerCase().includes(q)));
  });
  const selectedStudent = members.find(m => m.student_id === selectedStudentId);
  const uniqueStudents = new Set(approved.map(a => a.student_id)).size;
  const approvedCourseCount = courses.filter(c => c.status === 'approved').length;
  const pendingCourseCount = courses.filter(c => c.status === 'pending').length;
  const statusText = (status?: string) => status === 'approved' ? 'อนุมัติแล้ว' : status === 'pending' ? 'รออนุมัติ' : status === 'rejected' ? 'ไม่อนุมัติ' : '';

  return <>
    <header className={styles.topbar}>
      <div className={styles.topInner}>
        <div className={styles.brand}><span className={styles.brandIcon}>🎓</span><span>ME-Smart <span className={styles.brandDivider}>/</span> Phase 1</span></div>
        <span className={styles.topSubtitle}>Mechanical Engineering · Academic Platform</span>
      </div>
    </header>
    <main className={styles.container}>
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>ACADEMIC MANAGEMENT SYSTEM</p><h1>{profile ? 'แดชบอร์ด' : 'ระบบจัดการรายวิชาและนักศึกษา'}</h1><p className={styles.muted}>ระบบบัญชีผู้ใช้ · รายวิชา · คำขอเข้าร่วม · การอนุมัติ</p></div>
        {profile && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={signOut}>ออกจากระบบ</button>}
      </div>
      {error && <div role="alert" className={styles.error}>{error}</div>}
      {msg && <div role="status" className={styles.success}>{msg}</div>}
      {initialLoading ? <section className={styles.card}>กำลังโหลดข้อมูล...</section> : !user ? (
        <section className={`${styles.card} ${styles.loginCard}`}>
          <h2>{signup ? 'สมัครบัญชีนักศึกษา' : 'เข้าสู่ระบบ'}</h2>
          <p className={styles.muted}>บัญชีอาจารย์ต้องได้รับสิทธิ์จากผู้ดูแลฐานข้อมูลเท่านั้น</p>
          <form onSubmit={e => { e.preventDefault(); void authenticate(); }}>
            {signup && <><label className={styles.field}>ชื่อ–นามสกุล<input required value={name} onChange={e => setName(e.target.value)} /></label><label className={styles.field}>รหัสนักศึกษา<input required value={studentId} onChange={e => setStudentId(e.target.value)} /></label></>}
            <label className={styles.field}>อีเมล<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
            <label className={styles.field}>รหัสผ่าน<input required type="password" autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>
            <div className={styles.actions}><button disabled={busy} type="submit" className={styles.primaryButton}>{signup ? 'สมัครบัญชี' : 'เข้าสู่ระบบ'}</button><button type="button" disabled={busy} className={styles.secondaryButton} onClick={() => { setSignup(!signup); setError(''); setMsg(''); }}>{signup ? 'มีบัญชีแล้ว' : 'สมัครบัญชีนักศึกษา'}</button></div>
          </form>
        </section>
      ) : !profile ? <section className={styles.card}>กำลังโหลดข้อมูลผู้ใช้... <button className={styles.secondaryButton} onClick={signOut}>ออกจากระบบ</button></section> : <>
        {profile.role === 'teacher' ? <>
          <section className={`${styles.card} ${styles.teacherHero}`}>
            <Image className={styles.teacherPhoto} src="/teacher.JPG" alt="รูปประจำตัวอาจารย์" width={160} height={190} priority />
            <div className={styles.heroDetails}>
              <p className={styles.eyebrow}>TEACHER DASHBOARD</p>
              <h2>{profile.full_name}</h2>
              <p>ตำแหน่ง: ผู้ช่วยศาสตราจารย์</p>
              <p>สาขาวิชา: วิศวกรรมเครื่องกล</p>
              <p>มหาวิทยาลัยเทคโนโลยีราชมงคลกรุงเทพ</p>
              <span className={styles.pill}>อาจารย์ผู้สอน</span>
            </div>
          </section>
          <div className={styles.stats}>
            <article className={styles.statCard}><div className={styles.statIcon}>📚</div><p>รายวิชาทั้งหมด</p><strong>{courses.length}</strong><span>รายวิชาที่สร้างแล้ว</span></article>
            <article className={styles.statCard}><div className={styles.statIcon}>👥</div><p>นักศึกษาที่อนุมัติ</p><strong>{uniqueStudents}</strong><span>นับนักศึกษาไม่ซ้ำกัน</span></article>
            <article className={styles.statCard}><div className={styles.statIcon}>🕒</div><p>คำขอรออนุมัติ</p><strong>{requests.length}</strong><span>รายการที่รอพิจารณา</span></article>
          </div>
          <div className={styles.twoColumns}>
            <section className={styles.card}>
              <div className={styles.sectionHeading}><h2>สร้างรายวิชา</h2><span className={styles.pill}>Course Setup</span></div>
              <form onSubmit={e => { e.preventDefault(); void createCourse(); }}>
                <label className={styles.field}>รหัสวิชา<input required value={code} onChange={e => setCode(e.target.value)} placeholder="ME301" /></label>
                <label className={styles.field}>ชื่อวิชา<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Fluid Mechanics" /></label>
                <label className={styles.field}>ภาคเรียน<input required value={term} onChange={e => setTerm(e.target.value)} /></label>
                <label className={styles.field}>รหัสเข้าร่วม (อย่างน้อย 8 ตัวอักษร)<input required minLength={8} type="password" autoComplete="off" value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="ตั้งรหัสที่เดายาก" /></label>
                <button className={styles.primaryButton} disabled={busy} type="submit">+ สร้างรายวิชา</button>
              </form>
            </section>
            <section className={styles.card}>
              <div className={styles.sectionHeading}><h2>คำขอเข้าร่วมที่รออนุมัติ</h2><span className={styles.count}>{requests.length}</span></div>
              {requests.length === 0 ? <p className={styles.empty}>ยังไม่มีคำขอเข้าร่วม</p> : requests.map(r => <div className={styles.listItem} key={`${r.course_id}-${r.student_id}`}>
                <strong>{r.profiles?.full_name ?? r.student_id}</strong>
                <p className={styles.muted}>รหัสนักศึกษา: {r.profiles?.student_id ?? '-'} · Course ID: {r.course_id}</p>
                <div className={styles.actions}><button type="button" disabled={busy} className={styles.primaryButton} onClick={() => decide(r.course_id, r.student_id, true)}>อนุมัติ</button><button type="button" disabled={busy} className={styles.dangerButton} onClick={() => decide(r.course_id, r.student_id, false)}>ปฏิเสธ</button></div>
              </div>)}
            </section>
          </div>
        </> : <>
          <section className={styles.studentHero}><div><p className={styles.eyebrow}>STUDENT DASHBOARD</p><h2>{profile.full_name}</h2><p>รหัสนักศึกษา: {profile.student_id ?? '-'}</p></div><span className={styles.pill}>นักศึกษา</span></section>
          <div className={styles.stats}>
            <article className={styles.statCard}><div className={styles.statIcon}>📚</div><p>รายวิชาของฉัน</p><strong>{courses.length}</strong><span>รวมทุกสถานะ</span></article>
            <article className={styles.statCard}><div className={styles.statIcon}>✅</div><p>อนุมัติแล้ว</p><strong>{approvedCourseCount}</strong><span>เข้าร่วมรายวิชาได้</span></article>
            <article className={styles.statCard}><div className={styles.statIcon}>🕒</div><p>รออนุมัติ</p><strong>{pendingCourseCount}</strong><span>รออาจารย์พิจารณา</span></article>
          </div>
          <section className={styles.card}>
            <h2>เข้าร่วมรายวิชา</h2><p className={styles.muted}>รับ Course ID และรหัสเข้าร่วมจากอาจารย์</p>
            <form onSubmit={e => { e.preventDefault(); void join(); }}>
              <label className={styles.field}>Course ID<input required type="number" min="1" value={courseId} onChange={e => setCourseId(e.target.value)} /></label>
              <label className={styles.field}>รหัสเข้าร่วม<input required type="password" autoComplete="off" value={joinCode} onChange={e => setJoinCode(e.target.value)} /></label>
              <button type="submit" className={styles.primaryButton} disabled={busy}>ส่งคำขอเข้าร่วม</button>
            </form>
          </section>
                  <StudentLeaveRequest
            courses={courses.filter(c => c.status === 'approved')}
          />
        </>}
        <section className={`${styles.card} ${styles.coursesSection}`}>
          <div className={styles.sectionHeading}><h2>{profile.role === 'teacher' ? 'รายวิชาของอาจารย์' : 'รายวิชาของฉัน'}</h2><span className={styles.count}>{courses.length}</span></div>
          {courses.length === 0 ? <p className={styles.empty}>ยังไม่มีรายวิชา</p> : <div className={styles.courseGrid}>{courses.map(c => <article className={styles.courseTile} key={c.id}>
            <div className={styles.courseTileTop}><span className={styles.pill}>Course ID: {c.id}</span>{c.status && <span className={styles.pill}>{statusText(c.status)}</span>}</div>
            <h3>{c.code} — {c.title}</h3><p className={styles.muted}>ภาคเรียน {c.term}</p>
            {profile.role === 'teacher' && <button type="button" className={styles.secondaryButton} disabled={membersLoading} onClick={() => void openCourse(c.id)}>จัดการรายวิชา →</button>}
          </article>)}</div>}
        </section>
        {profile.role === 'teacher' && selectedCourse && <section className={`${styles.card} ${styles.coursesSection}`} id="course-management">
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>COURSE MANAGEMENT</p><h2>{selectedCourse.code} — {selectedCourse.title}</h2><p className={styles.muted}>Course ID: {selectedCourse.id} · ภาคเรียน {selectedCourse.term}</p></div><button type="button" className={styles.secondaryButton} onClick={() => {setSelectedCourseId(null);setMembers([]);}}>ปิดรายละเอียด</button></div>
          <div className={styles.miniStats}><div><strong>{members.filter(m => m.status === 'approved').length}</strong><span>อนุมัติแล้ว</span></div><div><strong>{members.filter(m => m.status === 'pending').length}</strong><span>รออนุมัติ</span></div><div><strong>{members.filter(m => m.status === 'rejected').length}</strong><span>ไม่อนุมัติ</span></div></div>
          <div className={styles.studentTools}>
            <label className={styles.field}>ค้นหานักศึกษา<input type="search" placeholder="ค้นหาชื่อหรือรหัสนักศึกษา" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} /></label>
            <label className={styles.field}>สถานะ<select className={styles.selectField} value={memberStatus} onChange={e => setMemberStatus(e.target.value)}><option value="all">ทั้งหมด</option><option value="approved">อนุมัติแล้ว</option><option value="pending">รออนุมัติ</option><option value="rejected">ไม่อนุมัติ</option></select></label>
            <button type="button" className={styles.secondaryButton} disabled={membersLoading || filteredMembers.length === 0} onClick={exportMembers}>ส่งออก CSV (Excel)</button>
          </div>
          <p className={styles.muted}>พบ {filteredMembers.length} รายการ จากทั้งหมด {members.length} รายการ</p>
          {membersLoading ? <p className={styles.empty}>กำลังโหลดรายชื่อนักศึกษา...</p> : filteredMembers.length === 0 ? <p className={styles.empty}>ไม่พบรายชื่อนักศึกษา</p> : <div className={styles.memberTableWrap}><table className={styles.memberTable}><thead><tr><th>ชื่อ–นามสกุล</th><th>รหัสนักศึกษา</th><th>สถานะ</th><th>การดำเนินการ</th></tr></thead><tbody>{filteredMembers.map(m => <tr key={`${m.course_id}-${m.student_id}`}><td>{m.profiles?.full_name ?? 'ไม่พบข้อมูล'}</td><td>{m.profiles?.student_id ?? '-'}</td><td><span className={styles.pill}>{statusText(m.status)}</span></td><td><div className={styles.actions}><button type="button" className={styles.secondaryButton} onClick={() => setSelectedStudentId(m.student_id)}>รายละเอียด</button>{m.status === 'pending' && <><button type="button" disabled={busy} className={styles.primaryButton} onClick={() => void decide(m.course_id,m.student_id,true)}>อนุมัติ</button><button type="button" disabled={busy} className={styles.dangerButton} onClick={() => void decide(m.course_id,m.student_id,false)}>ปฏิเสธ</button></>}{m.status === 'approved' && <button type="button" disabled={busy} className={styles.dangerButton} onClick={() => void removeStudent(m.course_id,m.student_id)}>นำออก</button>}</div></td></tr>)}</tbody></table></div>}
          {selectedStudent && <div className={styles.studentDetail} role="region" aria-label="รายละเอียดนักศึกษา"><div className={styles.sectionHeading}><h3>ข้อมูลนักศึกษา</h3><button type="button" className={styles.secondaryButton} onClick={() => setSelectedStudentId(null)}>ปิด</button></div><dl className={styles.detailGrid}><dt>ชื่อ–นามสกุล</dt><dd>{selectedStudent.profiles?.full_name ?? '-'}</dd><dt>รหัสนักศึกษา</dt><dd>{selectedStudent.profiles?.student_id ?? '-'}</dd><dt>สถานะในรายวิชา</dt><dd>{statusText(selectedStudent.status)}</dd><dt>รายวิชา</dt><dd>{selectedCourse.code} — {selectedCourse.title}</dd></dl></div>}
          <p className={styles.muted}>แสดงเฉพาะนักศึกษาที่ส่งคำขอเข้าร่วมรายวิชานี้แล้ว · การนำสมาชิกออกต้องได้รับการยืนยัน</p>
          <AttendancePanel key={selectedCourse.id} courseId={selectedCourse.id} courseCode={selectedCourse.code} teacher={true} />
          <SmartAttendanceTeacher
               key={`smart-${selectedCourse.id}`}
               courseId={selectedCourse.id}
              />
                    <TeacherLeaveApproval
            key={`leave-${selectedCourse.id}`}
            courseId={selectedCourse.id}
          />
          <AttendanceAnalytics key={`analytics-${selectedCourse.id}`} courseId={selectedCourse.id} courseCode={selectedCourse.code} />
        </section>}
      </>}
      <footer className={styles.footer}>ME-Smart · Phase 2 Attendance · ยังไม่เปิดฟังก์ชันคะแนน · ข้อมูลส่วนบุคคลใช้เพื่อการเรียนการสอนเท่านั้น</footer>
    </main>
  </>;
}
