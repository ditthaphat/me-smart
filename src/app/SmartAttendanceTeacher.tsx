'use client';
import {useCallback,useEffect,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {db} from '../lib/supabase';
import styles from './smart-attendance.module.css';
type Session = {
  id: number;
  session_date: string;
  topic: string;
  is_cancelled: boolean;
};
type Window={session_id:number;is_open:boolean;closes_at:string};
const message = (e: unknown): string => {
  if (e instanceof Error) {
    return e.message;
  }

  if (typeof e === 'string') {
    return e;
  }

  if (e !== null && typeof e === 'object') {
    const obj = e as {
      message?: unknown;
      details?: unknown;
      code?: unknown;
    };

    const parts = [
      obj.message,
      obj.details,
      obj.code
    ].filter(
      (v): v is string =>
        typeof v === 'string' && v.length > 0
    );

    if (parts.length > 0) {
      return parts.join(' | ');
    }
  }

  return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
};
export default function SmartAttendanceTeacher({courseId}:{courseId:number}){
 const [sessions,setSessions]=useState<Session[]>([]),[selected,setSelected]=useState(''),[minutes,setMinutes]=useState(15),[late,setLate]=useState(10);
 const [gps,setGps]=useState(false),[lat,setLat]=useState(''),[lng,setLng]=useState(''),[radius,setRadius]=useState(150);
 const [token,setToken]=useState(''),[expires,setExpires]=useState(0),[windowOpen,setWindowOpen]=useState(false),[ends,setEnds]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState(''),[checked,setChecked]=useState(0);
 const sid=Number(selected);
 useEffect(() => {
  function handleOpenQR(event: Event) {
    const customEvent = event as CustomEvent<{
      courseId: number;
      sessionId: number;
    }>;

    const detail = customEvent.detail;

    if (!detail) return;

    if (Number(detail.courseId) !== courseId) return;

    const targetSession = sessions.find(
      s => s.id === Number(detail.sessionId)
    );

    if (!targetSession) {
      setError('ไม่พบคาบเรียนนี้ กรุณากดโหลดคาบเรียนใหม่');
      return;
    }

    if (targetSession.is_cancelled) {
      setError('ไม่สามารถเปิด QR สำหรับคาบเรียนที่ยกเลิกได้');
      return;
    }

    setSelected(String(targetSession.id));
    setError('');
    setInfo(
      `เลือกคาบเรียนแล้ว: ${targetSession.session_date} — ${targetSession.topic}`
    );
  }

  window.addEventListener('me-smart:open-qr', handleOpenQR);

  return () => {
    window.removeEventListener('me-smart:open-qr', handleOpenQR);
  };
}, [courseId, sessions]);
const refresh = useCallback(async () => {
  const { data, error: e } = await db()
    .from('attendance_sessions')
    .select('id,session_date,topic,is_cancelled')
    .eq('course_id', courseId)
    .eq('is_cancelled', false)
    .order('session_date', { ascending: false })
    .order('id', { ascending: false });

  if (e) {
    setError(message(e));
    return;
  }

  const items = (data ?? []) as Session[];

  setSessions(items);

  setSelected(old => {
    const stillExists = items.some(
      s => String(s.id) === old
    );

    return stillExists
      ? old
      : String(items[0]?.id ?? '');
  });

  setError('');
}, [courseId]);
 useEffect(()=>{void refresh()},[refresh]);
 useEffect(()=>{setToken('');setWindowOpen(false);setEnds('');if(!sid)return;
  void (async()=>{const {data}=await db().from('smart_attendance_windows').select('session_id,is_open,closes_at').eq('session_id',sid).maybeSingle();const w=data as Window|null;if(w?.is_open&&new Date(w.closes_at).getTime()>Date.now()){setWindowOpen(true);setEnds(w.closes_at)}})();
 },[sid]);
 const rotate=useCallback(async()=>{if(!sid)return;
  const {data,error:e}=await db().rpc('smart_rotate_qr',{p_session_id:sid});
  if(e){setToken('');setError(e.message);if(/closed/i.test(e.message))setWindowOpen(false);return}
  setToken(String(data));setExpires(Date.now()+29000);setError('');
 },[sid]);
 useEffect(()=>{if(!windowOpen)return;void rotate();const timer=setInterval(()=>void rotate(),20000);return()=>clearInterval(timer)},[windowOpen,rotate]);
 useEffect(()=>{if(!sid)return;const poll=async()=>{const {count}=await db().from('attendance_records').select('student_id',{count:'exact',head:true}).eq('session_id',sid);setChecked(count??0)};void poll();const timer=setInterval(()=>void poll(),5000);return()=>clearInterval(timer)},[sid]);
 function locate(){if(!navigator.geolocation){setError('เบราว์เซอร์ไม่รองรับ GPS');return}navigator.geolocation.getCurrentPosition(p=>{setLat(String(p.coords.latitude));setLng(String(p.coords.longitude));setInfo(`ตำแหน่งอาจารย์ (ความแม่นยำ ±${Math.round(p.coords.accuracy)} เมตร) กรุณาตรวจสอบว่าอยู่ที่ห้องเรียนจริง`)},e=>setError(e.message),{enableHighAccuracy:true,timeout:15000});}
 async function start(){setBusy(true);setError('');setInfo('');try{
  if(!sid)throw Error('กรุณาสร้างคาบเรียนก่อน');if(gps&&(!lat.trim()||!lng.trim()))throw Error('กรุณากำหนดพิกัดห้องเรียน');
  const {error:e}=await db().rpc('smart_start_window',{p_session_id:sid,p_minutes:minutes,p_late_minutes:late,p_require_location:gps,p_lat:gps?Number(lat):null,p_lng:gps?Number(lng):null,p_radius:radius});if(e)throw e;
  setEnds(new Date(Date.now()+minutes*60000).toISOString());setWindowOpen(true);setInfo('เปิดรับเช็คชื่อแล้ว QR จะเปลี่ยนอัตโนมัติ');
 }catch(e){setError(message(e))}finally{setBusy(false)}}
 async function stop(){setBusy(true);const {error:e}=await db().rpc('smart_stop_window',{p_session_id:sid});setBusy(false);if(e)setError(e.message);else{setWindowOpen(false);setToken('');setInfo('ปิดรับเช็คชื่อแล้ว')}}
 const link=typeof window!=='undefined'&&token?`http://192.168.1.44:3000/checkin?session=${sid}&token=${encodeURIComponent(token)}`:'';
 return <section className={styles.panel} aria-label="Smart Attendance Phase 3"><h2>Smart Attendance · Phase 3</h2><p>อาจารย์เปิด QR แบบหมุนเวียน นักศึกษาสแกนจากมือถือเพื่อเช็คชื่อ</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{info&&<p role="status" className={styles.success}>{info}</p>}
  {sessions.length === 0 && !error && (
  <div
    role="status"
    style={{
      padding: '20px',
      marginTop: '16px',
      marginBottom: '20px',
      backgroundColor: '#fff7ed',
      border: '1px solid #fed7aa',
      borderRadius: '12px',
      color: '#9a3412',
      lineHeight: '1.8'
    }}
  >
    <strong>ไม่มีคาบเรียนที่สามารถเปิด QR ได้</strong>
    <p style={{ marginBottom: 0 }}>
      กรุณาสร้างคาบเรียนใหม่ หรือคืนสถานะคาบเรียนที่ยกเลิก
      <br />
      ใน Attendance Management
    </p>
  </div>
)}
  <div className={styles.grid}><label>คาบเรียน<select value={selected} onChange={e=>setSelected(e.target.value)}>{sessions.map(s=><option key={s.id} value={s.id}>{s.session_date} — {s.topic}</option>)}</select></label>
  <label>เปิดเช็คชื่อ (นาที)<input type="number" min={1} max={180} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label>
  <label>เริ่มนับสายหลัง (นาที)<input type="number" min={0} max={180} value={late} onChange={e=>setLate(Number(e.target.value))}/></label>
  <label>รัศมีตรวจสอบ GPS (เมตร)<input type="number" min={30} max={2000} value={radius} onChange={e=>setRadius(Number(e.target.value))}/></label></div>
  <label className={styles.check}><input type="checkbox" checked={gps} onChange={e=>setGps(e.target.checked)}/> เปิดตรวจสอบตำแหน่ง (GPS) — ใช้ได้เมื่อเว็บไซต์เป็น HTTPS</label>
  {gps&&<div className={styles.grid}><label>Latitude<input type="number" step="any" value={lat} onChange={e=>setLat(e.target.value)}/></label><label>Longitude<input type="number" step="any" value={lng} onChange={e=>setLng(e.target.value)}/></label><button type="button" onClick={locate}>ใช้พิกัดปัจจุบันของอาจารย์</button></div>}
 
  <div className={styles.actions}><button type="button" disabled={busy||!sid||windowOpen} onClick={()=>void start()}>เริ่มเปิด QR</button><button type="button" disabled={busy||!windowOpen} onClick={()=>void stop()}>ปิดรับเช็คชื่อ</button><button type="button" onClick={()=>void refresh()}>โหลดคาบเรียนใหม่</button></div>
  {windowOpen&&<div className={styles.qr}>{token&&Date.now()<expires?<QRCodeSVG value={link} size={256} marginSize={2}/>:<p>กำลังสร้าง QR ใหม่...</p>}<strong>เช็คชื่อแล้ว {checked} รายการ</strong><span>หมดเวลาเปิดรับ: {ends?new Date(ends).toLocaleTimeString('th-TH'):''}</span><small>QR หมดอายุภายใน 30 วินาที · ห้ามแชร์ภาพ QR</small></div>}
  <p className={styles.note}>หมายเหตุ: GPS ปลอมได้และคลาดเคลื่อนในอาคาร หากไม่ผ่านการตรวจสอบให้อาจารย์ใช้ระบบเช็คชื่อเดิมยืนยันตัวบุคคลแทน</p>
 </section>
}
