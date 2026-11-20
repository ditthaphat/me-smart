'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { bangkokDate, summarizeChapters, type Chapter, type Topic, type TopicStatus, type ChapterState } from '../lib/chapter-progress';
import styles from './chapter-progress.module.css';

const topicStatuses: { value: TopicStatus; label: string }[] = [
  { value: 'todo', label: 'ยังไม่เริ่ม' }, { value: 'writing', label: 'กำลังดำเนินการ' },
  { value: 'review', label: 'รอตรวจทาน' }, { value: 'done', label: 'เสร็จสมบูรณ์' },
];
const stateLabels: Record<ChapterState, string> = {
  unplanned: 'ยังไม่กำหนดหัวข้อ', done: 'เสร็จสมบูรณ์', overdue: 'เลยกำหนด',
  due_today: 'ครบกำหนดวันนี้', not_started: 'ยังไม่เริ่ม', in_progress: 'กำลังดำเนินการ',
};
type ChapterForm = { number: string; title: string; dueDate: string };
type DeleteTarget = { kind: 'chapter'; chapter: Chapter; topicCount: number } | { kind: 'topic'; topic: Topic };
const statusLabel = (status: TopicStatus) => topicStatuses.find(option => option.value === status)?.label ?? status;
const displayDate = (date: string | null) => date ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : 'ยังไม่กำหนด';
function errorText(value: unknown) {
  const error = value as { code?: string; message?: string } | null;
  if (error?.code === '42P01' || error?.code === 'PGRST205') return 'ระบบติดตามรายบทยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
  if (error?.code === '23505') return 'มีหมายเลขบทนี้อยู่แล้ว กรุณาเลือกหมายเลขอื่น';
  return error?.message || (value instanceof Error ? value.message : 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');
}

export default function ChapterProgressPanel({ teacherId, materialId, materialTitle, active, onBack, onDirtyChange }: {
  teacherId: string; materialId: number; materialTitle: string; active: boolean; onBack: () => void; onDirtyChange?: (dirty: boolean) => void;
}) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [today, setToday] = useState(() => bangkokDate());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [chapterFormOpen, setChapterFormOpen] = useState(false);
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [chapterForm, setChapterForm] = useState<ChapterForm>({ number: '', title: '', dueDate: '' });
  const [initialChapterForm, setInitialChapterForm] = useState<ChapterForm>({ number: '', title: '', dueDate: '' });
  const [newTopics, setNewTopics] = useState('');
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [topicTitle, setTopicTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const chapterHeading = useRef<HTMLHeadingElement | null>(null);
  const deleteHeading = useRef<HTMLHeadingElement | null>(null);
  const selected = chapters.find(chapter => chapter.id === selectedId) ?? null;
  const selectedTopics = topics.filter(topic => topic.chapter_id === selectedId);
  const summary = useMemo(() => summarizeChapters(chapters, topics, today), [chapters, topics, today]);
  const dirty = (chapterFormOpen && JSON.stringify(chapterForm) !== JSON.stringify(initialChapterForm)) || Boolean(newTopics.trim()) || Boolean(editingTopic && topicTitle !== editingTopic.title);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!active) return;
    let current = true;
    setLoading(true);
    async function readAll<T>(table: string, fields: string): Promise<T[]> {
      const rows: T[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error: e } = await db().from(table).select(fields).eq('owner_id', teacherId).eq('material_id', materialId).order('id', { ascending: true }).range(from, from + 499);
        if (e) throw e;
        const page = (data ?? []) as T[]; rows.push(...page);
        if (page.length < 500) return rows;
      }
    }
    void (async () => {
      try {
        const [nextChapters, nextTopics] = await Promise.all([
          readAll<Chapter>('material_chapters', 'id,material_id,chapter_number,title,due_date'),
          readAll<Topic>('material_topics', 'id,material_id,chapter_id,title,topic_status'),
        ]);
        if (current) { setChapters(nextChapters); setTopics(nextTopics); setError(''); }
      } catch (e) { if (current) setError(errorText(e)); }
      finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [active, teacherId, materialId, refresh]);
  useEffect(() => { if (deleteTarget) deleteHeading.current?.focus(); }, [deleteTarget]);
  useEffect(() => {
    if (!active) return;
    setToday(bangkokDate());
    const timer = setInterval(() => setToday(bangkokDate()), 60_000);
    return () => clearInterval(timer);
  }, [active]);

  function allowDiscard() { return !dirty || window.confirm('มีข้อมูลบทหรือหัวข้อที่ยังไม่ได้บันทึก ต้องการทิ้งการแก้ไขหรือไม่?'); }
  function resetEditors() { setChapterFormOpen(false); setEditingChapter(null); setNewTopics(''); setEditingTopic(null); setTopicTitle(''); setDeleteTarget(null); setConfirmation(''); }
  function goBack() { if (allowDiscard()) onBack(); }
  function openNewChapter() {
    if (!allowDiscard()) return;
    resetEditors();
    const next = { number: String(chapters.length ? Math.max(...chapters.map(chapter => chapter.chapter_number)) + 1 : 1), title: '', dueDate: '' };
    setChapterForm(next); setInitialChapterForm(next); setChapterFormOpen(true); setError(''); setMessage('');
  }
  function openEditChapter(chapter: Chapter) {
    if (!allowDiscard()) return;
    resetEditors();
    const next = { number: String(chapter.chapter_number), title: chapter.title, dueDate: chapter.due_date ?? '' };
    setChapterForm(next); setInitialChapterForm(next); setEditingChapter(chapter); setChapterFormOpen(true); setError(''); setMessage('');
  }
  function selectChapter(chapter: Chapter) {
    if (!allowDiscard()) return;
    resetEditors(); setSelectedId(chapter.id); setError(''); setMessage('');
    setTimeout(() => chapterHeading.current?.focus(), 0);
  }
  async function saveChapter() {
    const title = chapterForm.title.trim(); const number = Number(chapterForm.number);
    if (!chapterForm.number.trim() || !Number.isInteger(number) || number < 0 || number > 999 || !title) { setError('กรุณาระบุหมายเลขบท 0–999 และชื่อบท'); return; }
    if (chapters.some(chapter => chapter.chapter_number === number && chapter.id !== editingChapter?.id)) { setError('มีหมายเลขบทนี้อยู่แล้ว กรุณาเลือกหมายเลขอื่น'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const payload = { owner_id: teacherId, material_id: materialId, chapter_number: number, title, due_date: chapterForm.dueDate || null };
      const query = editingChapter ? db().from('material_chapters').update(payload).eq('id', editingChapter.id).eq('owner_id', teacherId).eq('material_id', materialId) : db().from('material_chapters').insert(payload);
      const { data, error: e } = await query.select('id').single();
      if (e) throw e; if (!data?.id) throw new Error('ไม่สามารถยืนยันการบันทึกบท');
      setChapterFormOpen(false); setEditingChapter(null); setSelectedId(Number(data.id)); setRefresh(v => v + 1); setMessage('บันทึกบทแล้ว');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function addTopics() {
    if (!selected) return;
    const names = newTopics.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (!names.length || names.length > 100 || names.some(name => name.length > 200)) { setError('กรุณากรอกชื่อหัวข้อ 1–100 บรรทัด โดยแต่ละหัวข้อยาวไม่เกิน 200 ตัวอักษร'); return; }
    const normalized = names.map(name => name.toLocaleLowerCase());
    if (new Set(normalized).size !== normalized.length || normalized.some(name => selectedTopics.some(topic => topic.title.trim().toLocaleLowerCase() === name))) { setError('พบชื่อหัวข้อซ้ำในบทนี้ กรุณาตรวจสอบ'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const payload = names.map(title => ({ owner_id: teacherId, material_id: materialId, chapter_id: selected.id, title, topic_status: 'todo' }));
      const { data, error: e } = await db().from('material_topics').insert(payload).select('id');
      if (e) throw e; if (data?.length !== names.length) throw new Error('ไม่สามารถยืนยันจำนวนหัวข้อที่บันทึก');
      setNewTopics(''); setRefresh(v => v + 1); setMessage(`เพิ่มหัวข้อ ${names.length} รายการแล้ว`);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function setTopicStatus(topic: Topic, status: TopicStatus) {
    setBusy(true); setError(''); setMessage('');
    try {
      const { data, error: e } = await db().from('material_topics').update({ topic_status: status }).eq('id', topic.id).eq('owner_id', teacherId).eq('material_id', materialId).select('id');
      if (e) throw e; if (!data?.length) throw new Error('ไม่สามารถบันทึกสถานะหัวข้อ');
      setTopics(rows => rows.map(row => row.id === topic.id ? { ...row, topic_status: status } : row)); setMessage('บันทึกสถานะหัวข้อแล้ว');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function saveTopicTitle() {
    if (!editingTopic) return;
    const title = topicTitle.trim();
    if (!title || title.length > 200) { setError('กรุณากรอกชื่อหัวข้อไม่เกิน 200 ตัวอักษร'); return; }
    if (selectedTopics.some(topic => topic.id !== editingTopic.id && topic.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase())) { setError('มีชื่อหัวข้อนี้อยู่แล้ว'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const { data, error: e } = await db().from('material_topics').update({ title }).eq('id', editingTopic.id).eq('owner_id', teacherId).eq('material_id', materialId).select('id');
      if (e) throw e; if (!data?.length) throw new Error('ไม่สามารถบันทึกชื่อหัวข้อ');
      setEditingTopic(null); setTopicTitle(''); setRefresh(v => v + 1); setMessage('แก้ไขหัวข้อแล้ว');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function previewDelete(target: DeleteTarget) {
    if (!allowDiscard()) return;
    resetEditors(); setDeleteTarget(target); setConfirmation(''); setError(''); setMessage('');
  }
  async function remove() {
    if (!deleteTarget || confirmation.trim() !== 'ลบ') return;
    setBusy(true); setError(''); setMessage('');
    try {
      const table = deleteTarget.kind === 'chapter' ? 'material_chapters' : 'material_topics';
      const item = deleteTarget.kind === 'chapter' ? deleteTarget.chapter : deleteTarget.topic;
      const { data, error: e } = await db().from(table).delete().eq('id', item.id).eq('owner_id', teacherId).eq('material_id', materialId).eq('title', item.title).select('id');
      if (e) throw e; if (!data?.length) throw new Error('รายการเปลี่ยนไป กรุณาอัปเดตแล้วตรวจสอบใหม่');
      if (deleteTarget.kind === 'chapter' && selectedId === item.id) setSelectedId(null);
      setDeleteTarget(null); setConfirmation(''); setRefresh(v => v + 1); setMessage(deleteTarget.kind === 'chapter' ? 'ลบบทแล้ว' : 'ลบหัวข้อแล้ว');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return <section className={styles.root} aria-label="ติดตามความก้าวหน้ารายบท">
    <div className={styles.header}><div><p className={styles.eyebrow}>CHAPTER PROGRESS</p><h2>ความก้าวหน้ารายบท</h2><p>{materialTitle}</p></div><button type="button" disabled={busy} onClick={goBack}>← กลับไปรายการเอกสาร</button></div>
    <p className={styles.note}>เปอร์เซ็นต์ = จำนวนหัวข้อที่เลือก “เสร็จสมบูรณ์” ÷ จำนวนหัวข้อทั้งหมด แต่ละหัวข้อมีน้ำหนักเท่ากัน บทที่ไม่มีหัวข้อยังคำนวณไม่ได้ รายการที่ยังไม่เสร็จอ้างอิงเฉพาะหัวข้อที่อาจารย์เพิ่มไว้</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className={styles.success}>{message}</p>}
    <div className={styles.metrics}>
      <article><span>ความก้าวหน้ารวม</span><strong>{summary.percent === null ? 'ยังคำนวณไม่ได้' : `${summary.percent}%`}</strong><small>หัวข้อเสร็จ {summary.completed} จาก {summary.total}</small></article>
      <article><span>จำนวนบท</span><strong>{chapters.length}</strong><small>ยังไม่กำหนดหัวข้อ {summary.unplanned} บท</small></article>
      <article><span>หัวข้อที่ยังไม่เสร็จ</span><strong>{summary.total - summary.completed}</strong><small>รวมที่ยังไม่เริ่ม ดำเนินการ และรอตรวจทาน</small></article>
      <article><span>บทที่เลยกำหนด</span><strong>{summary.overdue}</strong><small>เฉพาะบทที่ระบุวันเป้าหมาย</small></article>
    </div>
    <div className={styles.card}>
      <div className={styles.sectionTitle}><div><h3>ตารางความก้าวหน้า</h3><p>กำหนดวันเป้าหมายของแต่ละบทเพื่อดูว่าบทใดเลยกำหนด</p></div><button type="button" className={styles.primary} disabled={busy || loading} onClick={openNewChapter}>+ เพิ่มบท</button></div>
      {chapterFormOpen && <form className={styles.editor} aria-label={editingChapter ? 'แก้ไขบท' : 'เพิ่มบท'} onSubmit={e => { e.preventDefault(); void saveChapter(); }}>
        <h3>{editingChapter ? 'แก้ไขบท' : 'เพิ่มบท'}</h3><div className={styles.formGrid}>
          <label className={styles.field}>หมายเลขบท *<input required type="number" min="0" max="999" step="1" value={chapterForm.number} onChange={e => setChapterForm({ ...chapterForm, number: e.target.value })} /></label>
          <label className={styles.field}>ชื่อบท *<input required maxLength={200} value={chapterForm.title} onChange={e => setChapterForm({ ...chapterForm, title: e.target.value })} placeholder="เช่น บทนำวิธีไฟไนต์เอลิเมนต์" /></label>
          <label className={styles.field}>วันเป้าหมายแล้วเสร็จ<input type="date" value={chapterForm.dueDate} onChange={e => setChapterForm({ ...chapterForm, dueDate: e.target.value })} /></label>
        </div><div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy}>บันทึกบท</button><button type="button" disabled={busy} onClick={() => { if (allowDiscard()) { setChapterFormOpen(false); setEditingChapter(null); } }}>ยกเลิก</button></div>
      </form>}
      {deleteTarget && <form className={styles.deletePreview} aria-label="ตรวจสอบการลบบทหรือหัวข้อ" onSubmit={e => { e.preventDefault(); void remove(); }}>
        <h3 ref={deleteHeading} tabIndex={-1}>ตรวจสอบก่อนลบ</h3>
        {deleteTarget.kind === 'chapter' ? <p>ลบบทที่ {deleteTarget.chapter.chapter_number} {deleteTarget.chapter.title} พร้อมหัวข้อในบทนี้ {deleteTarget.topicCount} รายการถาวร</p> : <p>ลบหัวข้อ “{deleteTarget.topic.title}” และสถานะความก้าวหน้าของหัวข้อนี้ถาวร</p>}
        <label className={styles.field}>พิมพ์คำว่า ลบ เพื่อยืนยัน<input aria-label="คำยืนยันลบบทหรือหัวข้อ" autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
        <div className={styles.actions}><button type="submit" className={styles.danger} disabled={busy || confirmation.trim() !== 'ลบ'}>ลบถาวร</button><button type="button" disabled={busy} onClick={() => { setDeleteTarget(null); setConfirmation(''); }}>ยกเลิก</button></div>
      </form>}
      {loading ? <p className={styles.empty}>กำลังโหลดความก้าวหน้า...</p> : summary.summaries.length ? <div className={styles.tableWrap}><table><thead><tr><th>บท</th><th>ความก้าวหน้า</th><th>หัวข้อที่ยังไม่เสร็จ</th><th>วันเป้าหมาย</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
        {summary.summaries.map(row => <tr key={row.chapter.id}><td><strong>บทที่ {row.chapter.chapter_number}</strong><br />{row.chapter.title}</td><td>{row.percent === null ? 'ยังคำนวณไม่ได้' : <><strong>{row.percent}%</strong><progress aria-label={`ความก้าวหน้าบทที่ ${row.chapter.chapter_number}`} max={100} value={row.percent} /><small>{row.completed}/{row.total} หัวข้อ</small></>}</td><td>{row.total === 0 ? 'ยังไม่กำหนดหัวข้อ' : row.completed === row.total ? 'ครบทุกหัวข้อที่กำหนด' : <ul>{row.topics.filter(topic => topic.topic_status !== 'done').map(topic => <li key={topic.id}>{topic.title} <span>({statusLabel(topic.topic_status)})</span></li>)}</ul>}</td><td>{displayDate(row.chapter.due_date)}</td><td><span className={`${styles.state} ${row.state === 'overdue' ? styles.overdue : ''}`}>{stateLabels[row.state]}</span></td><td><div className={styles.actions}><button type="button" disabled={busy || loading} onClick={() => selectChapter(row.chapter)}>จัดการหัวข้อ</button><button type="button" disabled={busy || loading} onClick={() => openEditChapter(row.chapter)}>แก้ไขบท</button><button type="button" className={styles.danger} disabled={busy || loading} aria-label={`ลบบทที่ ${row.chapter.chapter_number}`} onClick={() => previewDelete({ kind: 'chapter', chapter: row.chapter, topicCount: row.total })}>ลบ</button></div></td></tr>)}
      </tbody></table></div> : <p className={styles.empty}>ยังไม่มีบท กด “เพิ่มบท” เพื่อเริ่มวางแผน</p>}
    </div>
    {selected && <div className={styles.card}><div className={styles.sectionTitle}><div><h3 ref={chapterHeading} tabIndex={-1}>หัวข้อในบทที่ {selected.chapter_number}: {selected.title}</h3><p>เพิ่มทีละหลายหัวข้อได้ โดยกรอกหนึ่งหัวข้อต่อหนึ่งบรรทัด</p></div></div>
      <form onSubmit={e => { e.preventDefault(); void addTopics(); }}><label className={styles.field}>เพิ่มหัวข้อ<textarea rows={4} value={newTopics} onChange={e => setNewTopics(e.target.value)} placeholder={'เช่น 1.1 บทนำ\n1.2 ความเป็นมา'} /></label><button type="submit" className={styles.primary} disabled={busy || loading || !newTopics.trim()}>เพิ่มหัวข้อ</button></form>
      {editingTopic && <form className={styles.editor} aria-label="แก้ไขหัวข้อ" onSubmit={e => { e.preventDefault(); void saveTopicTitle(); }}><label className={styles.field}>ชื่อหัวข้อ<input required maxLength={200} value={topicTitle} onChange={e => setTopicTitle(e.target.value)} /></label><div className={styles.actions}><button className={styles.primary} type="submit" disabled={busy}>บันทึกหัวข้อ</button><button type="button" disabled={busy} onClick={() => { if (allowDiscard()) { setEditingTopic(null); setTopicTitle(''); } }}>ยกเลิก</button></div></form>}
      {selectedTopics.length ? <div className={styles.tableWrap}><table><thead><tr><th>หัวข้อ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{selectedTopics.map(topic => <tr key={topic.id}><td>{topic.title}</td><td><select aria-label={`สถานะ ${topic.title}`} value={topic.topic_status} disabled={busy || loading} onChange={e => void setTopicStatus(topic, e.target.value as TopicStatus)}>{topicStatuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td><td><div className={styles.actions}><button type="button" disabled={busy || loading} onClick={() => { if (allowDiscard()) { setEditingTopic(topic); setTopicTitle(topic.title); } }}>แก้ไข</button><button type="button" className={styles.danger} disabled={busy || loading} aria-label={`ลบหัวข้อ ${topic.title}`} onClick={() => previewDelete({ kind: 'topic', topic })}>ลบ</button></div></td></tr>)}</tbody></table></div> : <p className={styles.empty}>บทนี้ยังไม่กำหนดหัวข้อ</p>}
    </div>}
  </section>;
}
