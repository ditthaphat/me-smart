'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/supabase';
import { bangkokToday, weightedProgress } from '../lib/research-progress';
import styles from './materials.module.css';
import research from './research.module.css';
import ResearchAccessPanel, { type ResearchMember } from './ResearchAccessPanel';

type Stage = 'planning' | 'active' | 'defended' | 'article' | 'finished';
type Category = 'research' | 'article';
type Project = { id: number; owner_id: string; title: string; members: string; project_stage: Stage; article_title: string; publication_target: string; article_due_date: string | null; external_url: string; notes: string; is_archived: boolean; created_at: string };
type Task = { id: number; owner_id: string; project_id: number; category: Category; title: string; assignee: string; start_date: string | null; due_date: string | null; progress: number; weight: number | string; notes: string; external_url: string; created_at: string; shared_with_students: boolean; assigned_to: string | null };
type ProjectForm = { title: string; members: string; project_stage: Stage; article_title: string; publication_target: string; article_due_date: string; external_url: string; notes: string };
type TaskForm = { category: Category; title: string; assignee: string; start_date: string; due_date: string; progress: string; weight: string; notes: string; external_url: string; shared_with_students: boolean; assigned_to: string };
type DeleteTarget = { kind: 'project'; item: Project } | { kind: 'task'; item: Task };
const stages: { value: Stage; label: string }[] = [
  { value: 'planning', label: 'เตรียมโครงงาน' }, { value: 'active', label: 'ดำเนินโครงงาน' },
  { value: 'defended', label: 'สอบผ่านแล้ว' }, { value: 'article', label: 'เขียนบทความ' }, { value: 'finished', label: 'เสร็จสิ้น' },
];
const emptyProject = (): ProjectForm => ({ title: '', members: '', project_stage: 'planning', article_title: '', publication_target: '', article_due_date: '', external_url: '', notes: '' });
const emptyTask = (): TaskForm => ({ category: 'research', title: '', assignee: '', start_date: '', due_date: '', progress: '0', weight: '1', notes: '', external_url: '', shared_with_students: false, assigned_to: '' });
const projectForm = (p: Project): ProjectForm => ({ title: p.title, members: p.members, project_stage: p.project_stage, article_title: p.article_title, publication_target: p.publication_target, article_due_date: p.article_due_date ?? '', external_url: p.external_url, notes: p.notes });
const taskForm = (t: Task): TaskForm => ({ category: t.category, title: t.title, assignee: t.assignee, start_date: t.start_date ?? '', due_date: t.due_date ?? '', progress: String(t.progress), weight: String(t.weight), notes: t.notes, external_url: t.external_url, shared_with_students: t.shared_with_students ?? false, assigned_to: t.assigned_to ?? '' });
const dateLabel = (v: string | null) => v ? new Intl.DateTimeFormat('th-TH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${v}T00:00:00+07:00`)) : 'ยังไม่กำหนด';
function safeLink(raw: string): string | null {
  if (!raw.trim()) return '';
  try { const url = new URL(raw.trim()); return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
function messageFor(error: unknown): string {
  const e = error as { message?: string; code?: string } | null;
  if (e?.code === '42P01' || e?.code === 'PGRST205') return 'ฐานข้อมูลส่วนงานวิจัยยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ';
  return e?.message || 'ไม่สามารถบันทึกข้อมูล กรุณาลองอีกครั้ง';
}
function Progress({ value }: { value: number | null }) {
  return value === null ? <span>ยังไม่มีงาน</span> : <div className={research.progressLine}><strong>{value}%</strong><progress max={100} value={value} aria-label={`ความก้าวหน้า ${value}%`} /></div>;
}

export default function ResearchPanel({ teacherId, active }: { teacherId: string; active: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [researchMembers, setResearchMembers] = useState<ResearchMember[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [projectOpen, setProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [project, setProject] = useState<ProjectForm>(emptyProject);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [task, setTask] = useState<TaskForm>(emptyTask);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (!active) return;
    let current = true; setLoading(true);
    void (async () => {
      try {
        const [p, t] = await Promise.all([
          db().from('research_projects').select('id,owner_id,title,members,project_stage,article_title,publication_target,article_due_date,external_url,notes,is_archived,created_at').eq('owner_id', teacherId).order('created_at', { ascending: false }),
          db().from('research_tasks').select('id,owner_id,project_id,category,title,assignee,start_date,due_date,progress,weight,notes,external_url,created_at,shared_with_students,assigned_to').eq('owner_id', teacherId).order('created_at', { ascending: true }),
        ]);
        if (p.error) throw p.error; if (t.error) throw t.error;
        if (current) { setProjects((p.data ?? []) as Project[]); setTasks((t.data ?? []) as Task[]); setError(''); }
      } catch (e) { if (current) setError(messageFor(e)); }
      finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [active, teacherId, refresh]);

  const visible = useMemo(() => projects.filter(p => showArchived || !p.is_archived), [projects, showArchived]);
  const selected = projects.find(p => p.id === selectedId) ?? null;
  const selectedTasks = useMemo(() => tasks.filter(t => t.project_id === selectedId), [tasks, selectedId]);
  const activeIds = useMemo(() => new Set(projects.filter(p => !p.is_archived).map(p => p.id)), [projects]);
  const activeTasks = useMemo(() => tasks.filter(t => activeIds.has(t.project_id)), [tasks, activeIds]);
  const today = bangkokToday();
  const overdue = activeTasks.filter(t => t.progress < 100 && t.due_date && t.due_date < today);
  const reminders = activeTasks.filter(t => t.progress < 100 && t.due_date && t.due_date >= today).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')).slice(0, 3);
  function resetMessages() { setError(''); setMessage(''); }
  function choose(p: Project) {
    if ((projectOpen || taskOpen || deleting) && !window.confirm('มีแบบฟอร์มเปิดอยู่ ต้องการปิดแบบฟอร์มและเปลี่ยนกลุ่มหรือไม่?')) return;
    setProjectOpen(false); setTaskOpen(false); setDeleting(null); setSelectedId(p.id); resetMessages();
  }
  function newProject() { if ((projectOpen || taskOpen) && !window.confirm('ต้องการปิดแบบฟอร์มที่เปิดอยู่หรือไม่?')) return; setProject(emptyProject()); setEditingProject(null); setProjectOpen(true); setTaskOpen(false); setDeleting(null); resetMessages(); }
  function editProject(p: Project) { if ((projectOpen || taskOpen) && !window.confirm('ต้องการปิดแบบฟอร์มที่เปิดอยู่หรือไม่?')) return; setEditingProject(p); setProject(projectForm(p)); setProjectOpen(true); setTaskOpen(false); setDeleting(null); resetMessages(); }
  function newTask() { if (!selected) return; if ((projectOpen || taskOpen) && !window.confirm('ต้องการปิดแบบฟอร์มที่เปิดอยู่หรือไม่?')) return; setTask(emptyTask()); setEditingTask(null); setTaskOpen(true); setProjectOpen(false); setDeleting(null); resetMessages(); }
  function editTask(t: Task) { if ((projectOpen || taskOpen) && !window.confirm('ต้องการปิดแบบฟอร์มที่เปิดอยู่หรือไม่?')) return; setTask(taskForm(t)); setEditingTask(t); setTaskOpen(true); setProjectOpen(false); setDeleting(null); resetMessages(); }
  async function saveProject(e: React.FormEvent) {
    e.preventDefault(); const link = safeLink(project.external_url);
    if (!project.title.trim()) { setError('กรุณากรอกชื่อโครงงาน'); return; }
    if (link === null) { setError('ลิงก์เอกสารต้องขึ้นต้นด้วย https:// หรือเว้นว่าง'); return; }
    setBusy(true); resetMessages();
    try {
      const payload = { owner_id: teacherId, title: project.title.trim(), members: project.members.trim(), project_stage: project.project_stage, article_title: project.article_title.trim(), publication_target: project.publication_target.trim(), article_due_date: project.article_due_date || null, external_url: link, notes: project.notes.trim() };
      const q = editingProject ? db().from('research_projects').update(payload).eq('id', editingProject.id).eq('owner_id', teacherId) : db().from('research_projects').insert(payload);
      const { data, error: e } = await q.select('id').single(); if (e) throw e; if (!data?.id) throw new Error('ไม่สามารถยืนยันการบันทึก');
      setSelectedId(data.id); setProjectOpen(false); setEditingProject(null); setRefresh(v => v + 1); setMessage('บันทึกข้อมูลโครงงานแล้ว');
    } catch (e) { setError(messageFor(e)); } finally { setBusy(false); }
  }
  async function saveTask(e: React.FormEvent) {
    e.preventDefault(); if (!selected || selected.is_archived) return;
    const link = safeLink(task.external_url); const progress = Number(task.progress); const weight = Number(task.weight);
    if (!task.title.trim()) { setError('กรุณากรอกชื่องาน'); return; }
    if (!Number.isInteger(progress) || progress < 0 || progress > 100 || task.progress.trim() === '') { setError('ความก้าวหน้าต้องเป็นจำนวนเต็ม 0–100'); return; }
    if (!Number.isFinite(weight) || weight <= 0 || weight > 1000) { setError('น้ำหนักงานต้องมากกว่า 0 และไม่เกิน 1,000'); return; }
    if (task.start_date && task.due_date && task.start_date > task.due_date) { setError('วันเริ่มต้องไม่อยู่หลังวันครบกำหนด'); return; }
    if (link === null) { setError('ลิงก์ผลงานต้องขึ้นต้นด้วย https:// หรือเว้นว่าง'); return; }
    setBusy(true); resetMessages();
    try {
      const payload = { owner_id: teacherId, project_id: selected.id, category: task.category, title: task.title.trim(), assignee: task.assignee.trim(), start_date: task.start_date || null, due_date: task.due_date || null, progress, weight, notes: task.notes.trim(), external_url: link, shared_with_students: task.shared_with_students, assigned_to: task.assigned_to || null };
      const q = editingTask ? db().from('research_tasks').update(payload).eq('id', editingTask.id).eq('project_id', selected.id).eq('owner_id', teacherId) : db().from('research_tasks').insert(payload);
      const { data, error: e } = await q.select('id').single(); if (e) throw e; if (!data?.id) throw new Error('ไม่สามารถยืนยันการบันทึก');
      setTaskOpen(false); setEditingTask(null); setRefresh(v => v + 1); setMessage('บันทึกงานแล้ว');
    } catch (e) { setError(messageFor(e)); } finally { setBusy(false); }
  }
  async function archive(p: Project) {
    if ((projectOpen || taskOpen || deleting) && !window.confirm('ต้องการปิดแบบฟอร์มที่เปิดอยู่ก่อนเปลี่ยนสถานะโครงงานหรือไม่?')) return;
    setProjectOpen(false); setTaskOpen(false); setDeleting(null);
    setBusy(true); resetMessages();
    try {
      const { data, error: e } = await db().from('research_projects').update({ is_archived: !p.is_archived }).eq('id', p.id).eq('owner_id', teacherId).eq('is_archived', p.is_archived).select('id');
      if (e) throw e; if (!data?.length) throw new Error('ข้อมูลเปลี่ยนไป กรุณาอัปเดตแล้วลองใหม่');
      if (!p.is_archived && selectedId === p.id) setSelectedId(null);
      setRefresh(v => v + 1); setMessage(p.is_archived ? 'คืนโครงงานแล้ว' : 'เก็บโครงงานถาวรแล้ว สามารถเลือกแสดงและคืนกลับได้');
    } catch (e) { setError(messageFor(e)); } finally { setBusy(false); }
  }
  function askDelete(target: DeleteTarget) {
    if ((projectOpen || taskOpen) && !window.confirm('ต้องการปิดแบบฟอร์มที่เปิดอยู่ก่อนลบรายการหรือไม่?')) return;
    setProjectOpen(false); setTaskOpen(false); setDeleting(target); setConfirmText(''); resetMessages();
  }
  async function remove(e: React.FormEvent) {
    e.preventDefault(); if (!deleting || confirmText.trim() !== 'ลบ') return; setBusy(true); resetMessages();
    try {
      const table = deleting.kind === 'project' ? 'research_projects' : 'research_tasks';
      const { data, error: err } = await db().from(table).delete().eq('id', deleting.item.id).eq('owner_id', teacherId).eq('title', deleting.item.title).select('id');
      if (err) throw err; if (!data?.length) throw new Error('รายการเปลี่ยนไป กรุณาอัปเดตแล้วลองใหม่');
      if (deleting.kind === 'project' && selectedId === deleting.item.id) setSelectedId(null);
      setDeleting(null); setConfirmText(''); setRefresh(v => v + 1); setMessage('ลบรายการแล้ว');
    } catch (err) { setError(messageFor(err)); } finally { setBusy(false); }
  }

  return <div className={styles.root} aria-label="งานวิจัย">
    <div className={styles.header}><div><p className={styles.eyebrow}>RESEARCH WORKSPACE</p><h2>ติดตามโครงงานและบทความ</h2><p>ภาพรวมงานวิจัยของกลุ่มนักศึกษา และงานเขียนบทความที่มอบหมาย</p></div><span className={styles.badge}>เฉพาะอาจารย์เจ้าของข้อมูล</span></div>
    <p className={styles.note}>อาจารย์อนุมัตินักศึกษาเข้ากลุ่มและเลือกเปิดงานเป็นรายรายการ นักศึกษาส่งรายงานความก้าวหน้าให้อาจารย์ตรวจได้ ไฟล์งานฝากไว้ภายนอกและบันทึกเป็นลิงก์ได้</p>
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.success} role="status">{message}</p>}
    <div className={styles.statGrid} aria-label="สรุปงานวิจัย"><div><strong>{projects.filter(p => !p.is_archived).length}</strong><span>โครงงานที่ติดตาม</span></div><div><strong>{activeTasks.filter(t => t.progress < 100).length}</strong><span>งานที่ยังไม่เสร็จ</span></div><div><strong>{overdue.length}</strong><span>งานเลยกำหนด</span></div></div>
    <section className={styles.card}><div className={styles.sectionTitle}><div><h3>ตารางความก้าวหน้ารายกลุ่ม</h3><p>ความก้าวหน้าคิดจากสัดส่วนน้ำหนักและเปอร์เซ็นต์ที่อาจารย์บันทึก</p></div><button type="button" className={styles.primary} onClick={newProject} disabled={busy}>+ เพิ่มโครงงาน</button></div>
      <label className={styles.check}><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />แสดงโครงงานที่เก็บถาวร</label>
      {loading && <p className={styles.note}>กำลังโหลดข้อมูล…</p>}
      {!loading && !error && !visible.length && <p className={styles.empty}>ยังไม่มีโครงงาน กด “เพิ่มโครงงาน” เพื่อเริ่มต้น</p>}
      {!!visible.length && <div className={research.tableWrap}><table className={research.table}><thead><tr><th>โครงงาน / กลุ่ม</th><th>ขั้นตอน</th><th>โครงงาน</th><th>บทความ</th><th>กำหนดบทความ</th><th>จัดการ</th></tr></thead><tbody>{visible.map(p => {
        const own = tasks.filter(t => t.project_id === p.id); return <tr key={p.id}><td><strong>{p.title}</strong>{p.is_archived && <span className={research.muted}> · เก็บถาวร</span>}</td><td>{stages.find(s => s.value === p.project_stage)?.label}</td><td><Progress value={weightedProgress(own.filter(t => t.category === 'research'))} /></td><td><Progress value={weightedProgress(own.filter(t => t.category === 'article'))} /></td><td>{dateLabel(p.article_due_date)}</td><td><div className={styles.actions}><button type="button" onClick={() => choose(p)}>ดูงาน</button><button type="button" onClick={() => editProject(p)}>แก้ไข</button><button type="button" onClick={() => void archive(p)} disabled={busy}>{p.is_archived ? 'คืนโครงงาน' : 'เก็บถาวร'}</button><button type="button" className={styles.danger} onClick={() => askDelete({ kind: 'project', item: p })}>ลบ</button></div></td></tr>;
      })}</tbody></table></div>}
    </section>
    {projectOpen && <section className={styles.card}><form aria-label={editingProject ? 'แก้ไขโครงงาน' : 'เพิ่มโครงงาน'} onSubmit={e => void saveProject(e)}><h3>{editingProject ? 'แก้ไขโครงงาน' : 'เพิ่มโครงงาน'}</h3><div className={styles.formGrid}>
      <label className={styles.field}>ชื่อโครงงาน / ชื่อกลุ่ม *<input required maxLength={240} value={project.title} onChange={e => setProject({ ...project, title: e.target.value })} /></label>
      <label className={styles.field}>ขั้นตอนโครงงาน<select value={project.project_stage} onChange={e => setProject({ ...project, project_stage: e.target.value as Stage })}>{stages.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
      <label className={styles.field}>รายชื่อสมาชิก<textarea rows={3} maxLength={4000} placeholder="ชื่อสมาชิกแต่ละคน" value={project.members} onChange={e => setProject({ ...project, members: e.target.value })} /></label>
      <label className={styles.field}>ชื่อบทความ<textarea rows={3} maxLength={400} value={project.article_title} onChange={e => setProject({ ...project, article_title: e.target.value })} /></label>
      <label className={styles.field}>วารสาร / งานประชุมเป้าหมาย<input maxLength={400} value={project.publication_target} onChange={e => setProject({ ...project, publication_target: e.target.value })} /></label>
      <label className={styles.field}>วันเป้าหมายส่งบทความ<input type="date" value={project.article_due_date} onChange={e => setProject({ ...project, article_due_date: e.target.value })} /></label>
      <label className={styles.field}>ลิงก์โฟลเดอร์หรือบทความ<input type="url" maxLength={2000} placeholder="https://..." value={project.external_url} onChange={e => setProject({ ...project, external_url: e.target.value })} /></label>
      <label className={styles.field}>หมายเหตุ<textarea rows={3} maxLength={4000} value={project.notes} onChange={e => setProject({ ...project, notes: e.target.value })} /></label>
      </div><div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy}>บันทึกโครงงาน</button><button type="button" onClick={() => setProjectOpen(false)} disabled={busy}>ยกเลิก</button></div></form></section>}
    {deleting && <section className={styles.deletePreview}><form aria-label="ยืนยันการลบงานวิจัย" onSubmit={e => void remove(e)}><h3>ยืนยันการลบ{deleting.kind === 'project' ? 'โครงงาน' : 'งาน'}</h3><p>รายการ: <strong>{deleting.item.title}</strong></p><p>{deleting.kind === 'project' ? `งานทั้งหมด ${tasks.filter(t => t.project_id === deleting.item.id).length} รายการ รวมทั้งสมาชิกและรายงานความก้าวหน้าของโครงงานนี้จะถูกลบถาวรด้วย` : 'งานรายการนี้และรายงานความก้าวหน้าที่เกี่ยวข้องจะถูกลบถาวร'}</p><label className={styles.field}>พิมพ์คำว่า ลบ เพื่อยืนยัน<input value={confirmText} onChange={e => setConfirmText(e.target.value)} /></label><div className={styles.actions}><button type="submit" className={styles.danger} disabled={busy || confirmText.trim() !== 'ลบ'}>ลบถาวร</button><button type="button" onClick={() => setDeleting(null)} disabled={busy}>ยกเลิก</button></div></form></section>}
    {selected && <section className={styles.card} aria-label="รายละเอียดโครงงาน"><div className={styles.sectionTitle}><div><h3>{selected.title}</h3><p className={research.members}>สมาชิก: {selected.members || 'ยังไม่ระบุ'}</p><p>บทความ: {selected.article_title || 'ยังไม่ระบุ'} · เป้าหมาย: {selected.publication_target || 'ยังไม่ระบุ'}</p>{selected.external_url && <p><a href={selected.external_url} target="_blank" rel="noopener noreferrer">เปิดลิงก์เอกสารโครงงาน</a></p>}</div>{!selected.is_archived && <button type="button" className={styles.primary} onClick={newTask} disabled={busy}>+ เพิ่มงาน</button>}</div>
      {selected.is_archived && <p className={styles.note}>โครงงานนี้เก็บถาวรแล้ว สามารถดูข้อมูลได้ หากต้องการแก้ไขกรุณากด “คืนโครงงาน” ในตาราง</p>}
      {!selected.is_archived && <ResearchAccessPanel key={selected.id} projectId={selected.id} tasks={selectedTasks} onMembers={setResearchMembers} onTaskReviewed={() => setRefresh(v => v + 1)} />}
      <div className={research.summary}><div>งานโครงงาน <Progress value={weightedProgress(selectedTasks.filter(t => t.category === 'research'))} /></div><div>งานบทความ <Progress value={weightedProgress(selectedTasks.filter(t => t.category === 'article'))} /></div></div>
      <p className={styles.note}>กำหนดงานได้ทั้งโครงงานและบทความ เช่น บทนำ วิธีวิจัย ผลและวิจารณ์ผล ตรวจรูปแบบ หรือส่งบทความ หากงานสำคัญเท่ากันให้ใส่น้ำหนัก 1 ทุกงาน</p>
      {!selectedTasks.length ? <p className={styles.empty}>ยังไม่มีงานในโครงงานนี้</p> : <div className={research.tableWrap}><table className={research.table}><thead><tr><th>งาน</th><th>ประเภท</th><th>ผู้รับผิดชอบ</th><th>วันเริ่ม – ครบกำหนด</th><th>ความก้าวหน้า</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{selectedTasks.map(t => <tr key={t.id}><td><strong>{t.title}</strong><small>{t.shared_with_students ? 'เปิดให้นักศึกษาดู' : 'เฉพาะอาจารย์'}</small>{t.notes && <p className={research.notes}>{t.notes}</p>}{t.external_url && <a href={t.external_url} target="_blank" rel="noopener noreferrer">เปิดลิงก์งาน</a>}</td><td>{t.category === 'research' ? 'โครงงาน' : 'บทความ'}</td><td>{t.assignee || 'ยังไม่ระบุ'}</td><td>{dateLabel(t.start_date)} – {dateLabel(t.due_date)}</td><td><Progress value={t.progress} /><small>น้ำหนัก {t.weight}</small></td><td>{t.progress === 100 ? 'เสร็จแล้ว' : t.due_date && t.due_date < today ? <strong className={research.late}>เลยกำหนด</strong> : t.due_date === today ? 'ครบกำหนดวันนี้' : t.progress === 0 ? 'ยังไม่เริ่ม' : 'กำลังดำเนินงาน'}</td><td>{!selected.is_archived && <div className={styles.actions}><button type="button" onClick={() => editTask(t)}>แก้ไข</button><button type="button" className={styles.danger} onClick={() => askDelete({ kind: 'task', item: t })}>ลบ</button></div>}</td></tr>)}</tbody></table></div>}
    </section>}
    {taskOpen && selected && !selected.is_archived && <section className={styles.card}><form aria-label={editingTask ? 'แก้ไขงาน' : 'เพิ่มงาน'} onSubmit={e => void saveTask(e)}><h3>{editingTask ? 'แก้ไขงาน' : 'เพิ่มงาน'} · {selected.title}</h3><div className={styles.formGrid}>
      <label className={styles.field}>ชื่องาน *<input required maxLength={240} value={task.title} onChange={e => setTask({ ...task, title: e.target.value })} /></label>
      <label className={styles.field}>ประเภทงาน<select value={task.category} onChange={e => setTask({ ...task, category: e.target.value as Category })}><option value="research">โครงงานวิจัย</option><option value="article">บทความ / วารสาร</option></select></label>
      <label className={styles.field}>บัญชีนักศึกษาที่รับผิดชอบ<select value={task.assigned_to} onChange={e => { const value=e.target.value; const member=researchMembers.find(m => m.student_id===value); setTask({ ...task, assigned_to:value, assignee:member?.full_name ?? '' }); }}><option value="">ทั้งกลุ่มที่ได้รับอนุมัติ</option>{task.assigned_to && !researchMembers.some(m => m.student_id===task.assigned_to && m.status==='approved') && <option value={task.assigned_to}>สมาชิกไม่มีสิทธิ์แล้ว</option>}{researchMembers.filter(m => m.status==='approved').map(m => <option key={m.student_id} value={m.student_id}>{m.full_name} · {m.student_number}</option>)}</select></label>
      <label className={styles.field}>ชื่อผู้รับผิดชอบที่แสดง<input maxLength={400} value={task.assignee} onChange={e => setTask({ ...task, assignee: e.target.value })} /></label>
      <label className={styles.field}>วันเริ่ม<input type="date" value={task.start_date} onChange={e => setTask({ ...task, start_date: e.target.value })} /></label>
      <label className={styles.field}>วันครบกำหนด<input type="date" value={task.due_date} onChange={e => setTask({ ...task, due_date: e.target.value })} /></label>
      <label className={styles.field}>ความก้าวหน้า 0–100%<input required type="number" min="0" max="100" step="1" value={task.progress} onChange={e => setTask({ ...task, progress: e.target.value })} /></label>
      <label className={styles.field}>น้ำหนักงาน<input required type="number" min="0.01" max="1000" step="0.01" value={task.weight} onChange={e => setTask({ ...task, weight: e.target.value })} /></label>
      <label className={styles.field}>ลิงก์ผลงาน<input type="url" maxLength={2000} placeholder="https://..." value={task.external_url} onChange={e => setTask({ ...task, external_url: e.target.value })} /></label>
      <label className={styles.field}>รายละเอียด / สิ่งที่ต้องแก้ไข<textarea rows={3} maxLength={4000} value={task.notes} onChange={e => setTask({ ...task, notes: e.target.value })} /></label>
      </div><label className={styles.check}><input type="checkbox" checked={task.shared_with_students} onChange={e => setTask({...task, shared_with_students:e.target.checked})} />เปิดงานนี้ให้นักศึกษาที่ได้รับสิทธิ์ดูและรายงานความก้าวหน้า</label><div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy}>บันทึกงาน</button><button type="button" onClick={() => setTaskOpen(false)} disabled={busy}>ยกเลิก</button></div></form></section>}
    {!!reminders.length && <section className={styles.card}><h3>กำหนดส่งที่กำลังจะมาถึง</h3><ul>{reminders.map(t => <li key={t.id}>{dateLabel(t.due_date)} · {projects.find(p => p.id === t.project_id)?.title} · {t.title}</li>)}</ul></section>}
  </div>;
}
