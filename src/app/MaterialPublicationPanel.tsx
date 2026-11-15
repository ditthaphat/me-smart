'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/supabase';
import { sortStudentsByNumber } from '../lib/student-sort';
import Pagination from './Pagination';
import styles from './materials.module.css';

type Source = {
  id: number; course_id: number | null; title: string; material_type: string;
  material_status: string; version_label: string; external_url: string; is_archived: boolean;
};
type Publication = {
  id: number; material_id: number; course_id: number; title: string;
  material_type: string; version_label: string; external_url: string; is_published: boolean;
};
type Stat = { student_id: string; full_name: string | null; student_number: string | null; open_count: number | string; last_open: string | null };

function validLink(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}
function readableTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(date);
}
function message(error: unknown) {
  const value = error as { message?: string } | null;
  return value?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

export default function MaterialPublicationPanel({ teacherId, source, courseName, onBack }: {
  teacherId: string; source: Source; courseName: string; onBack: () => void;
}) {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [stats, setStats] = useState<Stat[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    void (async () => {
      try {
        const result = await db().from('material_publications')
          .select('id,material_id,course_id,title,material_type,version_label,external_url,is_published')
          .eq('material_id', source.id).eq('owner_id', teacherId).maybeSingle();
        if (result.error) throw result.error;
        const next = result.data as Publication | null;
        let nextStats: Stat[] = [];
        if (next) {
          const report = await db().rpc('teacher_material_open_stats', { p_publication_id: next.id });
          if (report.error) throw report.error;
          nextStats = (report.data ?? []) as Stat[];
        }
        if (current) { setPublication(next); setStats(sortStudentsByNumber(nextStats, row => row.student_number, row => `${row.full_name ?? ''}|${row.student_id}`)); setError(''); }
      } catch (e) { if (current) { setError(`โหลดข้อมูลการเผยแพร่ไม่สำเร็จ: ${message(e)}`); setPublication(null); setStats([]); } }
      finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [source.id, teacherId, refresh]);

  const summary = useMemo(() => {
    const people = stats.filter(row => Number(row.open_count) > 0).length;
    return { people, requests: stats.reduce((sum, row) => sum + Number(row.open_count || 0), 0), percent: stats.length ? Math.round(people * 100 / stats.length) : 0 };
  }, [stats]);
  const mayPublish = source.course_id !== null && !source.is_archived && validLink(source.external_url);

  async function publish() {
    if (!mayPublish || source.course_id === null) { setError('กรุณาเลือกรายวิชา ใส่ลิงก์ https ที่ถูกต้อง และนำรายการออกจากการเก็บถาวรก่อนเผยแพร่'); return; }
    const ok = window.confirm(`เผยแพร่ “${source.title}” ให้นักศึกษาที่ได้รับอนุมัติใน ${courseName} หรือไม่?\n\nโปรดตรวจสอบสิทธิ์การเข้าถึงไฟล์ในบริการต้นทางด้วย`);
    if (!ok) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = {
        material_id: source.id, owner_id: teacherId, course_id: source.course_id,
        title: source.title, material_type: source.material_type, version_label: source.version_label,
        external_url: source.external_url, is_published: true,
      };
      const query = publication
        ? db().from('material_publications').update(payload).eq('id', publication.id).eq('owner_id', teacherId)
        : db().from('material_publications').insert(payload);
      const result = await query.select('id').single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('ไม่สามารถยืนยันการเผยแพร่ กรุณาอัปเดตแล้วลองใหม่');
      setNotice('เผยแพร่รายการแล้ว กรุณาตรวจสอบว่านักศึกษามีสิทธิ์เปิดไฟล์ต้นทาง');
      setRefresh(value => value + 1);
    } catch (e) { setError(`เผยแพร่ไม่สำเร็จ: ${message(e)}`); }
    finally { setBusy(false); }
  }
  async function unpublish() {
    if (!publication || !window.confirm('หยุดเผยแพร่เอกสารนี้ให้นักศึกษาหรือไม่? สถิติเดิมจะยังคงอยู่')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await db().from('material_publications').update({ is_published: false })
        .eq('id', publication.id).eq('owner_id', teacherId).select('id');
      if (result.error) throw result.error;
      if (!result.data?.length) throw new Error('รายการเปลี่ยนไป กรุณาอัปเดตแล้วลองใหม่');
      setNotice('หยุดเผยแพร่แล้ว สถิติเดิมยังคงอยู่');
      setRefresh(value => value + 1);
    } catch (e) { setError(`หยุดเผยแพร่ไม่สำเร็จ: ${message(e)}`); }
    finally { setBusy(false); }
  }

  return <section aria-label="เผยแพร่เอกสารและสถิติ">
    <div className={styles.header}><div><p className={styles.eyebrow}>SHARE &amp; TRACK</p><h2>เผยแพร่เอกสารและสถิติ</h2><p>{source.title} · {courseName}</p></div><button type="button" onClick={onBack}>← กลับรายการเอกสาร</button></div>
    <p className={styles.note}>นักศึกษาที่ได้รับอนุมัติในรายวิชาจะเห็นเฉพาะข้อมูลที่เผยแพร่ หมายเหตุและความก้าวหน้าการเขียนยังเป็นข้อมูลส่วนตัวของอาจารย์</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.success}>{notice}</p>}
    <div className={styles.card}>
      {loading ? <p className={styles.empty}>กำลังโหลดข้อมูล...</p> : <>
        <div className={styles.sectionTitle}><div><h3>สถานะการเผยแพร่</h3><p>{publication?.is_published ? 'เผยแพร่ให้นักศึกษาที่ได้รับอนุมัติแล้ว' : 'ยังไม่เผยแพร่ให้นักศึกษา'}</p></div><span className={styles.badge}>{publication?.is_published ? 'เผยแพร่แล้ว' : 'ส่วนตัว'}</span></div>
        {!mayPublish && <p className={styles.error}>ก่อนเผยแพร่ โปรดเลือกรายวิชา ใส่ลิงก์ https ที่ถูกต้อง และตรวจสอบว่าเอกสารไม่ได้เก็บถาวร</p>}
        <p className={styles.note}>ตรวจสอบสิทธิ์ใน Google Drive, OneDrive หรือบริการต้นทางแยกต่างหาก การแก้ชื่อ รายวิชา ประเภท เวอร์ชัน ลิงก์ หรือสถานะเอกสาร จะหยุดเผยแพร่อัตโนมัติจนกว่าอาจารย์จะกดเผยแพร่ใหม่</p>
        <div className={styles.actions}><button type="button" className={styles.primary} disabled={busy || !mayPublish} onClick={() => void publish()}>{publication?.is_published ? 'อัปเดตการเผยแพร่' : 'เผยแพร่ให้นักศึกษา'}</button>{publication?.is_published && <button type="button" disabled={busy} onClick={() => void unpublish()}>หยุดเผยแพร่</button>}<button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>อัปเดตสถิติ</button></div>
      </>}
    </div>
    {publication && <div className={styles.card}>
      <div className={styles.sectionTitle}><div><h3>สถิติการกดขอเปิดผ่าน ME-Smart</h3><p>นับเฉพาะนักศึกษาที่ได้รับอนุมัติในรายวิชาปัจจุบัน</p></div></div>
      <p className={styles.note}>สถิตินี้นับการกดขอเปิด ไม่ยืนยันว่าไฟล์เปิดหรือดาวน์โหลดสำเร็จ และไม่รวมการเปิดลิงก์โดยตรงจากแหล่งอื่น</p>
      <div className={styles.statGrid}>
        <div><strong>{summary.people}/{stats.length}</strong><span>นักศึกษาที่เคยกด</span></div>
        <div><strong>{summary.percent}%</strong><span>สัดส่วนที่เคยกด</span></div>
        <div><strong>{summary.requests}</strong><span>จำนวนครั้งที่กด</span></div>
      </div>
      {stats.length === 0 ? <p className={styles.empty}>ยังไม่มีนักศึกษาที่ได้รับอนุมัติในรายวิชานี้</p> : <>
        <div className={styles.reportTable}><table><thead><tr><th>รหัสนักศึกษา</th><th>ชื่อ–สกุล</th><th>จำนวนครั้ง</th><th>กดล่าสุด</th></tr></thead><tbody>{stats.slice(page * 10, page * 10 + 10).map(row => <tr key={row.student_id}><td>{row.student_number || '—'}</td><td>{row.full_name || 'ไม่พบชื่อ'}</td><td>{Number(row.open_count) ? Number(row.open_count) : 'ยังไม่เคยกด'}</td><td>{readableTime(row.last_open)}</td></tr>)}</tbody></table></div>
        <Pagination page={page} total={stats.length} onChange={setPage} />
      </>}
    </div>}
  </section>;
}
