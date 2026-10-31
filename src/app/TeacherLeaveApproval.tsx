'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {db} from '../lib/supabase';
import {userMessage} from '../lib/messages';
import styles from './leave-approval.module.css';

type Leave={id:number;session_id:number;student_id:string;leave_type:string;reason:string;status:string;teacher_note:string|null;created_at:string};
type Session={id:number;session_date:string;topic:string;is_cancelled?:boolean};
type Profile={id:string;full_name:string;student_id:string|null};
const label=(status:string)=>status==='pending'?'รอพิจารณา':status==='approved'?'อนุมัติแล้ว':status==='rejected'?'ไม่อนุมัติ':status;
const size=10;
export default function TeacherLeaveApproval({courseId}:{courseId:number}){
 const [sessions,setSessions]=useState<Session[]>([]),[leaves,setLeaves]=useState<Leave[]>([]),[profiles,setProfiles]=useState<Profile[]>([]);
 const [notes,setNotes]=useState<Record<number,string>>({}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
 const [query,setQuery]=useState(''),[session,setSession]=useState(''),[historyStatus,setHistoryStatus]=useState('all'),[historyOpen,setHistoryOpen]=useState(false),[pendingPage,setPendingPage]=useState(1),[historyPage,setHistoryPage]=useState(1);
 const epoch=useRef(0),acting=useRef(false);
 const load=useCallback(async()=>{
  const version=++epoch.current;setLoading(true);setError('');
  try{
   const ss:Session[]=[];
   for(let offset=0;;offset+=500){const r=await db().from('attendance_sessions').select('id,session_date,topic,is_cancelled').eq('course_id',courseId).order('session_date',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);if(r.error)throw r.error;const batch=(r.data??[]) as Session[];ss.push(...batch);if(batch.length<500)break}
   const ll:Leave[]=[];
   for(let start=0;start<ss.length;start+=50){const ids=ss.slice(start,start+50).map(s=>s.id);
    for(let offset=0;;offset+=500){const r=await db().from('attendance_leave_requests').select('id,session_id,student_id,leave_type,reason,status,teacher_note,created_at').in('session_id',ids).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);if(r.error)throw r.error;const batch=(r.data??[]) as Leave[];ll.push(...batch);if(batch.length<500)break}
   }
   const pp:Profile[]=[],ids=[...new Set(ll.map(l=>l.student_id))];
   for(let start=0;start<ids.length;start+=100){const r=await db().from('profiles').select('id,full_name,student_id').in('id',ids.slice(start,start+100));if(r.error)throw r.error;pp.push(...((r.data??[]) as Profile[]))}
   if(version!==epoch.current)return false;
   setSessions(ss);setLeaves(ll.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id-a.id));setProfiles(pp);return true;
  }catch(e){if(version===epoch.current)setError(userMessage(e));return false}finally{if(version===epoch.current)setLoading(false)}
 },[courseId]);
 useEffect(()=>{setSessions([]);setLeaves([]);setProfiles([]);setNotes({});setQuery('');setSession('');setHistoryStatus('all');setHistoryOpen(false);setPendingPage(1);setHistoryPage(1);setInfo('');void load();return()=>{epoch.current++}},[load]);
 useEffect(()=>{setPendingPage(1);setHistoryPage(1)},[query,session,historyStatus]);
 const profileMap=useMemo(()=>new Map(profiles.map(p=>[p.id,p])),[profiles]);
 const sessionMap=useMemo(()=>new Map(sessions.map(s=>[s.id,s])),[sessions]);
 const filtered=leaves.filter(l=>{const p=profileMap.get(l.student_id);return (!session||String(l.session_id)===session)&&`${p?.full_name??l.student_id} ${p?.student_id??''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())});
 const pending=filtered.filter(l=>l.status==='pending'),history=filtered.filter(l=>l.status!=='pending'&&(historyStatus==='all'||l.status===historyStatus));
 const pendingTotal=leaves.filter(l=>l.status==='pending').length,historyTotal=leaves.length-pendingTotal;
 async function decide(l:Leave,approve:boolean){
  if(acting.current||loading||l.status!=='pending')return;
  const p=profileMap.get(l.student_id),s=sessionMap.get(l.session_id);
  if(!window.confirm(`${approve?'อนุมัติ':'ไม่อนุมัติ'}คำขอลาของ ${p?.full_name??l.student_id}\nคาบ ${s?.session_date??''} — ${s?.topic??l.session_id}\nยืนยันการพิจารณาหรือไม่?`))return;
  acting.current=true;setBusy(true);setError('');setInfo('');const version=epoch.current;
  try{
   const note=notes[l.id]?.trim()||null;
   const {error:e}=await db().rpc('decide_leave_request',{p_request_id:l.id,p_approve:approve,p_teacher_note:note});if(e)throw e;
   if(version!==epoch.current)return;
   setLeaves(old=>old.map(row=>row.id===l.id?{...row,status:approve?'approved':'rejected',teacher_note:note}:row));
   setNotes(old=>{const next={...old};delete next[l.id];return next});
   setInfo(`${approve?'อนุมัติ':'ไม่อนุมัติ'}คำขอแล้ว ย้ายไปอยู่ในประวัติการพิจารณา`);
   const ok=await load();if(!ok&&version+1===epoch.current)setInfo('บันทึกผลพิจารณาสำเร็จแล้ว แต่โหลดรายการล่าสุดไม่ได้ กรุณากดอัปเดตคำขอ');
  }catch(e){if(version===epoch.current)setError(userMessage(e))}finally{acting.current=false;setBusy(false)}
 }
 function list(rows:Leave[],page:number,setPage:(n:number)=>void,historyList=false){
  const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(page,pages),shown=rows.slice((current-1)*size,current*size);
  return <><p className={styles.muted} role="status">{rows.length?`แสดง ${(current-1)*size+1}–${Math.min(current*size,rows.length)} จาก ${rows.length} รายการ`:'ไม่พบคำขอตามตัวกรอง'}</p>
   {shown.map(l=>{const p=profileMap.get(l.student_id),s=sessionMap.get(l.session_id);return <article className={styles.item} key={l.id}>
    <div className={styles.row}><strong>{p?.full_name??l.student_id} <small>({p?.student_id??'-'})</small></strong><span className={styles.badge}>{label(l.status)}</span></div>
    <p>{s?.session_date??''} — {s?.topic??`คาบ ${l.session_id}`} {s?.is_cancelled&&<span className={styles.cancelled}>· คาบยกเลิกแล้ว</span>}</p>
    <p className={styles.muted}>{l.leave_type==='sick'?'ลาป่วย':l.leave_type==='personal'?'ลากิจ':l.leave_type} · คำขอ #{l.id}</p>
    <details><summary>รายละเอียด / พิจารณาคำขอ #{l.id}</summary><p className={styles.reason}>เหตุผล: {l.reason}</p>{l.teacher_note&&<p className={styles.reason}>ความเห็นอาจารย์: {l.teacher_note}</p>}
    {!historyList&&l.status==='pending'&&<><label className={styles.note}>ความเห็นอาจารย์ (ไม่บังคับ)<textarea aria-label={`ความเห็นคำขอ ${l.id}`} value={notes[l.id]??''} disabled={busy||loading} onChange={e=>setNotes(old=>({...old,[l.id]:e.target.value}))}/></label><div className={styles.actions}><button type="button" disabled={busy||loading||Boolean(s?.is_cancelled)} onClick={()=>void decide(l,true)}>อนุมัติคำขอ #{l.id}</button><button type="button" disabled={busy||loading||Boolean(s?.is_cancelled)} onClick={()=>void decide(l,false)}>ไม่อนุมัติคำขอ #{l.id}</button></div>{s?.is_cancelled&&<p className={styles.muted}>คาบนี้ยกเลิกแล้ว เก็บคำขอไว้เป็นประวัติและปิดการพิจารณา</p>}</>}</details>
   </article>})}
   {pages>1&&<nav className={styles.actions} aria-label={historyList?'หน้าประวัติคำขอลา':'หน้าคำขอรอพิจารณา'}><button type="button" disabled={current===1||busy||loading} onClick={()=>setPage(current-1)}>ก่อนหน้า</button><span>หน้า {current} / {pages}</span><button type="button" disabled={current===pages||busy||loading} onClick={()=>setPage(current+1)}>ถัดไป</button></nav>}
  </>
 }
 return <section className={styles.panel} aria-label="พิจารณาคำขอลาเรียน" aria-busy={loading||busy}>
  <div className={styles.row}><div><p className={styles.eyebrow}>LEAVE REQUESTS</p><h2>พิจารณาคำขอลาเรียน</h2><p>รอพิจารณา {pendingTotal} รายการ · ประวัติ {historyTotal} รายการ</p></div><button type="button" disabled={busy||loading} onClick={()=>void load()}>{loading?'กำลังโหลด...':'อัปเดตคำขอ'}</button></div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{info&&<p role="status" className={styles.success}>{info}</p>}
  <div className={styles.filters}><label>ค้นหานักศึกษา<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ชื่อหรือรหัสนักศึกษา" disabled={busy}/></label><label>คาบเรียน<select value={session} onChange={e=>setSession(e.target.value)} disabled={busy}><option value="">ทุกคาบเรียน</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.is_cancelled?'[ยกเลิก] ':''}{s.session_date} — {s.topic}</option>)}</select></label><button type="button" disabled={busy} onClick={()=>{setQuery('');setSession('');setHistoryStatus('all');setPendingPage(1);setHistoryPage(1)}}>ล้างตัวกรอง</button></div>
  <h3>รอพิจารณา ({pending.length} รายการตามตัวกรอง)</h3>
  {!loading&&!pending.length&&<p className={styles.muted}>{pendingTotal?'ไม่มีคำขอรอพิจารณาที่ตรงกับตัวกรอง':'ไม่มีคำขอรอพิจารณา'}</p>}
  {list(pending,pendingPage,setPendingPage)}
  <div className={styles.history}><button type="button" className={styles.historyToggle} aria-expanded={historyOpen} aria-controls={`leave-history-${courseId}`} onClick={()=>setHistoryOpen(v=>!v)}>{historyOpen?'▾ ยุบ':'▸ เปิด'}ประวัติการพิจารณา ({historyTotal} รายการ)</button>
   {historyOpen&&<div id={`leave-history-${courseId}`}><label className={styles.statusFilter}>ผลพิจารณา<select value={historyStatus} onChange={e=>setHistoryStatus(e.target.value)}><option value="all">ทุกผลพิจารณา</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ไม่อนุมัติ</option></select></label>{list(history,historyPage,setHistoryPage,true)}</div>}
  </div><p className={styles.muted}>แสดงครั้งละ 10 รายการ · ผลพิจารณาที่สำเร็จย้ายเข้าประวัติอัตโนมัติ · เก็บคำขอและความเห็นเดิมไว้เพื่อตรวจสอบย้อนหลัง</p>
 </section>
}
