'use client';
import {useCallback,useEffect,useState} from 'react';
import {db} from '../lib/supabase';

type Leave={id:number;session_id:number;student_id:string;leave_type:string;reason:string;status:string;teacher_note:string|null;created_at:string};
type Session={id:number;session_date:string;topic:string};
type Profile={id:string;full_name:string;student_id:string|null};
const err=(e:unknown)=>e instanceof Error?e.message:typeof e==='object'&&e!==null&&'message' in e?String(e.message):String(e);
export default function TeacherLeaveApproval({courseId}:{courseId:number}){
 const [sessions,setSessions]=useState<Session[]>([]);const [leaves,setLeaves]=useState<Leave[]>([]);const [profiles,setProfiles]=useState<Profile[]>([]);
 const [notes,setNotes]=useState<Record<number,string>>({});const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [info,setInfo]=useState('');

const load = useCallback(async () => {
  setError('');

  // 1. ตรวจสอบรายวิชาที่ Component ได้รับ
  console.log('[Leave] Course ID:', courseId);

  // 2. โหลดคาบเรียนของรายวิชา
  const { data: s, error: se } = await db()
    .from('attendance_sessions')
    .select('id,session_date,topic')
    .eq('course_id', courseId);

  if (se) {
    setError(`โหลดคาบเรียนไม่สำเร็จ: ${err(se)}`);
    return;
  }

  const ss = (s ?? []) as Session[];
  setSessions(ss);

  console.log('[Leave] Sessions:', ss);

  if (!ss.length) {
    setLeaves([]);
    setProfiles([]);
    setError(
      `ไม่พบคาบเรียนสำหรับ Course ID ${courseId}`
    );
    return;
  }

  // 3. โหลดคำขอลาของคาบเรียนทั้งหมด
  const sessionIds = ss.map(x => x.id);

  const { data: l, error: le } = await db()
    .from('attendance_leave_requests')
    .select(
      'id,session_id,student_id,leave_type,reason,status,teacher_note,created_at'
    )
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false });

  if (le) {
    setError(`โหลดคำขอลาไม่สำเร็จ: ${err(le)}`);
    return;
  }

  const ll = (l ?? []) as Leave[];
  setLeaves(ll);

  console.log('[Leave] Requests:', ll);

  // 4. โหลดชื่อและรหัสนักศึกษา
  const ids = [...new Set(ll.map(x => x.student_id))];

  if (!ids.length) {
    setProfiles([]);
    return;
  }

  const { data: p, error: pe } = await db()
    .from('profiles')
    .select('id,full_name,student_id')
    .in('id', ids);

  if (pe) {
    setError(`โหลดข้อมูลนักศึกษาไม่สำเร็จ: ${err(pe)}`);
    return;
  }

  setProfiles((p ?? []) as Profile[]);
}, [courseId]);
 useEffect(()=>{void load()},[load]);
 async function decide(id:number,approve:boolean){if(!window.confirm(approve?'ยืนยันอนุมัติการลา?':'ยืนยันไม่อนุมัติการลา?'))return;
  setBusy(true);setError('');setInfo('');try{
   const {error:e}=await db().rpc('decide_leave_request',{p_request_id:id,p_approve:approve,p_teacher_note:notes[id]?.trim()||null});
   if(e)throw e;setInfo(approve?'อนุมัติคำขอแล้ว':'ไม่อนุมัติคำขอแล้ว');await load();
  }catch(e){setError(err(e))}finally{setBusy(false)}
 }
 return <section style={{border:'1px solid #d6e1ee',borderRadius:14,padding:20,marginTop:20}}>
  <h2>📋 พิจารณาคำขอลาเรียน · Phase 4</h2><p>รายวิชานี้มีคำขอรออนุมัติ {leaves.filter(x=>x.status==='pending').length} รายการ</p>
  {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}{info&&<p role="status" style={{color:'#166534'}}>{info}</p>}
  <button type="button" disabled={busy} onClick={()=>void load()}>รีเฟรชคำขอ</button>
  {!leaves.length?<p>ยังไม่มีคำขอลาเรียน</p>:leaves.map(l=>{
   const p=profiles.find(x=>x.id===l.student_id);const s=sessions.find(x=>x.id===l.session_id);
   return <article key={l.id} style={{padding:'14px 0',borderBottom:'1px solid #e2e8f0'}}>
    <strong>{p?.full_name??l.student_id} ({p?.student_id??'-'})</strong>
    <p>{s?.session_date??''} — {s?.topic??`คาบ ${l.session_id}`}</p>
    <p>ประเภท: {l.leave_type==='sick'?'ลาป่วย':l.leave_type==='personal'?'ลากิจ':l.leave_type} · สถานะ: {l.status==='pending'?'รออนุมัติ':l.status==='approved'?'อนุมัติแล้ว':l.status==='rejected'?'ไม่อนุมัติ':l.status}</p>
    <p>เหตุผล: {l.reason}</p>
    {l.status==='pending'?<><label>ความเห็นอาจารย์ (ไม่บังคับ)<textarea value={notes[l.id]??''} onChange={e=>setNotes(old=>({...old,[l.id]:e.target.value}))} style={{display:'block',width:'100%',minHeight:65,padding:10,borderRadius:8,border:'1px solid #cad6e5'}}/></label><div style={{display:'flex',gap:10,marginTop:10}}><button type="button" disabled={busy} onClick={()=>void decide(l.id,true)}>อนุมัติ</button><button type="button" disabled={busy} onClick={()=>void decide(l.id,false)}>ไม่อนุมัติ</button></div></>:l.teacher_note&&<p>ความเห็น: {l.teacher_note}</p>}
   </article>})}
 </section>
}
