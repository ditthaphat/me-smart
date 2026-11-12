'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../lib/supabase';
import Pagination from './Pagination';
import styles from './advising.module.css';

type Group = { id: number; name: string; cohort: string; is_archived: boolean };
type Student = { id: number; group_id: number; student_number: string; full_name: string; is_archived: boolean };
type Session = {
  id: number; group_id: number; meeting_date: string; start_time: string | null; end_time: string | null;
  location: string; advisors: string[]; discussion: string; recommendations: string;
  next_meeting_date: string | null; next_meeting_time: string | null; next_meeting_note: string; is_archived: boolean;
};
type Status = 'not_recorded' | 'present' | 'absent' | 'leave';
type Participant = { session_id: number; student_id: number; student_number_snapshot: string; full_name_snapshot: string; attendance_status: Status };
type SessionForm = {
  meeting_date: string; start_time: string; end_time: string; location: string; advisor1: string; advisor2: string; advisor3: string;
  discussion: string; recommendations: string; next_meeting_date: string; next_meeting_time: string; next_meeting_note: string;
};
const STATUS: { value: Status; label: string }[] = [
  { value: 'not_recorded', label: 'ยังไม่บันทึก' }, { value: 'present', label: 'เข้าร่วม' },
  { value: 'absent', label: 'ไม่เข้าร่วม' }, { value: 'leave', label: 'ลา' },
];
const today = () => new Date().toLocaleDateString('en-CA');
const emptyForm = (teacherName: string): SessionForm => ({
  meeting_date: today(), start_time: '', end_time: '', location: '', advisor1: teacherName, advisor2: '', advisor3: '',
  discussion: '', recommendations: '', next_meeting_date: '', next_meeting_time: '', next_meeting_note: '',
});
const toForm = (s: Session): SessionForm => ({
  meeting_date: s.meeting_date, start_time: s.start_time?.slice(0, 5) ?? '', end_time: s.end_time?.slice(0, 5) ?? '',
  location: s.location ?? '', advisor1: s.advisors?.[0] ?? '', advisor2: s.advisors?.[1] ?? '', advisor3: s.advisors?.[2] ?? '',
  discussion: s.discussion ?? '', recommendations: s.recommendations ?? '', next_meeting_date: s.next_meeting_date ?? '',
  next_meeting_time: s.next_meeting_time?.slice(0, 5) ?? '', next_meeting_note: s.next_meeting_note ?? '',
});
const thaiDate = (value: string | null) => value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : '—';
const errorText = (value: unknown) => {
  const e = value as { message?: string; code?: string } | null;
  if (e?.code === '42P01' || e?.code === 'PGRST205') return 'ยังไม่พบตารางงานที่ปรึกษา กรุณาติดตั้งโครงสร้างฐานข้อมูลของระบบก่อน';
  return e?.message || (value instanceof Error ? value.message : 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');
};

function csvCell(value: string) {
  const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
function downloadRoster(students: Student[]) {
  const lines = [['รหัสนักศึกษา', 'ชื่อ–สกุล'], ...students.map(s => [s.student_number, s.full_name])];
  const blob = new Blob(['\uFEFF' + lines.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'advising-students.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdvisingPanel({ teacherId, teacherName }: { teacherId: string; teacherName: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [form, setForm] = useState<SessionForm>(() => emptyForm(teacherName));
  const [savedForm, setSavedForm] = useState<SessionForm>(() => emptyForm(teacherName));
  const [editorOpen, setEditorOpen] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [workspace, setWorkspace] = useState<'students' | 'sessions'>('students');
  const [showArchived, setShowArchived] = useState(false);
  const [showArchivedStudents, setShowArchivedStudents] = useState(false);
  const [showArchivedSessions, setShowArchivedSessions] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupCohort, setGroupCohort] = useState('');
  const [editGroup, setEditGroup] = useState(false);
  const [rosterInput, setRosterInput] = useState('');
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPage, setStudentPage] = useState(0);
  const [participantPage, setParticipantPage] = useState(0);
  const [sessionPage, setSessionPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [participantLoading, setParticipantLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const group = groups.find(g => g.id === groupId) ?? null;
  const selectedSession = sessions.find(s => s.id === sessionId) ?? null;
  const dirty = editorOpen && JSON.stringify(form) !== JSON.stringify(savedForm);

  const loadGroups = useCallback(async (preferredId?: number) => {
    setLoading(true);
    try {
      const { data, error: e } = await db().from('advising_groups').select('id,name,cohort,is_archived').eq('owner_id', teacherId).order('created_at', { ascending: false });
      if (e) throw e;
      const rows = (data ?? []) as Group[];
      setGroups(rows);
      setGroupId(old => preferredId ?? (old && rows.some(g => g.id === old) ? old : rows.find(g => !g.is_archived)?.id ?? null));
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [teacherId]);
  useEffect(() => { void loadGroups(); }, [loadGroups]);
  useEffect(() => {
    if (groupId === null) { setStudents([]); setSessions([]); return; }
    let active = true; setDetailLoading(true);
    void (async () => {
      try {
        const [a, b] = await Promise.all([
          db().from('advising_students').select('id,group_id,student_number,full_name,is_archived').eq('owner_id', teacherId).eq('group_id', groupId).order('student_number'),
          db().from('advising_sessions').select('*').eq('owner_id', teacherId).eq('group_id', groupId).order('meeting_date', { ascending: false }).order('id', { ascending: false }),
        ]);
        if (a.error) throw a.error; if (b.error) throw b.error;
        if (active) { setStudents((a.data ?? []) as Student[]); setSessions((b.data ?? []) as Session[]); }
      } catch (e) { if (active) setError(errorText(e)); }
      finally { if (active) setDetailLoading(false); }
    })();
    return () => { active = false; };
  }, [groupId, teacherId, refresh]);
  useEffect(() => {
    if (sessionId === null) { setParticipants([]); return; }
    let active = true; setParticipantLoading(true);
    void (async () => {
      try {
        const { data, error: e } = await db().from('advising_participants').select('session_id,student_id,student_number_snapshot,full_name_snapshot,attendance_status').eq('owner_id', teacherId).eq('session_id', sessionId).order('student_number_snapshot');
        if (e) throw e; if (active) setParticipants((data ?? []) as Participant[]);
      } catch (e) { if (active) setError(errorText(e)); }
      finally { if (active) setParticipantLoading(false); }
    })();
    return () => { active = false; };
  }, [sessionId, teacherId, refresh]);
  useEffect(() => { setStudentPage(0); }, [studentSearch, showArchivedStudents, groupId]);
  useEffect(() => { setSessionPage(0); }, [showArchivedSessions, groupId]);
  useEffect(() => { setParticipantPage(0); }, [sessionId]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLocaleLowerCase();
    return students.filter(s => (showArchivedStudents || !s.is_archived) && (!q || `${s.student_number} ${s.full_name}`.toLocaleLowerCase().includes(q)));
  }, [students, studentSearch, showArchivedStudents]);
  const visibleSessions = sessions.filter(s => showArchivedSessions || !s.is_archived);
  const activeStudents = students.filter(s => !s.is_archived);
  const studentCurrent = Math.min(studentPage, Math.max(0, Math.ceil(filteredStudents.length / 10) - 1));
  const sessionCurrent = Math.min(sessionPage, Math.max(0, Math.ceil(visibleSessions.length / 10) - 1));
  const participantCurrent = Math.min(participantPage, Math.max(0, Math.ceil(participants.length / 10) - 1));
  const printedPages = Array.from({ length: Math.max(1, Math.ceil(participants.length / 20)) }, (_, i) => participants.slice(i * 20, i * 20 + 20));

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  function allowLeaveEditor() {
    const hasUnsavedWork = dirty || Boolean(rosterInput.trim()) || editStudent !== null || editGroup;
    return !hasUnsavedWork || window.confirm('มีข้อมูลที่ยังไม่ได้บันทึก ต้องการทิ้งการแก้ไขหรือไม่?');
  }
  function chooseGroup(id: number | null) {
    if (!allowLeaveEditor()) return;
    setGroupId(id); setSessionId(null); setEditorOpen(false); setShowPrintPreview(false); setEditGroup(false); setEditStudent(null); setRosterInput('');
  }
  async function saveGroup() {
    if (!groupName.trim()) { setError('กรุณากรอกชื่อกลุ่ม'); return; }
    await run(async () => {
      if (editGroup && groupId !== null) {
        const { error: e } = await db().from('advising_groups').update({ name: groupName.trim(), cohort: groupCohort.trim() }).eq('id', groupId).eq('owner_id', teacherId);
        if (e) throw e; await loadGroups(groupId); setMessage('แก้ไขกลุ่มแล้ว');
      } else {
        const { data, error: e } = await db().from('advising_groups').insert({ owner_id: teacherId, name: groupName.trim(), cohort: groupCohort.trim() }).select('id').single();
        if (e) throw e; await loadGroups(Number(data.id)); setMessage('เพิ่มกลุ่มนักศึกษาแล้ว');
      }
      setGroupName(''); setGroupCohort(''); setEditGroup(false);
    });
  }
  async function archiveGroup() {
    if (!group || !allowLeaveEditor() || !window.confirm(group.is_archived ? 'นำกลุ่มนี้กลับมาใช้งาน?' : 'เก็บกลุ่มนี้ถาวร? ข้อมูลเดิมยังอยู่และสามารถนำกลับได้')) return;
    await run(async () => {
      const { error: e } = await db().from('advising_groups').update({ is_archived: !group.is_archived }).eq('id', group.id).eq('owner_id', teacherId);
      if (e) throw e; await loadGroups(group.id); setEditorOpen(false); setSessionId(null); setMessage(group.is_archived ? 'นำกลุ่มกลับมาแล้ว' : 'เก็บกลุ่มถาวรแล้ว');
    });
  }
  async function addStudents() {
    if (groupId === null || group?.is_archived) return;
    const lines = rosterInput.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length || lines.length > 200) { setError('กรุณากรอก 1–200 รายการ โดยหนึ่งบรรทัดมีรหัสนักศึกษาและชื่อ–สกุล'); return; }
    const parsed = lines.map(line => {
      const at = line.search(/[,\t]/);
      return { number: at < 0 ? '' : line.slice(0, at).trim(), name: at < 0 ? '' : line.slice(at + 1).trim() };
    });
    if (parsed.some(p => !p.number || !p.name || p.number.length > 40 || p.name.length > 200)) { setError('รูปแบบไม่ถูกต้อง: แต่ละบรรทัดต้องเป็น รหัสนักศึกษา,ชื่อ–สกุล'); return; }
    const ids = parsed.map(p => p.number);
    if (new Set(ids).size !== ids.length || ids.some(id => students.some(s => s.student_number === id))) { setError('พบรหัสนักศึกษาซ้ำในข้อมูลที่กรอกหรือในกลุ่มนี้'); return; }
    await run(async () => {
      const rows = parsed.map(p => ({ owner_id: teacherId, group_id: groupId, student_number: p.number, full_name: p.name }));
      const { error: e } = await db().from('advising_students').insert(rows);
      if (e) throw e; setRosterInput(''); setRefresh(v => v + 1); setMessage(`เพิ่มนักศึกษา ${rows.length} คนแล้ว`);
    });
  }
  async function saveStudent() {
    if (!editStudent || !editStudent.student_number.trim() || !editStudent.full_name.trim()) { setError('กรุณากรอกรหัสและชื่อนักศึกษา'); return; }
    await run(async () => {
      const { error: e } = await db().from('advising_students').update({ student_number: editStudent.student_number.trim(), full_name: editStudent.full_name.trim() }).eq('id', editStudent.id).eq('owner_id', teacherId);
      if (e) throw e; setEditStudent(null); setRefresh(v => v + 1); setMessage('แก้ไขรายชื่อนักศึกษาแล้ว');
    });
  }
  async function archiveStudent(student: Student) {
    if (!window.confirm(student.is_archived ? 'นำรายชื่อนี้กลับมาใช้งาน?' : 'เก็บรายชื่อนี้ถาวร? รายชื่อในการประชุมที่ผ่านมาไม่เปลี่ยนแปลง')) return;
    await run(async () => {
      const { error: e } = await db().from('advising_students').update({ is_archived: !student.is_archived }).eq('id', student.id).eq('owner_id', teacherId);
      if (e) throw e; setRefresh(v => v + 1); setMessage(student.is_archived ? 'นำรายชื่อกลับมาแล้ว' : 'เก็บรายชื่อถาวรแล้ว');
    });
  }
  function newSession() {
    if (!allowLeaveEditor()) return;
    const next = emptyForm(teacherName); setSessionId(null); setForm(next); setSavedForm(next); setEditorOpen(true); setShowPrintPreview(false); setParticipants([]);
  }
  function openSession(s: Session) {
    if (!allowLeaveEditor()) return;
    const next = toForm(s); setForm(next); setSavedForm(next); setSessionId(s.id); setEditorOpen(true); setShowPrintPreview(false); setError(''); setMessage('');
  }
  async function syncParticipants(id: number, rows: Student[]) {
    if (groupId === null || rows.length === 0) return;
    const data = rows.map(s => ({ owner_id: teacherId, group_id: groupId, session_id: id, student_id: s.id, student_number_snapshot: s.student_number, full_name_snapshot: s.full_name }));
    const { error: e } = await db().from('advising_participants').upsert(data, { onConflict: 'session_id,student_id', ignoreDuplicates: true });
    if (e) throw e;
  }
  async function saveSession() {
    if (groupId === null || group?.is_archived) return;
    if (!form.meeting_date || !form.advisor1.trim()) { setError('กรุณากรอกวันที่และชื่ออาจารย์ที่ปรึกษาคนที่ 1'); return; }
    if (form.start_time && form.end_time && form.end_time <= form.start_time) { setError('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น'); return; }
    if (form.next_meeting_time && !form.next_meeting_date) { setError('กรุณาระบุวันที่นัดหมายครั้งต่อไป'); return; }
    const advisors = [form.advisor1, form.advisor2, form.advisor3].map(v => v.trim());
    while (advisors.length > 1 && !advisors[advisors.length - 1]) advisors.pop();
    const payload = {
      owner_id: teacherId, group_id: groupId, meeting_date: form.meeting_date, start_time: form.start_time || null, end_time: form.end_time || null,
      location: form.location.trim(), advisors,
      discussion: form.discussion.trim(), recommendations: form.recommendations.trim(), next_meeting_date: form.next_meeting_date || null,
      next_meeting_time: form.next_meeting_time || null, next_meeting_note: form.next_meeting_note.trim(),
    };
    await run(async () => {
      const q = sessionId === null ? db().from('advising_sessions').insert(payload) : db().from('advising_sessions').update(payload).eq('id', sessionId).eq('owner_id', teacherId);
      const { data, error: e } = await q.select('*').single();
      if (e) throw e;
      const saved = data as Session; const next = toForm(saved); setSessionId(saved.id); setForm(next); setSavedForm(next); setRefresh(v => v + 1);
      if (sessionId === null) {
        try { await syncParticipants(saved.id, activeStudents); }
        catch (syncError) { setError(`บันทึกการปรึกษาแล้ว แต่เพิ่มรายชื่อไม่สำเร็จ: ${errorText(syncError)} กรุณากด “เพิ่มรายชื่อจากกลุ่ม” อีกครั้ง`); return; }
      }
      setRefresh(v => v + 1); setMessage('บันทึกการปรึกษาแล้ว');
    });
  }
  async function addParticipants() {
    if (sessionId === null) return;
    await run(async () => { await syncParticipants(sessionId, activeStudents); setRefresh(v => v + 1); setMessage('เพิ่มรายชื่อจากกลุ่มแล้ว โดยคงสถานะเดิม'); });
  }
  async function setAttendance(p: Participant, value: Status) {
    await run(async () => {
      const { data, error: e } = await db().from('advising_participants').update({ attendance_status: value }).eq('owner_id', teacherId).eq('session_id', p.session_id).eq('student_id', p.student_id).select('student_id');
      if (e) throw e; if (!data?.length) throw new Error('ไม่สามารถบันทึกสถานะ กรุณารีเฟรชแล้วลองใหม่');
      setParticipants(old => old.map(row => row.student_id === p.student_id ? { ...row, attendance_status: value } : row));
      setMessage('บันทึกสถานะการเข้าร่วมแล้ว');
    });
  }
  async function archiveSession() {
    if (!selectedSession || !allowLeaveEditor() || !window.confirm(selectedSession.is_archived ? 'นำบันทึกนี้กลับมาใช้งาน?' : 'เก็บบันทึกนี้ถาวร? ข้อมูลและรายชื่อยังอยู่')) return;
    await run(async () => {
      const { error: e } = await db().from('advising_sessions').update({ is_archived: !selectedSession.is_archived }).eq('id', selectedSession.id).eq('owner_id', teacherId);
      if (e) throw e; setRefresh(v => v + 1); setMessage(selectedSession.is_archived ? 'นำบันทึกกลับมาแล้ว' : 'เก็บบันทึกถาวรแล้ว');
    });
  }

  return <section className={styles.root} aria-label="งานอาจารย์ที่ปรึกษา">
    <div className={styles.header}><div><p className={styles.eyebrow}>STUDENT ADVISING</p><h2>งานอาจารย์ที่ปรึกษา</h2><p>บันทึกการให้คำปรึกษารายกลุ่มตามแบบ ทป.คก.01.06.2568</p></div><span className={styles.owner}>เฉพาะอาจารย์เจ้าของข้อมูล</span></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className={styles.success}>{message}</p>}
    <div className={styles.card}>
      <div className={styles.sectionTitle}><div><h3>กลุ่มนักศึกษาในความดูแล</h3><p>จัดกลุ่มแยกจากรายวิชาที่ใช้เช็กชื่อ</p></div><span className={styles.count}>{groups.filter(g => !g.is_archived).length} กลุ่ม</span></div>
      {loading ? <p>กำลังโหลดกลุ่ม...</p> : <>
        <div className={styles.row}><label className={styles.field}>เลือกกลุ่ม<select value={groupId ?? ''} onChange={e => chooseGroup(e.target.value ? Number(e.target.value) : null)}><option value="">เลือกกลุ่มนักศึกษา</option>{groups.filter(g => showArchived || !g.is_archived || g.id === groupId).map(g => <option key={g.id} value={g.id}>{g.name}{g.cohort ? ` · ${g.cohort}` : ''}{g.is_archived ? ' (เก็บถาวร)' : ''}</option>)}</select></label><label className={styles.check}><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> แสดงกลุ่มที่เก็บถาวร</label></div>
        {group && <div className={styles.actions}><button type="button" onClick={() => { setGroupName(group.name); setGroupCohort(group.cohort); setEditGroup(true); }}>แก้ไขชื่อกลุ่ม</button><button type="button" onClick={() => void archiveGroup()} disabled={busy}>{group.is_archived ? 'นำกลุ่มกลับ' : 'เก็บกลุ่มถาวร'}</button></div>}
        <details open={editGroup || undefined}><summary>{editGroup ? 'แก้ไขกลุ่มนักศึกษา' : '+ เพิ่มกลุ่มนักศึกษา'}</summary><form onSubmit={e => { e.preventDefault(); void saveGroup(); }} className={styles.formGrid}><label className={styles.field}>ชื่อกลุ่ม *<input required maxLength={120} value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="เช่น นักศึกษาที่ปรึกษา ชั้นปีที่ 1" /></label><label className={styles.field}>รุ่น / ภาคเรียน<input maxLength={120} value={groupCohort} onChange={e => setGroupCohort(e.target.value)} placeholder="เช่น รหัส 69 หรือ 2/2569" /></label><div className={styles.actions}><button className={styles.primary} disabled={busy}>{editGroup ? 'บันทึกชื่อกลุ่ม' : 'เพิ่มกลุ่ม'}</button>{editGroup && <button type="button" onClick={() => { setEditGroup(false); setGroupName(''); setGroupCohort(''); }}>ยกเลิก</button>}</div></form></details>
      </>}
    </div>
    {group && <>
      {group.is_archived && <p className={styles.notice}>กลุ่มนี้เก็บถาวรอยู่ ให้นำกลับมาใช้งานก่อนเพิ่มข้อมูลใหม่</p>}
      <nav className={styles.subnav} aria-label="งานในกลุ่มที่ปรึกษา"><button type="button" aria-pressed={workspace === 'students'} onClick={() => setWorkspace('students')}>รายชื่อนักศึกษา</button><button type="button" aria-pressed={workspace === 'sessions'} onClick={() => setWorkspace('sessions')}>บันทึกการปรึกษา</button></nav>
      {detailLoading && <p>กำลังโหลดข้อมูลกลุ่ม...</p>}
      <div hidden={workspace !== 'students'} className={styles.card}>
        <div className={styles.sectionTitle}><div><h3>รายชื่อนักศึกษา</h3><p>รายชื่อในกลุ่มนี้ {activeStudents.length} คน</p></div><button type="button" onClick={() => downloadRoster(activeStudents)} disabled={!activeStudents.length}>ส่งออก CSV</button></div>
        <details><summary>+ เพิ่มรายชื่อนักศึกษา</summary><p>กรอกหนึ่งคนต่อหนึ่งบรรทัด ในรูปแบบ <strong>รหัสนักศึกษา,ชื่อ–สกุล</strong> สามารถวางหลายบรรทัดพร้อมกันได้</p><form onSubmit={e => { e.preventDefault(); void addStudents(); }}><label className={styles.field}>รายชื่อ<textarea rows={5} value={rosterInput} onChange={e => setRosterInput(e.target.value)} placeholder={'66000000001,นักศึกษาตัวอย่าง ก\n66000000002,นักศึกษาตัวอย่าง ข'} /></label><button className={styles.primary} disabled={busy || group.is_archived}>เพิ่มรายชื่อ</button></form></details>
        {editStudent && <form onSubmit={e => { e.preventDefault(); void saveStudent(); }} className={styles.inlineEditor}><h4>แก้ไขรายชื่อ</h4><div className={styles.formGrid}><label className={styles.field}>รหัสนักศึกษา<input required maxLength={40} value={editStudent.student_number} onChange={e => setEditStudent({ ...editStudent, student_number: e.target.value })} /></label><label className={styles.field}>ชื่อ–สกุล<input required maxLength={200} value={editStudent.full_name} onChange={e => setEditStudent({ ...editStudent, full_name: e.target.value })} /></label></div><div className={styles.actions}><button className={styles.primary} disabled={busy || group.is_archived}>บันทึก</button><button type="button" onClick={() => setEditStudent(null)}>ยกเลิก</button></div><p>การแก้ไขรายชื่อจะไม่เปลี่ยนรายชื่อที่บันทึกไว้ในการประชุมครั้งก่อน</p></form>}
        <div className={styles.row}><label className={styles.field}>ค้นหานักศึกษา<input type="search" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="ค้นหาชื่อหรือรหัส" /></label><label className={styles.check}><input type="checkbox" checked={showArchivedStudents} onChange={e => setShowArchivedStudents(e.target.checked)} /> แสดงรายชื่อที่เก็บถาวร</label></div>
        {filteredStudents.length ? <div className={styles.tableWrap}><table><thead><tr><th>รหัสนักศึกษา</th><th>ชื่อ–สกุล</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{filteredStudents.slice(studentCurrent * 10, studentCurrent * 10 + 10).map(s => <tr key={s.id}><td>{s.student_number}</td><td>{s.full_name}</td><td>{s.is_archived ? 'เก็บถาวร' : 'ใช้งาน'}</td><td><div className={styles.actions}><button type="button" disabled={group.is_archived} onClick={() => setEditStudent(s)}>แก้ไข</button><button type="button" disabled={busy || group.is_archived} onClick={() => void archiveStudent(s)}>{s.is_archived ? 'นำกลับ' : 'เก็บถาวร'}</button></div></td></tr>)}</tbody></table></div> : <p className={styles.empty}>ยังไม่มีรายชื่อที่ตรงกับเงื่อนไข</p>}
        <Pagination page={studentCurrent} total={filteredStudents.length} onChange={setStudentPage} />
      </div>
      <div hidden={workspace !== 'sessions'} className={styles.stack}>
        <div className={styles.card}><div className={styles.sectionTitle}><div><h3>บันทึกการให้คำปรึกษา</h3><p>เลือกบันทึกเดิมหรือสร้างบันทึกครั้งใหม่</p></div><button type="button" className={styles.primary} disabled={group.is_archived} onClick={newSession}>+ สร้างบันทึก</button></div>
          <label className={styles.check}><input type="checkbox" checked={showArchivedSessions} onChange={e => setShowArchivedSessions(e.target.checked)} /> แสดงบันทึกที่เก็บถาวร</label>
          {visibleSessions.length ? <div className={styles.list}>{visibleSessions.slice(sessionCurrent * 10, sessionCurrent * 10 + 10).map(s => <div className={styles.listItem} key={s.id}><div><strong>{thaiDate(s.meeting_date)}</strong><p>{s.location || 'ไม่ได้ระบุสถานที่'}{s.is_archived ? ' · เก็บถาวร' : ''}</p></div><button type="button" onClick={() => openSession(s)}>เปิดบันทึก</button></div>)}</div> : <p className={styles.empty}>ยังไม่มีบันทึกการปรึกษา</p>}
          <Pagination page={sessionCurrent} total={visibleSessions.length} onChange={setSessionPage} />
        </div>
        {editorOpen && <div className={styles.card}><div className={styles.sectionTitle}><div><h3>{sessionId === null ? 'สร้างบันทึกการปรึกษา' : 'รายละเอียดการปรึกษา'}</h3><p>แบบบันทึกการให้คำปรึกษาเป็นรายกลุ่ม</p></div>{selectedSession && <button type="button" disabled={busy} onClick={() => void archiveSession()}>{selectedSession.is_archived ? 'นำบันทึกกลับ' : 'เก็บบันทึกถาวร'}</button>}</div>
          <form onSubmit={e => { e.preventDefault(); void saveSession(); }}>
            <div className={styles.formGrid}><label className={styles.field}>วันที่ให้คำปรึกษา *<input type="date" required value={form.meeting_date} onChange={e => setForm({ ...form, meeting_date: e.target.value })} /></label><label className={styles.field}>เวลาเริ่ม<input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></label><label className={styles.field}>เวลาสิ้นสุด<input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></label><label className={styles.field}>สถานที่<input maxLength={300} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></label></div>
            <div className={styles.formGrid}><label className={styles.field}>อาจารย์ที่ปรึกษา 1 *<input required maxLength={200} value={form.advisor1} onChange={e => setForm({ ...form, advisor1: e.target.value })} /></label><label className={styles.field}>อาจารย์ที่ปรึกษา 2<input maxLength={200} value={form.advisor2} onChange={e => setForm({ ...form, advisor2: e.target.value })} /></label><label className={styles.field}>อาจารย์ที่ปรึกษา 3<input maxLength={200} value={form.advisor3} onChange={e => setForm({ ...form, advisor3: e.target.value })} /></label></div>
            <p className={styles.hint}>ชื่ออาจารย์ที่ระบุใช้ในแบบบันทึก สิทธิ์ดูข้อมูลยังเป็นของผู้สร้างเท่านั้น</p>
            <label className={styles.field}>รายละเอียดในการประชุมกับนักศึกษา<textarea rows={5} maxLength={20000} value={form.discussion} onChange={e => setForm({ ...form, discussion: e.target.value })} /></label>
            <label className={styles.field}>ข้อสรุป / การให้คำแนะนำ<textarea rows={5} maxLength={20000} value={form.recommendations} onChange={e => setForm({ ...form, recommendations: e.target.value })} /></label>
            <h4>นัดหมายครั้งต่อไป</h4><p className={styles.hint}>หากไม่มีนัดหมาย ให้เว้นวันที่ว่าง</p><div className={styles.formGrid}><label className={styles.field}>วันที่นัดหมาย<input type="date" value={form.next_meeting_date} onChange={e => setForm({ ...form, next_meeting_date: e.target.value })} /></label><label className={styles.field}>เวลา<input type="time" value={form.next_meeting_time} onChange={e => setForm({ ...form, next_meeting_time: e.target.value })} /></label><label className={styles.field}>รายละเอียดนัดหมาย<input maxLength={1000} value={form.next_meeting_note} onChange={e => setForm({ ...form, next_meeting_note: e.target.value })} /></label></div>
            <div className={styles.actions}><button className={styles.primary} disabled={busy || group.is_archived || selectedSession?.is_archived}>บันทึกการปรึกษา</button>{sessionId !== null && <><button type="button" disabled={dirty || participantLoading} onClick={() => setShowPrintPreview(value => !value)}>{showPrintPreview ? 'ซ่อนตัวอย่างแบบพิมพ์' : 'ดูตัวอย่างแบบพิมพ์'}</button><button type="button" disabled={dirty || participantLoading} onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button></>}</div>{dirty && <p className={styles.notice}>มีการแก้ไขที่ยังไม่บันทึก กรุณาบันทึกก่อนพิมพ์</p>}
          </form>
          {sessionId !== null && <section className={styles.participants}><div className={styles.sectionTitle}><div><h3>รายชื่อผู้เข้าร่วม</h3><p>สถานะด้านล่างเป็นการบันทึกโดยอาจารย์ ไม่ใช่ลายมือชื่อของนักศึกษา</p></div><button type="button" onClick={() => void addParticipants()} disabled={busy || group.is_archived || selectedSession?.is_archived}>เพิ่มรายชื่อจากกลุ่ม</button></div>
            {participantLoading ? <p>กำลังโหลดรายชื่อ...</p> : participants.length ? <><div className={styles.tableWrap}><table><thead><tr><th>รหัสนักศึกษา</th><th>ชื่อ–สกุล ณ วันบันทึก</th><th>สถานะการเข้าร่วม</th></tr></thead><tbody>{participants.slice(participantCurrent * 10, participantCurrent * 10 + 10).map(p => <tr key={p.student_id}><td>{p.student_number_snapshot}</td><td>{p.full_name_snapshot}</td><td><select aria-label={`สถานะ ${p.full_name_snapshot}`} value={p.attendance_status} disabled={busy || group.is_archived || selectedSession?.is_archived} onChange={e => void setAttendance(p, e.target.value as Status)}>{STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></td></tr>)}</tbody></table></div><Pagination page={participantCurrent} total={participants.length} onChange={setParticipantPage} /></> : <p className={styles.empty}>ยังไม่มีรายชื่อผู้เข้าร่วม หากเพิ่มนักศึกษาในกลุ่มแล้วให้กด “เพิ่มรายชื่อจากกลุ่ม”</p>}
          </section>}
        </div>}
      </div>
    </>}
    {group && selectedSession && <div id="advising-print" className={`${styles.printArea} ${showPrintPreview ? styles.printPreview : ''}`}>
      <article className={styles.printRecord}><p className={styles.formNumber}>ทป.คก.01.06.2568</p><p className={styles.printCenter}>สาขาวิชาวิศวกรรมเครื่องกล ภาควิชาวิศวกรรมเครื่องกลและอุตสาหการ<br />คณะวิศวกรรมศาสตร์ มหาวิทยาลัยเทคโนโลยีราชมงคลกรุงเทพ</p><h2 className={styles.printCenter}>บันทึกการให้คำปรึกษาเป็นรายกลุ่ม</h2><p>กลุ่ม {group.name}{group.cohort ? ` · ${group.cohort}` : ''}</p><p>วันที่ {thaiDate(selectedSession.meeting_date)} &nbsp; เวลา {selectedSession.start_time?.slice(0, 5) || '—'} – {selectedSession.end_time?.slice(0, 5) || '—'} น.</p><p>สถานที่ {selectedSession.location || '—'}</p>{[0, 1, 2].map(i => <p key={i}>อาจารย์ที่ปรึกษา {i + 1} {selectedSession.advisors?.[i] || '....................................................................'}</p>)}<h3>รายละเอียดในการประชุมกับนักศึกษา</h3><p className={styles.printText}>{selectedSession.discussion || '................................................................................................................'}</p><h3>ข้อสรุป (การให้คำแนะนำ)</h3><p className={styles.printText}>{selectedSession.recommendations || '................................................................................................................'}</p><p>นัดหมายครั้งต่อไป: {selectedSession.next_meeting_date ? `${thaiDate(selectedSession.next_meeting_date)} ${selectedSession.next_meeting_time?.slice(0, 5) || ''} ${selectedSession.next_meeting_note || ''}` : selectedSession.next_meeting_note || 'ไม่นัดหมาย'}</p><div className={styles.signatures}>{selectedSession.advisors?.map((name, i) => <div key={i}>ลงชื่อ ......................................................<br />( {name} )<br />อาจารย์ที่ปรึกษา</div>)}</div></article>
      {printedPages.map((page, index) => <article key={index} className={styles.printRoster}><h3 className={styles.printCenter}>รายชื่อนักศึกษาที่เข้าร่วมการให้คำปรึกษา</h3><p>กลุ่ม {group.name} · วันที่ {thaiDate(selectedSession.meeting_date)} · หน้า {index + 1}/{printedPages.length}</p><table><thead><tr><th>ลำดับ</th><th>รหัสนักศึกษา</th><th>ชื่อ–สกุล</th><th>สถานะ</th><th>ลงลายมือชื่อ</th></tr></thead><tbody>{page.map((p, i) => <tr key={p.student_id}><td>{index * 20 + i + 1}</td><td>{p.student_number_snapshot}</td><td>{p.full_name_snapshot}</td><td>{STATUS.find(s => s.value === p.attendance_status)?.label}</td><td></td></tr>)}</tbody></table>{index === printedPages.length - 1 && <><p>หมายเหตุ: ให้นักศึกษาลงลายมือชื่อด้วยตนเอง สถานะในตารางเป็นข้อมูลที่อาจารย์บันทึก ไม่ใช่ลายมือชื่อ</p><div className={styles.signatures}><div>ลงชื่อ ......................................................<br />อาจารย์ที่ปรึกษา</div><div>ลงชื่อ ......................................................<br />อาจารย์ประธานหลักสูตร</div></div></>}</article>)}
    </div>}
  </section>;
}
