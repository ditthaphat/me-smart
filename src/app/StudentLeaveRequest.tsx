'use client';
import {useCallback,useEffect,useState} from 'react';
import {db} from '../lib/supabase';

type Course={id:number;code:string;title:string;term:string;status?:string};
type Session={id:number;session_date:string;topic:string};
type Leave={id:number;session_id:number;leave_type:string;reason:string;status:string;teacher_note:string|null;created_at:string};
const err=(e:unknown)=>e instanceof Error?e.message:typeof e==='object'&&e!==null&&'message' in e?String(e.message):String(e);
export default function StudentLeaveRequest({courses}:{courses:Course[]}){
 const [course,setCourse]=useState('');const [sessions,setSessions]=useState<Session[]>([]);const [session,setSession]=useState('');
 const [kind,setKind]=useState('personal');const [reason,setReason]=useState('');const [leaves,setLeaves]=useState<Leave[]>([]);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [info,setInfo]=useState('');
 const load=useCallback(async()=>{
  if(!course){setSessions([]);setLeaves([]);setSession('');return}
  const {data:s,error:se}=await db().from('attendance_sessions').select('id,session_date,topic').eq('course_id',Number(course)).eq('is_cancelled',false).order('session_date',{ascending:true});
  if(se){setError(err(se));return}
  const list=(s??[]) as Session[];setSessions(list);setSession(old=>list.some(x=>String(x.id)===old)?old:String(list[0]?.id??''));
  const {data:{user}}=await db().auth.getUser();if(!user)return;
  const ids=list.map(x=>x.id);if(!ids.length){setLeaves([]);return}
  const {data:l,error:le}=await db().from('attendance_leave_requests').select('id,session_id,leave_type,reason,status,teacher_note,created_at').eq('student_id',user.id).in('session_id',ids).order('created_at',{ascending:false});
  if(le)setError(err(le));else setLeaves((l??[]) as Leave[]);
 },[course]);
 useEffect(()=>{setCourse(old=>courses.some(c=>String(c.id)===old)?old:String(courses[0]?.id??''))},[courses]);
 useEffect(()=>{void load()},[load]);
 async function submit(){setBusy(true);setError('');setInfo('');try{
  if(!session||!reason.trim())throw Error('กรุณาเลือกคาบเรียนและระบุเหตุผล');
  const {error:e}=await db().rpc('submit_leave_request',{p_session_id:Number(session),p_leave_type:kind,p_reason:reason.trim()});
  if(e)throw e;setReason('');setInfo('ส่งคำขอลาเรียนแล้ว กรุณารออาจารย์อนุมัติ');await load();
 }catch(e){setError(err(e))}finally{setBusy(false)}}
 const field:React.CSSProperties={width:'100%',padding:10,border:'1px solid #cad6e5',borderRadius:8,marginTop:5};
 return <section style={{border:'1px solid #d6e1ee',borderRadius:14,padding:20,marginTop:20}}>
  <h2>📝 แจ้งลาเรียน · Phase 4</h2><p>ส่งคำขอลาล่วงหน้าและติดตามผลการพิจารณา</p>
  {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}{info&&<p role="status" style={{color:'#166534'}}>{info}</p>}
  {!courses.length?<p>ยังไม่มีรายวิชาที่ได้รับอนุมัติ</p>:<>
   <label>รายวิชา<select style={field} value={course} onChange={e=>setCourse(e.target.value)}>{courses.map(c=><option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}</select></label>
   <label style={{display:'block',marginTop:12}}>คาบเรียน<select style={field} value={session} onChange={e=>setSession(e.target.value)}>{sessions.map(s=><option key={s.id} value={s.id}>{s.session_date} — {s.topic}</option>)}</select></label>
   <label style={{display:'block',marginTop:12}}>ประเภทการลา<select style={field} value={kind} onChange={e=>setKind(e.target.value)}><option value="personal">ลากิจ</option><option value="sick">ลาป่วย</option></select></label>
   <label style={{display:'block',marginTop:12}}>เหตุผล<textarea style={{...field,minHeight:90}} value={reason} onChange={e=>setReason(e.target.value)} placeholder="ระบุเหตุผลการลาเรียน"/></label>
   <button type="button" disabled={busy||!session||!reason.trim()} onClick={()=>void submit()} style={{marginTop:12,padding:'10px 18px'}}>ส่งคำขอลาเรียน</button>
   <h3 style={{marginTop:22}}>ประวัติคำขอลาเรียน</h3>
   {!leaves.length?<p>ยังไม่มีคำขอ</p>:leaves.map(l=><div key={l.id} style={{padding:12,borderTop:'1px solid #e2e8f0'}}><strong>{sessions.find(s=>s.id===l.session_id)?.topic??`คาบ ${l.session_id}`}</strong><p>สถานะ: {l.status==='pending'?'รออนุมัติ':l.status==='approved'?'อนุมัติแล้ว':l.status==='rejected'?'ไม่อนุมัติ':l.status}</p><p>เหตุผล: {l.reason}</p>{l.teacher_note&&<p>ความเห็นอาจารย์: {l.teacher_note}</p>}</div>)}
   <button type="button" disabled={busy} onClick={()=>void load()}>รีเฟรชสถานะ</button>
  </>}
 </section>
}
