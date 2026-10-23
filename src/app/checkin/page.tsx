'use client';
import {useEffect,useState} from 'react';
import {db} from '../../lib/supabase';

import styles from '../smart-attendance.module.css';
export default function Checkin(){
 const [sid,setSid]=useState(0),[token,setToken]=useState('');
 const [logged,setLogged]=useState<boolean|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const q=new URLSearchParams(window.location.search);setSid(Number(q.get('session')));setToken(q.get('token')??'');void db().auth.getUser().then(({data})=>setLogged(Boolean(data.user)))},[]);
 async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');const {error:err}=await db().auth.signInWithPassword({email,password});setBusy(false);if(err)setError(err.message);else setLogged(true)}
 async function submit(){setBusy(true);setError('');setResult('');try{
  if(!Number.isSafeInteger(sid)||sid<=0||!token)throw Error('ลิงก์ QR ไม่ถูกต้อง');
  let lat:number|null=null,lng:number|null=null,accuracy:number|null=null;
  if(navigator.geolocation){try{const pos=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:0}));lat=pos.coords.latitude;lng=pos.coords.longitude;accuracy=pos.coords.accuracy;}catch{/* GPS may be optional; RPC enforces policy */}}
  const {data,error:e}=await db().rpc('smart_checkin',{p_session_id:sid,p_token:token,p_lat:lat,p_lng:lng,p_accuracy:accuracy});if(e)throw e;
  setResult(data==='late'?'บันทึกสำเร็จ: มาเรียนสาย':'บันทึกสำเร็จ: มาเรียน');
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <main className={styles.checkin}><h1>ME-Smart · QR Check-in</h1><p>เข้าสู่ระบบด้วยบัญชีนักศึกษาที่ได้รับอนุมัติในรายวิชา</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{result&&<p role="status" className={styles.success}>{result}</p>}
  {logged===null?<p>กำลังตรวจสอบบัญชี...</p>:!logged?<form onSubmit={login} className={styles.login}><label>อีเมล<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>รหัสผ่าน<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>เข้าสู่ระบบ</button></form>:<button disabled={busy||Boolean(result)} onClick={()=>void submit()}>{busy?'กำลังตรวจสอบ...':'ยืนยันการเข้าเรียน'}</button>}
  <p className={styles.note}>การตรวจสอบตำแหน่งจะขออนุญาตจากโทรศัพท์ เฉพาะเมื่ออาจารย์กำหนด หากเช็คชื่อไม่ได้ โปรดติดต่ออาจารย์เพื่อยืนยันด้วยตนเอง</p>
 </main>
}
