'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {db} from '../lib/supabase';
import {userMessage} from '../lib/messages';
import {countdown,qrLink,validateWindow} from '../lib/attendance-utils';
import styles from './smart-attendance.module.css';
type Session={id:number;session_date:string;topic:string;is_cancelled:boolean};
type WindowRow={is_open:boolean;closes_at:string;late_after_minutes:number;require_location:boolean;latitude:number|null;longitude:number|null;radius_m:number};
export default function SmartAttendanceTeacher({session,courseCode,onLockChange,disabled=false}:{session:Session;courseCode:string;onLockChange:(locked:boolean)=>void;disabled?:boolean}) {
 const [minutes,setMinutes]=useState(15),[late,setLate]=useState(10),[gps,setGps]=useState(false),[lat,setLat]=useState(''),[lng,setLng]=useState(''),[radius,setRadius]=useState(150);
 const [open,setOpen]=useState(false),[ends,setEnds]=useState(''),[token,setToken]=useState(''),[expires,setExpires]=useState(0),[now,setNow]=useState(0);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[info,setInfo]=useState(''),[checked,setChecked]=useState<number|null>(null),[expanded,setExpanded]=useState(false),[origin,setOrigin]=useState('');
 const epoch=useRef(0),action=useRef(false),panel=useRef<HTMLElement>(null),expandButton=useRef<HTMLButtonElement>(null);
 const sid=session.id;
 useEffect(()=>{setOrigin(window.location.origin);setNow(Date.now());const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);
 useEffect(()=>{onLockChange(open||busy||loading);return()=>onLockChange(false)},[open,busy,loading,onLockChange]);
 const readWindow=useCallback(async()=>{
  const {data,error:e}=await db().from('smart_attendance_windows').select('is_open,closes_at,late_after_minutes,require_location,latitude,longitude,radius_m').eq('session_id',sid).maybeSingle();
  if(e)throw e;return data as WindowRow|null;
 },[sid]);
 const applyWindow=useCallback((w:WindowRow|null)=>{
  const isOpen=Boolean(w?.is_open&&Date.parse(w.closes_at)>Date.now());setOpen(isOpen);setEnds(w?.closes_at??'');
  if(w){setLate(w.late_after_minutes);setGps(w.require_location);setLat(w.latitude===null?'':String(w.latitude));setLng(w.longitude===null?'':String(w.longitude));setRadius(w.radius_m)}
  if(!isOpen){setToken('');setExpanded(false)}
 },[]);
 useEffect(()=>{const version=++epoch.current;setToken('');setOpen(false);setEnds('');setChecked(null);setError('');setInfo('');setLoading(true);
  if(session.is_cancelled){setLoading(false);return}
  void readWindow().then(w=>{if(epoch.current===version)applyWindow(w)}).catch(e=>{if(epoch.current===version)setError(userMessage(e))}).finally(()=>{if(epoch.current===version)setLoading(false)});
  return()=>{epoch.current++};
 },[sid,session.is_cancelled,readWindow,applyWindow]);
 useEffect(()=>{if(!open||!ends||now<Date.parse(ends))return;setOpen(false);setToken('');setExpanded(false);setInfo('หมดเวลาเปิดรับเช็คชื่อแล้ว')},[open,ends,now]);
 useEffect(()=>{if(!open||session.is_cancelled)return;let active=true,inFlight=false;
  const rotate=async()=>{if(inFlight)return;inFlight=true;setToken('');const requestedAt=Date.now();try{const {data,error:e}=await db().rpc('smart_rotate_qr',{p_session_id:sid});if(!active)return;if(e)throw e;if(typeof data!=='string'||!data)throw Error('สร้าง QR ไม่สำเร็จ');if(Date.now()>=requestedAt+29000){setToken('');return}setToken(data);setExpires(requestedAt+29000);setError('')}
   catch(e){if(!active)return;setToken('');setError(userMessage(e));if(/closed|cancelled|authorized/i.test(userMessage(e))){setOpen(false);setExpanded(false)}}finally{inFlight=false}};
  void rotate();const t=setInterval(()=>void rotate(),20000);return()=>{active=false;clearInterval(t)};
 },[open,sid,session.is_cancelled]);
 useEffect(()=>{let active=true,inFlight=false;const poll=async()=>{if(inFlight)return;inFlight=true;try{const {count,error:e}=await db().from('attendance_records').select('student_id',{count:'exact',head:true}).eq('session_id',sid).in('status',['present','late']);if(!active)return;if(e)throw e;setChecked(count??0)}catch{if(active)setChecked(null)}finally{inFlight=false}};void poll();const t=open?setInterval(()=>void poll(),5000):undefined;return()=>{active=false;if(t)clearInterval(t)}},[sid,open]);
 useEffect(()=>{if(!expanded)return;const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';expandButton.current?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false);if(e.key==='Tab'){e.preventDefault();expandButton.current?.focus()}};window.addEventListener('keydown',key);
  return()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',key);previous?.focus()};
 },[expanded]);
 async function start(){if(action.current||disabled||session.is_cancelled)return;const invalid=validateWindow(minutes,late,gps,lat,lng,radius);if(invalid){setError(invalid);return}action.current=true;setBusy(true);setError('');setInfo('');const version=epoch.current;
  try{const {error:e}=await db().rpc('smart_start_window',{p_session_id:sid,p_minutes:minutes,p_late_minutes:late,p_require_location:gps,p_lat:gps?Number(lat):null,p_lng:gps?Number(lng):null,p_radius:radius});if(e)throw e;
   // Keep the session locked if the write succeeded but the subsequent read fails.
   if(epoch.current!==version)return;setEnds(new Date(Date.now()+minutes*60000).toISOString());setOpen(true);
   const w=await readWindow();if(epoch.current!==version)return;if(!w)throw Error('เปิดรับแล้ว แต่โหลดสถานะล่าสุดไม่ได้ กรุณาปิดรับแล้วลองใหม่');applyWindow(w);setInfo('เปิดรับเช็คชื่อแล้ว นักศึกษาสแกน QR ด้านล่างได้')
  }catch(e){if(epoch.current===version)setError(userMessage(e))}finally{action.current=false;if(epoch.current===version)setBusy(false)}}
 async function stop(){if(action.current)return;action.current=true;setBusy(true);setError('');try{const {error:e}=await db().rpc('smart_stop_window',{p_session_id:sid});if(e)throw e;setOpen(false);setToken('');setExpanded(false);setInfo('ปิดรับเช็คชื่อแล้ว')}catch(e){setError(userMessage(e))}finally{action.current=false;setBusy(false)}}
 useEffect(()=>{if(!open)return;let active=true;const timer=setInterval(()=>{void readWindow().then(w=>{if(active&&!action.current)applyWindow(w)}).catch(e=>{if(active)setError('ตรวจสถานะล่าสุดไม่สำเร็จ: '+userMessage(e))})},5000);return()=>{active=false;clearInterval(timer)}},[open,readWindow,applyWindow]);
 function locate(){if(!navigator.geolocation){setError('เบราว์เซอร์ไม่รองรับ GPS');return}navigator.geolocation.getCurrentPosition(p=>{setLat(String(p.coords.latitude));setLng(String(p.coords.longitude));setInfo(`ความแม่นยำตำแหน่ง ±${Math.round(p.coords.accuracy)} เมตร กรุณาตรวจว่าอยู่ที่ห้องเรียนจริง`)},e=>setError(userMessage(e)),{enableHighAccuracy:true,timeout:15000})}
 const link=origin&&token?qrLink(origin,sid,token):'';
 return <section ref={panel} id="me-smart-qr-panel" className={styles.panel} aria-label="ควบคุม QR ของคาบที่เลือก">
  <h3>2. เปิดรับเช็คชื่อด้วย QR</h3><p><strong>{courseCode} · {session.session_date}</strong><br/>{session.topic||'ไม่ระบุหัวข้อ'}</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{info&&<p role="status" className={styles.success}>{info}</p>}
  {session.is_cancelled?<p className={styles.note}>คาบนี้ยกเลิกแล้ว ไม่สามารถเปิด QR ได้</p>:<>
  {origin&&new URL(origin).hostname==='localhost'&&<p className={styles.warning}>กำลังเปิดผ่าน localhost: มือถือเปิด QR นี้ไม่ได้ ให้เปิดหน้าอาจารย์ผ่านที่อยู่ Network ที่ Terminal แสดง หรือใช้เว็บไซต์ HTTPS ก่อนเปิด QR</p>}
  {disabled&&!open&&<p className={styles.note}>กรุณาบันทึกหรือยกเลิกการแก้ไขรายชื่อก่อนเปิด QR</p>}
  <fieldset disabled={open||busy||loading||disabled} className={styles.settings}><legend>ตั้งค่าก่อนเปิดรับ</legend><div className={styles.grid}>
   <label>เปิดรับเช็คชื่อ (นาที)<input type="number" min={1} max={180} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label>
   <label>เริ่มนับสายหลังเปิดรับ (นาที)<input type="number" min={0} max={minutes} value={late} onChange={e=>setLate(Number(e.target.value))}/></label>
  </div><label className={styles.check}><input type="checkbox" checked={gps} onChange={e=>setGps(e.target.checked)}/> ตรวจตำแหน่ง GPS (ใช้ HTTPS)</label>
  {gps&&<div className={styles.grid}><label>ละติจูด<input type="number" step="any" value={lat} onChange={e=>setLat(e.target.value)}/></label><label>ลองจิจูด<input type="number" step="any" value={lng} onChange={e=>setLng(e.target.value)}/></label><label>รัศมี (เมตร)<input type="number" min={30} max={2000} value={radius} onChange={e=>setRadius(Number(e.target.value))}/></label><button type="button" onClick={locate}>ใช้ตำแหน่งปัจจุบัน</button></div>}</fieldset>
  <div className={styles.actions}><button type="button" disabled={open||busy||loading||disabled} onClick={()=>void start()}>{loading?'กำลังตรวจสถานะคาบ...':busy?'กำลังดำเนินการ...':'เปิดรับเช็คชื่อ'}</button><button type="button" disabled={!open||busy} onClick={()=>void stop()}>ปิดรับเช็คชื่อ</button></div>
  {open&&<div className={expanded?styles.presentation:styles.qr} role={expanded?'dialog':undefined} aria-modal={expanded||undefined} aria-label={expanded?'QR สำหรับแสดงในห้องเรียน':undefined}>
   <p className={styles.presentationTitle}>{courseCode} · {session.topic||'ไม่ระบุหัวข้อ'}</p><span>{session.session_date} · คาบ #{sid}</span>
   {link&&now<expires?<QRCodeSVG value={link} size={expanded?440:256} marginSize={4}/>:<p role="status">กำลังรอ QR ล่าสุด…</p>}
   <strong className={styles.timer}>เหลือเวลา {countdown(ends,now)}</strong><strong>มาเรียน / สาย {checked===null?'กำลังตรวจสอบ':`${checked} คน`}</strong><span>เริ่มสายหลังเปิดรับ {late} นาที · {gps?'ตรวจ GPS':'ไม่ตรวจ GPS'}</span><small>QR เปลี่ยนทุก 20 วินาที · สแกนจากหน้าจอปัจจุบัน</small>
   <button ref={expandButton} type="button" onClick={()=>setExpanded(x=>!x)}>{expanded?'กลับหน้าควบคุม (Esc)':'แสดง QR เต็มหน้าจอ'}</button>
  </div>}
  <p className={styles.warning}>{gps?'ตรวจ GPS: V7 อาจขอให้อาจารย์ยืนยันกรณีตำแหน่งไม่ชัดเจน':'ไม่ได้เปิดตรวจ GPS: ผู้ได้รับรูป QR อาจเช็คชื่อจากนอกห้องได้ขณะรหัสยังใช้ได้'}</p>
  <p className={styles.note}>เวลาในหน้าจอใช้ประกอบการแสดงผล ระบบตัดสินสถานะจากเวลาเซิร์ฟเวอร์ · GPS อาจคลาดเคลื่อนในอาคาร</p>
  </>}
 </section>;
}
