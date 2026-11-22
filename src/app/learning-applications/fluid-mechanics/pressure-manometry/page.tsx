'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {db} from '../../../../lib/supabase';

const g=9.81;
export default function PressureManometry(){
 const [access,setAccess]=useState<'loading'|'allowed'|'denied'>('loading');
 const [rho,setRho]=useState(1000);
 const [depth,setDepth]=useState(2);
 const [atmos,setAtmos]=useState(101325);
 useEffect(()=>{let active=true;(async()=>{
  const {data:{user}}=await db().auth.getUser();
  if(!user){if(active)setAccess('denied');return;}
  const {data:profile,error}=await db().from('profiles').select('role').eq('id',user.id).single();
  if(error||!profile){if(active)setAccess('denied');return;}
  if(profile.role==='teacher'){if(active)setAccess('allowed');return;}
  if(profile.role!=='student'){if(active)setAccess('denied');return;}
  const {data:courses,error:courseError}=await db().rpc('my_courses');
  const ok=!courseError&&(courses??[]).some((c:{code:string;status?:string})=>c.code==='4112203'&&c.status==='approved');
  if(active)setAccess(ok?'allowed':'denied');
 })().catch(()=>{if(active)setAccess('denied')});return()=>{active=false}},[]);
 const gauge=rho*g*depth;
 const absolute=atmos+gauge;
 if(access==='loading')return <main style={{padding:32}}>กำลังตรวจสอบสิทธิ์...</main>;
 if(access==='denied')return <main style={{padding:32}}><h1>Pressure & Manometry</h1><p>เฉพาะนักศึกษาที่ได้รับอนุมัติรายวิชา 4112203 และอาจารย์เท่านั้น</p><Link href="/">กลับ ME-SMART</Link></main>;
 return <main style={{maxWidth:900,margin:'auto',padding:24,fontFamily:'system-ui,sans-serif',color:'#16324c'}}>
 <Link href="/learning-applications">← กลับสู่คลังแอป</Link><h1>Pressure & Manometry</h1><p>การทดลองเสมือน: ความดันในของเหลวหยุดนิ่ง ณ ความลึก h จากผิวอิสระที่เปิดสู่บรรยากาศ</p>
 <section style={{border:'1px solid #c8dce8',borderRadius:16,padding:20,background:'white'}}>
 <h2>Hydrostatic Pressure · p = ρgh</h2>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:18}}>
 <label>ความหนาแน่น ρ = {rho} kg/m³<input style={{display:'block',width:'100%'}} type="range" min="700" max="1400" step="10" value={rho} onChange={e=>setRho(+e.target.value)}/></label>
 <label>ความลึก h = {depth.toFixed(1)} m<input style={{display:'block',width:'100%'}} type="range" min="0" max="10" step="0.1" value={depth} onChange={e=>setDepth(+e.target.value)}/></label>
 <label>ความดันบรรยากาศ = {(atmos/1000).toFixed(3)} kPa<input style={{display:'block',width:'100%'}} type="range" min="80000" max="110000" step="125" value={atmos} onChange={e=>setAtmos(+e.target.value)}/></label>
 </div>
 <svg role="img" aria-label="กราฟความดันเกจเพิ่มเชิงเส้นตามความลึก" viewBox="0 0 640 300" style={{width:'100%',background:'#f0f8fc',borderRadius:12,marginTop:20}}>
 <line x1="70" y1="35" x2="70" y2="260" stroke="#678" strokeWidth="2"/><line x1="70" y1="260" x2="595" y2="260" stroke="#678" strokeWidth="2"/>
 <text x="18" y="25" fontSize="15">h (m)</text><text x="410" y="288" fontSize="15">p gauge (kPa)</text>
 <path d={`M 70 35 L ${70+(gauge/(1400*g*10))*500} ${35+depth/10*225}`} stroke="#087ca3" strokeWidth="4" fill="none"/>
 <circle cx={70+(gauge/(1400*g*10))*500} cy={35+depth/10*225} r="6" fill="#087ca3"/>
 <text x="80" y="52" fontSize="14">0 kPa · ผิวอิสระ</text>
 <text x="80" y="245" fontSize="14">ความลึกปัจจุบัน {depth.toFixed(1)} m</text>
 </svg>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12,marginTop:12}}>
 <p><strong>Gauge pressure</strong><br/>{(gauge/1000).toFixed(3)} kPa</p><p><strong>Absolute pressure</strong><br/>{(absolute/1000).toFixed(3)} kPa</p><p><strong>Pressure head</strong><br/>{depth.toFixed(3)} m</p></div>
 <button onClick={()=>{setRho(1000);setDepth(2);setAtmos(101325)}} style={{padding:'10px 18px',borderRadius:8,cursor:'pointer'}}>คืนค่าเริ่มต้น</button>
 <p style={{fontSize:13,color:'#52657b'}}>สมมติฐาน: ของเหลวหยุดนิ่ง ความหนาแน่นคงที่ g = 9.81 m/s² และผิวอิสระเปิดสู่บรรยากาศ รุ่นนี้จำลองความดันสถิต ยังไม่จำลองแมนอมิเตอร์หลายของเหลว</p>
 </section></main>;
}
