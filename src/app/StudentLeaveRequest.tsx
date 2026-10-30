'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import styles from './leave-approval.module.css';
import {db} from '../lib/supabase';

type Course={id:number;code:string;title:string;term:string;status?:string};
type Session={id:number;session_date:string;topic:string;is_cancelled:boolean};
type Leave={id:number;session_id:number;leave_type:string;reason:string;status:string;teacher_note:string|null;created_at:string};
const err=(e:unknown)=>e instanceof Error?e.message:typeof e==='object'&&e!==null&&'message' in e?String(e.message):String(e);
export default function StudentLeaveRequest({courses}:{courses:Course[]}){
 const [course,setCourse]=useState('');const [sessions,setSessions]=useState<Session[]>([]);const [session,setSession]=useState('');
 const [kind,setKind]=useState('personal');const [reason,setReason]=useState('');const [leaves,setLeaves]=useState<Leave[]>([]);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [info,setInfo]=useState('');
 const [loading,setLoading]=useState(false);const [history,setHistory]=useState(false);const [query,setQuery]=useState('');const [status,setStatus]=useState('all');const [page,setPage]=useState(1);
 const epoch=useRef(0);const submitting=useRef(false);
 const load=useCallback(async()=>{
  const token=++epoch.current;setLoading(true);setError('');
  try{
   if(!course){setSessions([]);setLeaves([]);setSession('');return}
   const list:Session[]=[];
   for(let offset=0;;offset+=500){
    const {data,error}=await db().from('attendance_sessions').select('id,session_date,topic,is_cancelled').eq('course_id',Number(course)).order('session_date',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
    if(error)throw error;if(token!==epoch.current)return;list.push(...(data??[]));if((data??[]).length<500)break;
   }
   const {data:{user},error:authError}=await db().auth.getUser();if(authError)throw authError;if(!user)throw Error('กรุณาเข้าสู่ระบบใหม่');
   const rows:Leave[]=[];
   for(let i=0;i<list.length;i+=50){
    for(let offset=0;;offset+=500){
     const {data,error}=await db().from('attendance_leave_requests').select('id,session_id,leave_type,reason,status,teacher_note,created_at').eq('student_id',user.id).in('session_id',list.slice(i,i+50).map(x=>x.id)).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
     if(error)throw error;if(token!==epoch.current)return;rows.push(...(data??[]));if((data??[]).length<500)break;
    }
   }
   if(token!==epoch.current)return;
   setSessions(list);setLeaves(rows.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id-a.id));
   setSession(old=>list.some(x=>!x.is_cancelled&&String(x.id)===old)?old:String(list.find(x=>!x.is_cancelled)?.id??''));
  }catch(e){if(token===epoch.current)setError(err(e))}finally{if(token===epoch.current)setLoading(false)}
 },[course]);
 useEffect(()=>{setCourse(old=>courses.some(c=>String(c.id)===old)?old:String(courses[0]?.id??''))},[courses]);
 useEffect(()=>{setSessions([]);setLeaves([]);setSession('');setReason('');setInfo('');setHistory(false);setQuery('');setStatus('all');setPage(1);void load();return()=>{epoch.current++}},[load]);
 useEffect(()=>setPage(1),[query,status,history]);
 async function submit(){if(submitting.current)return;submitting.current=true;setBusy(true);const token=epoch.current;setError('');setInfo('');try{
  if(!session||!reason.trim())throw Error('กรุณาเลือกคาบเรียนและระบุเหตุผล');
  const {error:e}=await db().rpc('submit_leave_request',{p_session_id:Number(session),p_leave_type:kind,p_reason:reason.trim()});
  if(e)throw e;if(token!==epoch.current)return;setReason('');setInfo('ส่งคำขอลาเรียนแล้ว กรุณารออาจารย์อนุมัติ');await load();
 }catch(e){if(token===epoch.current)setError(err(e))}finally{submitting.current=false;setBusy(false)}}
 const field:React.CSSProperties={width:'100%',padding:10,border:'1px solid #cad6e5',borderRadius:8,marginTop:5};
 const pending=leaves.filter(l=>l.status==='pending');const past=leaves.filter(l=>l.status!=='pending');
 const filtered=(history?past:pending).filter(l=>{const s=sessions.find(s=>s.id===l.session_id);return (!history||status==='all'||l.status===status)&&`${l.id} ${s?.session_date??''} ${s?.topic??''} ${l.reason} ${l.teacher_note??''}`.toLowerCase().includes(query.trim().toLowerCase())});
 const pages=Math.max(1,Math.ceil(filtered.length/10));const current=Math.min(page,pages);
 return <section className={styles.panel} style={{border:'1px solid #d6e1ee',borderRadius:14,padding:20,marginTop:20}}>
  <h2>📝 แจ้งลาเรียน</h2><p>ส่งคำขอลาล่วงหน้าและติดตามผลการพิจารณา</p>
  {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}{info&&<p role="status" style={{color:'#166534'}}>{info}</p>}
  {!courses.length?<p>ยังไม่มีรายวิชาที่ได้รับอนุมัติ</p>:<>
   <label>รายวิชา<select style={field} disabled={busy||loading} value={course} onChange={e=>setCourse(e.target.value)}>{courses.map(c=><option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}</select></label>
   <label style={{display:'block',marginTop:12}}>คาบเรียน<select style={field} disabled={busy||loading} value={session} onChange={e=>setSession(e.target.value)}>{sessions.filter(s=>!s.is_cancelled).map(s=><option key={s.id} value={s.id}>{s.session_date} — {s.topic}</option>)}</select></label>
   <label style={{display:'block',marginTop:12}}>ประเภทการลา<select style={field} value={kind} onChange={e=>setKind(e.target.value)}><option value="personal">ลากิจ</option><option value="sick">ลาป่วย</option></select></label>
   <label style={{display:'block',marginTop:12}}>เหตุผล<textarea style={{...field,minHeight:90}} value={reason} onChange={e=>setReason(e.target.value)} placeholder="ระบุเหตุผลการลาเรียน"/></label>
   <button type="button" disabled={busy||loading||!session||!reason.trim()} onClick={()=>void submit()} style={{marginTop:12,padding:'10px 18px'}}>ส่งคำขอลาเรียน</button>
   <div className={styles.row} style={{marginTop:22}}><h3>คำขอลาเรียนของฉัน</h3><button type="button" disabled={busy||loading} onClick={()=>void load()}>รีเฟรชสถานะ</button></div>
   <p>รออนุมัติ {pending.length} รายการ · พิจารณาแล้ว {past.length} รายการ</p>
   <div className={styles.actions}><button type="button" aria-pressed={!history} onClick={()=>setHistory(false)}>รออนุมัติ ({pending.length})</button><button type="button" aria-expanded={history} onClick={()=>setHistory(v=>!v)}>{history?'ยุบประวัติ':'ดูประวัติที่พิจารณาแล้ว'} ({past.length})</button></div>
   <div className={styles.filters}>
    <label>ค้นหาคำขอ<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="หัวข้อ วันที่ เหตุผล หรือความเห็นอาจารย์"/></label>
    {history&&<label>สถานะคำขอ<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">ทั้งหมดที่พิจารณาแล้ว</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ไม่อนุมัติ</option></select></label>}
    <button type="button" onClick={()=>{setQuery('');setStatus('all');setPage(1)}}>ล้างตัวกรอง</button>
   </div>
   {loading?<p role="status">กำลังโหลดคำขอลาเรียน…</p>:<>
    <p className={styles.muted}>แสดง {filtered.length} รายการ · หน้าละ 10 รายการ</p>
    {!filtered.length?<p>{query.trim()||status!=='all'?'ไม่พบคำขอที่ตรงกับตัวกรอง':history?'ยังไม่มีประวัติที่พิจารณาแล้ว':'ไม่มีคำขอที่รออนุมัติ'}</p>:filtered.slice((current-1)*10,current*10).map(l=>{const s=sessions.find(s=>s.id===l.session_id);return <article key={l.id} className={styles.item}>
     <strong>{s?.session_date} — {s?.topic??`คาบ ${l.session_id}`}</strong>
     <p>คำขอ #{l.id} · {l.leave_type==='sick'?'ลาป่วย':'ลากิจ'} · {l.status==='pending'?'รออนุมัติ':l.status==='approved'?'อนุมัติแล้ว':l.status==='rejected'?'ไม่อนุมัติ':l.status}</p>
     {s?.is_cancelled&&<p className={styles.cancelled}>คาบนี้ยกเลิกแล้ว · เก็บคำขอไว้เป็นประวัติ</p>}
     <details><summary>ดูเหตุผลและความเห็นอาจารย์</summary><p className={styles.reason}>เหตุผล: {l.reason}</p><p className={styles.reason}>ความเห็นอาจารย์: {l.teacher_note||'—'}</p></details>
    </article>})}
    {pages>1&&<nav className={styles.actions} aria-label="หน้าคำขอลา"><button type="button" disabled={current===1} onClick={()=>setPage(current-1)}>ก่อนหน้า</button><span>หน้า {current} / {pages}</span><button type="button" disabled={current===pages} onClick={()=>setPage(current+1)}>ถัดไป</button></nav>}
   </>}

  </>}
 </section>
}
