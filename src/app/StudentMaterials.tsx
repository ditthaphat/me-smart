'use client';

import { useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import Pagination from './Pagination';
import styles from './materials.module.css';

type Course = { id: number; code: string; title: string; term: string };
type Publication = { id: number; course_id: number; title: string; material_type: string; version_label: string; external_url: string; already_opened: boolean; student_id_available: boolean };
type OpenStatus = { publication_id: number | string; already_opened: boolean; student_id_available: boolean };
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

export default function StudentMaterials({ course }: { course: Course }) {
  const [items, setItems] = useState<Publication[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  const [openError, setOpenError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    setItems([]); setTotal(0); setLoadError('');
    setLoading(true);
    void (async () => {
      try {
        const query = db().from('material_publications')
          .select('id,course_id,title,material_type,version_label,external_url', { count: 'exact' })
          .eq('is_published', true).eq('course_id', course.id);
        const result = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * 10, page * 10 + 9);
        if (result.error) throw result.error;
        if (!current) return;
        const nextTotal = result.count ?? 0;
        if (page > 0 && page * 10 >= nextTotal) { setPage(Math.max(0, Math.ceil(nextTotal / 10) - 1)); return; }
        const publications = (result.data ?? []) as Omit<Publication, 'already_opened' | 'student_id_available'>[];
        const statuses = publications.length
          ? await db().rpc('student_material_open_status', { p_publication_ids: publications.map(item => item.id) })
          : { data: [], error: null };
        if (statuses.error) throw statuses.error;
        if (!current) return;
        const byId = new Map(((statuses.data ?? []) as OpenStatus[]).map(status => [String(status.publication_id), status]));
        const nextItems = publications.map(item => {
          const status = byId.get(String(item.id));
          if (!status) throw new Error('ตรวจสอบสิทธิ์การเปิดเอกสารไม่ได้ กรุณาอัปเดตรายการอีกครั้ง');
          return { ...item, already_opened: status.already_opened, student_id_available: status.student_id_available };
        });
        setItems(nextItems); setTotal(nextTotal); setLoadError('');
      } catch (e) { if (current) { setItems([]); setTotal(0); setLoadError(`โหลดเอกสารไม่สำเร็จ: ${errorText(e)}`); } }
      finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [course.id, page, refresh]);

  async function openDocument(item: Publication) {
    if (item.already_opened || !item.student_id_available || opening !== null) return;
    const url = safeLink(item.external_url);
    if (!url) { setOpenError('ลิงก์เอกสารไม่ถูกต้อง กรุณาติดต่ออาจารย์'); return; }
    if (!window.confirm('เอกสารนี้กดเปิดผ่าน ME-Smart ได้เพียงครั้งเดียว ระบบนับสิทธิ์ทันทีที่กด แม้ไฟล์ต้นทางจะเปิดหรือดาวน์โหลดไม่สำเร็จ\n\nต้องการเปิดเอกสารหรือไม่?')) return;
    // Open synchronously in the user's click handler to avoid mobile popup blockers.
    let tab: Window | null = null;
    try { tab = window.open('about:blank', '_blank'); if (tab) tab.opener = null; } catch { tab = null; }
    setOpening(item.id); setOpenError('');
    try {
      const result = await db().from('material_open_events').insert({ publication_id: item.id });
      if (result.error) throw result.error;
      setItems(current => current.map(row => row.id === item.id ? { ...row, already_opened: true } : row));
      if (tab && !tab.closed) tab.location.replace(url);
      else window.location.assign(url);
    } catch (e) {
      if (tab) tab.close();
      const reason = errorText(e);
      if (reason.includes('MATERIAL_ALREADY_OPENED')) setOpenError('เอกสารนี้เคยกดเปิดผ่าน ME-Smart แล้ว หากมีปัญหากรุณาติดต่ออาจารย์');
      else if (reason.includes('MATERIAL_STUDENT_ID_REQUIRED')) setOpenError('ไม่พบรหัสนักศึกษา กรุณาติดต่ออาจารย์เพื่อตรวจสอบข้อมูล');
      else setOpenError(`บันทึกการขอเปิดไม่สำเร็จ เอกสารอาจถูกหยุดเผยแพร่หรือสิทธิ์เปลี่ยนไป: ${reason}`);
      setRefresh(value => value + 1);
    } finally { setOpening(null); }
  }

  return <section className={`${styles.root} ${styles.studentSection}`} aria-label="เอกสารประกอบการเรียน">
    <div className={styles.card}>
      <div className={styles.sectionTitle}><div><h3>เอกสารประกอบการเรียน</h3><p>{course.code} · {course.title} · ภาคเรียน {course.term}</p></div><button type="button" onClick={() => setRefresh(value => value + 1)}>อัปเดตรายการ</button></div>
      <p className={styles.note}>กดเปิดผ่าน ME-Smart ได้ 1 ครั้งต่อคนต่อเอกสาร ระบบนับสิทธิ์ทันทีที่กด แม้ไฟล์ต้นทางเปิดหรือดาวน์โหลดไม่สำเร็จ หากมีปัญหาให้ติดต่ออาจารย์</p>
      {(openError || loadError) && <p role="alert" className={styles.error}>{openError || loadError}</p>}
      {loading ? <p className={styles.empty}>กำลังโหลดเอกสาร...</p> : !items.length ? <p className={styles.empty}>ยังไม่มีเอกสารที่อาจารย์เผยแพร่ในรายวิชานี้</p> : <div className={styles.list}>{items.map(item => {
        return <article className={styles.item} key={item.id}><div><h4>{item.title}</h4><div className={styles.tags}><span>{labels[item.material_type] || 'เอกสาร'}</span>{item.version_label && <span>เวอร์ชัน {item.version_label}</span>}</div></div><div className={styles.actions}><button type="button" className={styles.primary} disabled={opening !== null || item.already_opened || !item.student_id_available} onClick={() => void openDocument(item)}>{opening === item.id ? 'กำลังเปิด...' : item.already_opened ? 'เคยกดเปิดแล้ว' : !item.student_id_available ? 'กรุณาตรวจสอบรหัสนักศึกษา' : 'เปิดเอกสาร ↗'}</button></div></article>;
      })}</div>}
      <Pagination page={page} total={total} onChange={setPage} />
    </div>
  </section>;
}
