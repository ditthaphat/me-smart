'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/supabase';
import Pagination from './Pagination';
import styles from './materials.module.css';

type Course = { id: number; code: string; title: string; term: string };
type Publication = { id: number; course_id: number; title: string; material_type: string; version_label: string; external_url: string };
const labels: Record<string, string> = { textbook: 'ตำรา', lesson: 'บทเรียน', slides: 'สไลด์', exercise: 'แบบฝึกหัด', teaching_plan: 'แผนการสอน', other: 'เอกสารอื่น ๆ' };

function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function errorText(value: unknown) {
  return (value as { message?: string } | null)?.message || 'กรุณาลองอีกครั้ง';
}

export default function StudentMaterials({ courses }: { courses: Course[] }) {
  const [items, setItems] = useState<Publication[]>([]);
  const [course, setCourse] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  const [openError, setOpenError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const courseKey = courses.map(c => c.id).sort((a,b) => a-b).join(',');
  const coursesById = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);

  useEffect(() => {
    let current = true;
    const courseIds = courseKey ? courseKey.split(',').map(Number) : [];
    if (!courseIds.length) { setItems([]); setTotal(0); setLoading(false); return () => { current = false; }; }
    setLoading(true);
    void (async () => {
      try {
        let query = db().from('material_publications')
          .select('id,course_id,title,material_type,version_label,external_url', { count: 'exact' })
          .eq('is_published', true).in('course_id', courseIds);
        if (course) query = query.eq('course_id', Number(course));
        const result = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * 10, page * 10 + 9);
        if (result.error) throw result.error;
        if (!current) return;
        const nextTotal = result.count ?? 0;
        if (page > 0 && page * 10 >= nextTotal) { setPage(Math.max(0, Math.ceil(nextTotal / 10) - 1)); return; }
        setItems((result.data ?? []) as Publication[]); setTotal(nextTotal); setLoadError('');
      } catch (e) { if (current) { setItems([]); setTotal(0); setLoadError(`โหลดเอกสารไม่สำเร็จ: ${errorText(e)}`); } }
      finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [courseKey, course, page, refresh]);

  async function openDocument(item: Publication) {
    const url = safeLink(item.external_url);
    if (!url) { setOpenError('ลิงก์เอกสารไม่ถูกต้อง กรุณาติดต่ออาจารย์'); return; }
    // Open synchronously in the user's click handler to avoid mobile popup blockers.
    let tab: Window | null = null;
    try { tab = window.open('about:blank', '_blank'); if (tab) tab.opener = null; } catch { tab = null; }
    setOpening(item.id); setOpenError('');
    try {
      const result = await db().from('material_open_events').insert({ publication_id: item.id });
      if (result.error) throw result.error;
      if (tab && !tab.closed) tab.location.replace(url);
      else window.location.assign(url);
    } catch (e) {
      if (tab) tab.close();
      setOpenError(`บันทึกการขอเปิดไม่สำเร็จ เอกสารอาจถูกหยุดเผยแพร่หรือสิทธิ์เปลี่ยนไป: ${errorText(e)}`);
      setRefresh(value => value + 1);
    } finally { setOpening(null); }
  }

  return <section className={`${styles.root} ${styles.studentSection}`} aria-label="เอกสารประกอบการเรียน">
    <div className={styles.card}>
      <div className={styles.sectionTitle}><div><h3>เอกสารประกอบการเรียน</h3><p>เอกสารที่อาจารย์เผยแพร่ในรายวิชาที่ได้รับอนุมัติ</p></div><button type="button" onClick={() => setRefresh(value => value + 1)}>อัปเดตรายการ</button></div>
      <p className={styles.note}>ระบบบันทึกการกดขอเปิดผ่าน ME-Smart ไฟล์จะเปิดในบริการต้นทาง หากเปิดไม่ได้ให้ตรวจสอบบัญชีหรือสิทธิ์กับอาจารย์</p>
      {(openError || loadError) && <p role="alert" className={styles.error}>{openError || loadError}</p>}
      {courses.length > 0 && <label className={styles.field}>รายวิชา<select value={course} onChange={e => { setCourse(e.target.value); setPage(0); }}><option value="">ทุกรายวิชา</option>{courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.title} · {c.term}</option>)}</select></label>}
      {loading ? <p className={styles.empty}>กำลังโหลดเอกสาร...</p> : !items.length ? <p className={styles.empty}>ยังไม่มีเอกสารที่อาจารย์เผยแพร่ในรายวิชาที่เลือก</p> : <div className={styles.list}>{items.map(item => {
        const c = coursesById.get(item.course_id);
        return <article className={styles.item} key={item.id}><div><h4>{item.title}</h4><p>{c ? `${c.code} · ${c.title} · ${c.term}` : 'รายวิชา'}</p><div className={styles.tags}><span>{labels[item.material_type] || 'เอกสาร'}</span>{item.version_label && <span>เวอร์ชัน {item.version_label}</span>}</div></div><div className={styles.actions}><button type="button" className={styles.primary} disabled={opening !== null} onClick={() => void openDocument(item)}>{opening === item.id ? 'กำลังเปิด...' : 'เปิดเอกสาร ↗'}</button></div></article>;
      })}</div>}
      <Pagination page={page} total={total} onChange={setPage} />
    </div>
  </section>;
}
