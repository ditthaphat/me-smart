'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {userMessage} from '../../lib/messages';
import {db} from '../../lib/supabase';
import styles from '../smart-attendance.module.css';
type Saved={status:string;note:string|null};
type ClassInfo={session_date:string;topic:string;is_cancelled:boolean;course_id:number};
const statusLabels:Record<string,string>={present:'มาเรียน',late:'สาย',absent:'ขาด',leave:'ลา'};
export default function Checkin(){
 const [sid,setSid]=useState(0),[token,setToken]=useState('');
 const [userId,setUserId]=useState<string|null>(null),[ready,setReady]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [busy,setBusy]=useState(false),[result,setResult]=useState(''),[error,setError]=useState(''),[confirmedAt,setConfirmedAt]=useState('');
 const [saved,setSaved]=useState<Saved|null>(null),[context,setContext]=useState<ClassInfo|null>(null),[course,setCourse]=useState(''),[contextLoading,setContextLoading]=useState(false),[contextError,setContextError]=useState('');
 const submitting=useRef(false);
 useEffect(()=>{let active=true;const q=new URLSearchParams(window.location.search);setSid(Number(q.get('session')));setToken(q.get('token')??'');
  void db().auth.getUser().then(({data,error:e})=>{if(!active)return;if(e&&e.name!=='AuthSessionMissingError')setError(userMessage(e));setUserId(data.user?.id??null)}).catch(e=>{if(active)setError(userMessage(e))}).finally(()=>{if(active)setReady(true)});return()=>{active=false};
 },[]);
 const readSaved=useCallback(async()=>{
  if(!userId)return null;
  const {data,error:e}=await db().from('attendance_records').select('status,note').eq('session_id',sid).eq('student_id',userId).maybeSingle();
  if(e)throw e;return data as Saved|null;
 },[sid,userId]);
 useEffect(()=>{if(!userId||!Number.isSafeInteger(sid)||sid<=0)return;let active=true;setContextLoading(true);setContextError('');
  void (async()=>{try{
   const [record,session,courses]=await Promise.all([readSaved(),db().from('attendance_sessions').select('session_date,topic,is_cancelled,course_id').eq('id',sid).maybeSingle(),db().rpc('my_courses')]);
   if(!active)return;setSaved(record);if(session.error)throw session.error;setContext(session.data as ClassInfo|null);
   if(!courses.error){const c=(courses.data as {id:number;code:string;title:string}[]|null)?.find(c=>c.id===session.data?.course_id);if(c)setCourse(`${c.code} · ${c.title}`)}
  }catch(e){if(active)setContextError('โหลดรายละเอียดคาบไม่สำเร็จ: '+userMessage(e))}finally{if(active)setContextLoading(false)}})();
  return()=>{active=false};
 },[userId,sid,readSaved]);
 async function login(e:React.FormEvent){e.preventDefault();if(submitting.current)return;submitting.current=true;setBusy(true);setError('');
  try{const {data,error:e}=await db().auth.signInWithPassword({email,password});if(e)throw e;setUserId(data.user?.id??null);setPassword('')}catch(e){setError(userMessage(e))}finally{submitting.current=false;setBusy(false)}}
 async function submit(){if(submitting.current||saved)return;submitting.current=true;setBusy(true);setError('');setResult('');try{
  if(!Number.isSafeInteger(sid)||sid<=0||!token)throw Error('ลิงก์ QR ไม่ถูกต้อง กรุณาสแกนใหม่');
  // A previous successful write may have lost its response. Read first; never send a duplicate write intentionally.
  const existing=await readSaved();if(existing){setSaved(existing);return}
  let lat:number|null=null,lng:number|null=null,accuracy:number|null=null;
  if(navigator.geolocation){try{const pos=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:0}));lat=pos.coords.latitude;lng=pos.coords.longitude;accuracy=pos.coords.accuracy;}catch{/* The server decides whether location is required. */}}
  const {data,error:e}=await db().rpc('smart_checkin_v7',{p_session_id:sid,p_token:token,p_lat:lat,p_lng:lng,p_accuracy:accuracy});if(e)throw e;
  if(!data?.ok){const messages:Record<string,string>={sign_in:'กรุณาเข้าสู่ระบบ',not_enrolled:'ไม่ได้รับอนุมัติในรายวิชานี้',cancelled:'คาบนี้ยกเลิกแล้ว',closed:'ปิดรับเช็คชื่อแล้ว',invalid_qr:'QR หมดอายุหรือไม่ถูกต้อง กรุณาสแกนใหม่',already_recorded:'มีบันทึกการเข้าเรียนแล้ว',location_unavailable:'ตำแหน่งไม่พร้อมหรือคลาดเคลื่อนมาก กรุณาติดต่ออาจารย์',outside_zone:'อยู่นอกพื้นที่ กรุณาติดต่ออาจารย์',location_uncertain:'ตำแหน่งใกล้ขอบพื้นที่และยังไม่ชัดเจน กรุณาติดต่ออาจารย์',server_rejected:'ยังบันทึกไม่ได้ กรุณารีเฟรชหรือติดต่ออาจารย์'};throw Error(messages[data?.code]??'ระบบตรวจสอบยังไม่พร้อม กรุณาติดต่ออาจารย์')}
  const status=data.status;
  if(status!=='late'&&status!=='present')throw Error('ยังยืนยันสถานะไม่ได้ กรุณาตรวจประวัติหรือติดต่ออาจารย์');
  setSaved({status,note:'Smart QR self check-in'});setConfirmedAt(new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}));setResult('บันทึกสำเร็จ');
 }catch(e){setError(userMessage(e));try{const row=await readSaved();if(row){setSaved(row);setError('')}}catch{/* Preserve original actionable error. */}}finally{submitting.current=false;setBusy(false)}}
 const invalid=ready&&(!Number.isSafeInteger(sid)||sid<=0||!token);
 return <main className={styles.checkin}><h1>ME-Smart · QR Check-in</h1><p>เข้าสู่ระบบด้วยบัญชีนักศึกษาที่ได้รับอนุมัติในรายวิชา</p>
 {invalid&&<p role="alert" className={styles.error}>ลิงก์ QR ไม่ครบถ้วน กรุณาสแกน QR ล่าสุดจากอาจารย์</p>}
 {context&&<div className={styles.classContext}><strong>{course||`คาบเรียน #${sid}`}</strong><p>{context.session_date} · {context.topic||'ไม่ระบุหัวข้อ'}</p>{context.is_cancelled&&<p>คาบนี้ยกเลิกแล้ว · ประวัติเดิมไม่นับในสถิติ</p>}</div>}
 {error&&<p role="alert" className={styles.error}>{error}</p>}{contextError&&<p role="status" className={styles.warning}>{contextError}</p>}
 {saved&&<div role="status" className={styles.success}><strong>{result||'มีบันทึกการเข้าเรียนแล้ว'}: {statusLabels[saved.status]??saved.status}</strong><p>คาบเรียนหมายเลข {sid}{confirmedAt&&<><br/>เวลาที่ยืนยันผลบนอุปกรณ์: {confirmedAt}</>}</p><p>ไม่ต้องเช็คชื่อซ้ำ หากต้องแก้ไขสถานะกรุณาติดต่ออาจารย์</p><a href="/">กลับไปดูรายวิชาของฉัน</a></div>}
 {!ready?<p>กำลังตรวจสอบบัญชี...</p>:invalid?null:!userId?<form onSubmit={login} className={styles.login}><label>อีเมล<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>รหัสผ่าน<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>{busy?'กำลังเข้าสู่ระบบ...':'เข้าสู่ระบบ'}</button></form>:!saved?<button disabled={busy||contextLoading||context?.is_cancelled} onClick={()=>void submit()}>{busy?'กำลังตรวจสอบและบันทึก...':contextLoading?'กำลังตรวจประวัติ...':'ยืนยันการเข้าเรียน'}</button>:null}
 <p className={styles.note}>เมื่อกดยืนยัน โทรศัพท์อาจขอใช้ตำแหน่ง ระบบตรวจตามเงื่อนไขของอาจารย์ หาก QR หมดอายุให้สแกนใหม่โดยใช้เบราว์เซอร์เดิม</p>
 </main>;
}
