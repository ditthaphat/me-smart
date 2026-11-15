'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import Pagination from './Pagination';
import ChapterProgressPanel from './ChapterProgressPanel';
import styles from './materials.module.css';

type Course = { id: number; code: string; title: string; term: string };
type MaterialType = 'textbook' | 'lesson' | 'slides' | 'exercise' | 'teaching_plan' | 'other';
type MaterialStatus = 'draft' | 'review' | 'ready';
type Material = {
  id: number; course_id: number | null; title: string; material_type: MaterialType;
  material_status: MaterialStatus; version_label: string; external_url: string;
  notes: string; is_archived: boolean; created_at: string;
};
type Form = {
  title: string; courseId: string; materialType: MaterialType; materialStatus: MaterialStatus;
  versionLabel: string; externalUrl: string; notes: string;
};

const types: { value: MaterialType; label: string }[] = [
  { value: 'textbook', label: 'ตำรา' }, { value: 'lesson', label: 'บทเรียน' },
  { value: 'slides', label: 'สไลด์' }, { value: 'exercise', label: 'แบบฝึกหัด' },
  { value: 'teaching_plan', label: 'แผนการสอน' }, { value: 'other', label: 'เอกสารอื่น ๆ' },
];
const statuses: { value: MaterialStatus; label: string }[] = [
  { value: 'draft', label: 'ฉบับร่าง' }, { value: 'review', label: 'กำลังตรวจทาน' }, { value: 'ready', label: 'พร้อมใช้งาน' },
];
const emptyForm = (): Form => ({ title: '', courseId: '', materialType: 'textbook', materialStatus: 'draft', versionLabel: '', externalUrl: '', notes: '' });
const toForm = (item: Material): Form => ({ title: item.title, courseId: item.course_id === null ? '' : String(item.course_id), materialType: item.material_type, materialStatus: item.material_status, versionLabel: item.version_label, externalUrl: item.external_url, notes: item.notes });
const labelFor = <T extends string>(options: { value: T; label: string }[], value: T) => options.find(option => option.value === value)?.label ?? value;

function safeLink(value: string): string | null {
  if (!value.trim()) return '';
  try {
    const link = new URL(value.trim());
    return link.protocol === 'https:' && link.hostname && !link.username && !link.password ? link.href : null;
  } catch { return null; }
}
function errorText(value: unknown): string {
  const error = value as { code?: string; message?: string } | null;
  if (error?.code === '42P01' || error?.code === 'PGRST205') return 'ระบบเอกสารการสอนยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
  return error?.message || (value instanceof Error ? value.message : 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');
}

export default function MaterialsPanel({ teacherId, active }: { teacherId: string; active: boolean }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [items, setItems] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [coursesError, setCoursesError] = useState('');
  const [itemsError, setItemsError] = useState('');
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [savedForm, setSavedForm] = useState<Form>(emptyForm);
  const [deletePreview, setDeletePreview] = useState<Material | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [tracking, setTracking] = useState<Material | null>(null);
  const deleteHeading = useRef<HTMLHeadingElement | null>(null);
  const titleInput = useRef<HTMLInputElement | null>(null);
  const dirty = formOpen && JSON.stringify(form) !== JSON.stringify(savedForm);
  const coursesById = useMemo(() => new Map(courses.map(course => [course.id, course])), [courses]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!active) return;
    let current = true;
    void (async () => {
      try {
        const { data, error: e } = await db().from('courses').select('id,code,title,term').eq('teacher_id', teacherId).order('created_at', { ascending: false });
        if (e) throw e;
        if (current) { setCourses((data ?? []) as Course[]); setCoursesError(''); }
      } catch (e) { if (current) { setCourses([]); setCoursesError(`ไม่สามารถโหลดรายวิชา: ${errorText(e)}`); } }
    })();
    return () => { current = false; };
  }, [active, teacherId]);

  useEffect(() => {
    if (!active) return;
    let current = true;
    setLoading(true);
    void (async () => {
      try {
        let query = db().from('teaching_materials').select('id,course_id,title,material_type,material_status,version_label,external_url,notes,is_archived,created_at', { count: 'exact' }).eq('owner_id', teacherId);
        if (!showArchived) query = query.eq('is_archived', false);
        if (courseFilter) query = query.eq('course_id', Number(courseFilter));
        if (typeFilter) query = query.eq('material_type', typeFilter);
        if (searchTerm) query = query.ilike('title', `%${searchTerm.replace(/([\\%_])/g, '\\$1')}%`);
        const { data, error: e, count } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * 10, page * 10 + 9);
        if (e) throw e;
        if (!current) return;
        const nextTotal = count ?? 0;
        if (page > 0 && page * 10 >= nextTotal) { setPage(Math.max(0, Math.ceil(nextTotal / 10) - 1)); return; }
        setItems((data ?? []) as Material[]); setTotal(nextTotal); setItemsError('');
      } catch (e) { if (current) { setItems([]); setTotal(0); setItemsError(errorText(e)); } }
      finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [active, teacherId, page, searchTerm, courseFilter, typeFilter, showArchived, refresh]);

  useEffect(() => { if (deletePreview) deleteHeading.current?.focus(); }, [deletePreview]);

  function allowDiscard() {
    return !dirty || window.confirm('มีข้อมูลเอกสารที่ยังไม่ได้บันทึก ต้องการทิ้งการแก้ไขหรือไม่?');
  }
  function openNew() {
    if (!allowDiscard()) return;
    const next = emptyForm(); setEditing(null); setForm(next); setSavedForm(next); setFormOpen(true); setDeletePreview(null); setDeleteConfirmation(''); setError(''); setMessage('');
  }
  function openEdit(item: Material) {
    if (!allowDiscard()) return;
    const next = toForm(item); setEditing(item); setForm(next); setSavedForm(next); setFormOpen(true); setDeletePreview(null); setDeleteConfirmation(''); setError(''); setMessage('');
    setTimeout(() => titleInput.current?.focus(), 0);
  }
  function openProgress(item: Material) {
    if (!allowDiscard()) return;
    setFormOpen(false); setEditing(null); setForm(emptyForm()); setSavedForm(emptyForm()); setDeletePreview(null); setDeleteConfirmation(''); setError(''); setMessage(''); setTracking(item);
  }
  function closeForm() {
    if (!allowDiscard()) return;
    setFormOpen(false); setEditing(null); setForm(emptyForm()); setSavedForm(emptyForm());
  }
  async function save() {
    const title = form.title.trim();
    const link = safeLink(form.externalUrl);
    if (!title) { setError('กรุณากรอกชื่อเอกสาร'); return; }
    if (link === null) { setError('กรุณาใส่ลิงก์ที่ขึ้นต้นด้วย https:// หรือเว้นว่างไว้'); return; }
    const courseId = form.courseId ? Number(form.courseId) : null;
    if (courseId !== null && !coursesById.has(courseId)) { setError('กรุณาเลือกรายวิชาของอาจารย์'); return; }
    const payload = { owner_id: teacherId, course_id: courseId, title, material_type: form.materialType, material_status: form.materialStatus, version_label: form.versionLabel.trim(), external_url: link, notes: form.notes.trim() };
    setBusy(true); setError(''); setMessage('');
    try {
      const query = editing ? db().from('teaching_materials').update(payload).eq('id', editing.id).eq('owner_id', teacherId) : db().from('teaching_materials').insert(payload);
      const { data, error: e } = await query.select('id').single();
      if (e) throw e; if (!data?.id) throw new Error('ไม่สามารถยืนยันการบันทึก กรุณาลองอีกครั้ง');
      setFormOpen(false); setEditing(null); setForm(emptyForm()); setSavedForm(emptyForm());
      if (!editing) { setPage(0); setSearch(''); setSearchTerm(''); setCourseFilter(''); setTypeFilter(''); setShowArchived(false); }
      setRefresh(v => v + 1);
      setMessage(editing ? 'แก้ไขรายการเอกสารแล้ว' : 'เพิ่มรายการเอกสารแล้ว');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function archive(item: Material) {
    setBusy(true); setError(''); setMessage('');
    try {
      const { data, error: e } = await db().from('teaching_materials').update({ is_archived: !item.is_archived }).eq('id', item.id).eq('owner_id', teacherId).eq('is_archived', item.is_archived).select('id');
      if (e) throw e; if (!data?.length) throw new Error('รายการเปลี่ยนไป กรุณาอัปเดตแล้วลองใหม่');
      setRefresh(v => v + 1); setMessage(item.is_archived ? 'นำรายการกลับมาแล้ว' : 'เก็บรายการถาวรแล้ว');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function previewDelete(item: Material) {
    if (!allowDiscard()) return;
    setFormOpen(false); setEditing(null); setDeletePreview(item); setDeleteConfirmation(''); setError(''); setMessage('');
  }
  async function remove() {
    if (!deletePreview || deleteConfirmation.trim() !== 'ลบ') return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { data, error: e } = await db().from('teaching_materials').delete().eq('id', deletePreview.id).eq('owner_id', teacherId).eq('title', deletePreview.title).eq('version_label', deletePreview.version_label).select('id');
      if (e) throw e; if (!data?.length) throw new Error('รายการเปลี่ยนไป กรุณาอัปเดตแล้วตรวจสอบใหม่');
      setDeletePreview(null); setDeleteConfirmation(''); setRefresh(v => v + 1); setMessage('ลบรายการเอกสารแล้ว');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return <section className={styles.root} aria-label="เอกสารการสอน">
    {tracking ? <ChapterProgressPanel key={tracking.id} teacherId={teacherId} materialId={tracking.id} materialTitle={tracking.title} active={active} onBack={() => setTracking(null)} /> : <>
    <div className={styles.header}><div><p className={styles.eyebrow}>TEACHING MATERIALS</p><h2>เอกสารการสอนและตำรา</h2><p>จัดรายการตำรา บทเรียน และสื่อการสอนแยกตามรายวิชา</p></div><span className={styles.badge}>เฉพาะอาจารย์เจ้าของข้อมูล</span></div>
    <p className={styles.note}>ระบบเก็บรายละเอียดและลิงก์ ไม่ได้อัปโหลดไฟล์ การเปิดไฟล์ขึ้นอยู่กับสิทธิ์ที่กำหนดไว้ในแหล่งเก็บไฟล์</p>
    {(error || coursesError || itemsError) && <p role="alert" className={styles.error}>{error || coursesError || itemsError}</p>}{message && <p role="status" className={styles.success}>{message}</p>}
    <div className={styles.card}>
      <div className={styles.sectionTitle}><div><h3>รายการเอกสาร</h3><p>เวอร์ชันระบุเอง หากต้องการเก็บหลายเวอร์ชันให้เพิ่มเป็นรายการแยก</p></div><button type="button" className={styles.primary} disabled={busy} onClick={openNew}>+ เพิ่มเอกสาร</button></div>
      {formOpen && <form className={styles.editor} onSubmit={e => { e.preventDefault(); void save(); }} aria-label={editing ? 'แก้ไขเอกสาร' : 'เพิ่มเอกสาร'}>
        <h3>{editing ? 'แก้ไขเอกสาร' : 'เพิ่มเอกสาร'}</h3>
        <div className={styles.formGrid}>
          <label className={styles.field}>ชื่อเอกสาร *<input ref={titleInput} required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="เช่น ตำรากลศาสตร์ของไหล บทที่ 1" /></label>
          <label className={styles.field}>รายวิชา<select value={form.courseId} onChange={e => setForm({ ...form, courseId: e.target.value })}><option value="">ยังไม่ระบุรายวิชา</option>{courses.map(course => <option key={course.id} value={course.id}>{course.code} · {course.title} · {course.term}</option>)}</select></label>
          <label className={styles.field}>ประเภทเอกสาร<select value={form.materialType} onChange={e => setForm({ ...form, materialType: e.target.value as MaterialType })}>{types.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className={styles.field}>สถานะ<select value={form.materialStatus} onChange={e => setForm({ ...form, materialStatus: e.target.value as MaterialStatus })}>{statuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className={styles.field}>เวอร์ชัน<input maxLength={80} value={form.versionLabel} onChange={e => setForm({ ...form, versionLabel: e.target.value })} placeholder="เช่น 1.0 หรือ ฉบับปรับปรุง" /></label>
          <label className={styles.field}>ลิงก์ไฟล์<input type="url" maxLength={2048} value={form.externalUrl} onChange={e => setForm({ ...form, externalUrl: e.target.value })} placeholder="https://drive.google.com/..." /></label>
        </div>
        <label className={styles.field}>หมายเหตุ<textarea maxLength={2000} rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="เช่น ขอบเขตเนื้อหา หรือรายการที่ต้องตรวจสอบ" /></label>
        <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy}>บันทึกเอกสาร</button><button type="button" disabled={busy} onClick={closeForm}>ยกเลิก</button></div>
      </form>}
      {deletePreview && <form className={styles.deletePreview} onSubmit={e => { e.preventDefault(); void remove(); }} aria-label="ตรวจสอบการลบเอกสาร">
        <h3 ref={deleteHeading} tabIndex={-1}>ตรวจสอบก่อนลบรายการ</h3><p><strong>{deletePreview.title}</strong>{deletePreview.version_label ? ` · เวอร์ชัน ${deletePreview.version_label}` : ''}</p>
        <p>การลบจะลบรายการ รวมทั้งข้อมูลความก้าวหน้าของบทและหัวข้อที่เกี่ยวข้องออกจาก ME-Smart ถาวร ไฟล์ต้นฉบับที่เก็บใน Google Drive หรือแหล่งอื่นยังคงอยู่</p>
        <label className={styles.field}>พิมพ์คำว่า ลบ เพื่อยืนยัน<input aria-label="คำยืนยันลบเอกสาร" autoComplete="off" value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value)} /></label>
        <div className={styles.actions}><button type="submit" className={styles.danger} disabled={busy || deleteConfirmation.trim() !== 'ลบ'}>ลบรายการนี้ถาวร</button><button type="button" disabled={busy} onClick={() => { setDeletePreview(null); setDeleteConfirmation(''); }}>ยกเลิก</button></div>
      </form>}
      <div className={styles.filters}>
        <label className={styles.field}>ค้นหาเอกสาร<input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="ค้นหาชื่อเอกสาร" /></label>
        <label className={styles.field}>รายวิชา<select value={courseFilter} onChange={e => { setCourseFilter(e.target.value); setPage(0); }}><option value="">ทุกรายวิชา</option>{courses.map(course => <option key={course.id} value={course.id}>{course.code} · {course.title} · {course.term}</option>)}</select></label>
        <label className={styles.field}>ประเภท<select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }}><option value="">ทุกประเภท</option>{types.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      <label className={styles.check}><input type="checkbox" checked={showArchived} onChange={e => { setShowArchived(e.target.checked); setPage(0); }} /> แสดงรายการที่เก็บถาวร</label>
      {loading ? <p className={styles.empty}>กำลังโหลดเอกสาร...</p> : items.length ? <div className={styles.list}>{items.map(item => {
        const course = item.course_id === null ? null : coursesById.get(item.course_id);
        const link = safeLink(item.external_url);
        return <article className={styles.item} key={item.id}>
          <div><h4>{item.title}</h4><p>{course ? `${course.code} · ${course.title} · ${course.term}` : 'ยังไม่ระบุรายวิชา'}</p>
            <div className={styles.tags}><span>{labelFor(types, item.material_type)}</span><span>{labelFor(statuses, item.material_status)}</span>{item.version_label && <span>เวอร์ชัน {item.version_label}</span>}{item.is_archived && <span>เก็บถาวร</span>}</div>
            {item.notes && <p className={styles.itemNotes}>{item.notes}</p>}</div>
          <div className={styles.actions}>{link && <a href={link} target="_blank" rel="noopener noreferrer">เปิดลิงก์ ↗</a>}<button type="button" disabled={busy} onClick={() => openProgress(item)}>ติดตามรายบท</button><button type="button" disabled={busy} onClick={() => openEdit(item)}>แก้ไข</button><button type="button" disabled={busy} onClick={() => void archive(item)}>{item.is_archived ? 'นำกลับ' : 'เก็บถาวร'}</button><button type="button" className={styles.danger} disabled={busy} aria-label={`ลบ ${item.title}`} onClick={() => previewDelete(item)}>ลบ</button></div>
        </article>;
      })}</div> : <p className={styles.empty}>ยังไม่มีรายการเอกสารที่ตรงกับเงื่อนไข</p>}
      <Pagination page={page} total={total} onChange={setPage} />
    </div>
    </>}
  </section>;
}
