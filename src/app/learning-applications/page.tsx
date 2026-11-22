'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {db} from '../../lib/supabase';

type Course={code:string;status?:string};
const apps=[
 {id:'fluid-properties',title:'Fluid Properties',thai:'สมบัติของไหล',topic:'พื้นฐาน',detail:'ความหนาแน่น ความหนืด และความถ่วงจำเพาะ',ready:false},
 {id:'pressure-manometry',title:'Pressure & Manometry',thai:'ความดันและแมนอมิเตอร์',topic:'ความดัน',detail:'ความดันเกจ ความดันสัมบูรณ์ และระดับของเหลว',ready:false},
 {id:'hydrostatic-pressure',title:'Hydrostatic Pressure',thai:'การกระจายความดันสถิต',topic:'ของไหลสถิต',detail:'ความสัมพันธ์ระหว่างความลึกและความดัน',ready:false},
 {id:'hydrostatic-forces',title:'Hydrostatic Forces',thai:'แรงดันของเหลวบนพื้นผิว',topic:'ของไหลสถิต',detail:'แรงลัพธ์และจุดศูนย์กลางความดัน',ready:false},
 {id:'buoyancy',title:'Buoyancy & Stability',thai:'แรงลอยตัวและเสถียรภาพ',topic:'ของไหลสถิต',detail:'การจม การลอย และเสถียรภาพ',ready:false},
 {id:'continuity',title:'Continuity Equation',thai:'สมการความต่อเนื่อง',topic:'พลศาสตร์ของไหล',detail:'พื้นที่หน้าตัดและความเร็ว',ready:false},
 {id:'bernoulli',title:'Bernoulli & Energy',thai:'สมการพลังงานของไหล',topic:'พลศาสตร์ของไหล',detail:'ความดัน ความเร็ว และการสูญเสียพลังงาน',ready:false},
 {id:'pipe-friction',title:'Pipe Friction & Head Loss',thai:'การสูญเสียในท่อ',topic:'การไหลภายใน',detail:'Reynolds number และ Darcy–Weisbach',ready:false},
 {id:'couette-poiseuille',title:'Couette–Poiseuille Flow',thai:'การไหลระหว่างแผ่นขนาน',topic:'การไหลภายใน',detail:'ปรับความเร็วแผ่น ความหนืด และความดันตกคร่อม',ready:true},
 {id:'pump-curves',title:'Pump & System Curves',thai:'เส้นโค้งปั๊มและระบบ',topic:'เครื่องจักรของไหล',detail:'จุดทำงานของปั๊มและระบบ',ready:false}
];
export default function LearningHub(){
 const [auth,setAuth]=useState<'loading'|'allowed'|'denied'>('loading');
 const [search,setSearch]=useState('');
 const [topic,setTopic]=useState('ทั้งหมด');
 useEffect(()=>{let active=true;(async()=>{
   const {data:{user}}=await db().auth.getUser();
   if(!user){if(active)setAuth('denied');return;}
   const {data:profile,error}=await db().from('profiles').select('role').eq('id',user.id).single();
   if(error||!profile){if(active)setAuth('denied');return;}
   if(profile.role==='teacher'){if(active)setAuth('allowed');return;}
   if(profile.role!=='student'){if(active)setAuth('denied');return;}
   const {data:courses,error:courseError}=await db().rpc('my_courses');
   if(active)setAuth(!courseError&&(courses as Course[]|null)?.some(c=>c.code==='4112203'&&c.status==='approved')?'allowed':'denied');
 })().catch(()=>{if(active)setAuth('denied')});return()=>{active=false}},[]);
 const topics=['ทั้งหมด',...Array.from(new Set(apps.map(a=>a.topic)))];
 const filtered=useMemo(()=>apps.filter(a=>(topic==='ทั้งหมด'||a.topic===topic)&&[a.title,a.thai,a.detail].join(' ').toLowerCase().includes(search.toLowerCase())),[topic,search]);
 if(auth==='loading')return <main style={{padding:32}}>กำลังตรวจสอบสิทธิ์รายวิชา...</main>;
 if(auth==='denied')return <main style={{padding:32}}><h1>Learning Applications</h1><p>เฉพาะนักศึกษาที่ได้รับอนุมัติในรายวิชา 4112203 Fluid Mechanics และอาจารย์เท่านั้น</p><Link href="/">กลับสู่ ME-SMART</Link></main>;
 return <main style={{maxWidth:1100,margin:'0 auto',padding:'28px 18px',fontFamily:'system-ui,sans-serif',color:'#18324c'}}>
 <Link href="/">← กลับสู่ ME-SMART</Link>
 <header style={{background:'linear-gradient(120deg,#123c62,#167b91)',color:'white',borderRadius:20,padding:'26px 24px',margin:'20px 0'}}>
 <p style={{margin:0,opacity:.85}}>ME-SMART · 4112203 Fluid Mechanics</p><h1 style={{margin:'8px 0'}}>Engineering Learning Hub</h1>
 <p style={{margin:0}}>เลือกบทเรียนและแอปจำลองเพื่อเรียนรู้และทดลองด้วยตนเอง</p></header>
 <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginBottom:20}}>
 <label htmlFor="app-search">ค้นหาแอป</label><input id="app-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ชื่อแอปหรือบทเรียน" style={{flex:'1 1 250px',padding:12,borderRadius:10,border:'1px solid #a9bfd0'}}/>
 <label htmlFor="topic-select">หมวดบทเรียน</label><select id="topic-select" value={topic} onChange={e=>setTopic(e.target.value)} style={{padding:12,borderRadius:10,border:'1px solid #a9bfd0'}}>{topics.map(t=><option key={t}>{t}</option>)}</select>
 </div><p aria-live="polite">พบ {filtered.length} แอป · พร้อมทดลอง {filtered.filter(a=>a.ready).length} แอป</p>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:16}}>
 {filtered.map(a=><article key={a.id} style={{background:'white',border:'1px solid #d4e3eb',borderRadius:16,padding:20,display:'flex',flexDirection:'column',gap:10}}>
 <span style={{fontSize:13,color:'#53738a'}}>{a.topic} · {a.ready?'พร้อมทดลอง':'กำลังวางแผน'}</span>
 <h2 style={{fontSize:19,margin:0}}>{a.title}</h2><strong>{a.thai}</strong><p style={{margin:0,flex:1,color:'#48657a'}}>{a.detail}</p>
 {a.ready?<Link href="/learning-applications/fluid-mechanics/couette-poiseuille" style={{display:'block',background:'#0b678c',color:'white',textAlign:'center',padding:12,borderRadius:10,textDecoration:'none'}}>เปิดห้องทดลอง →</Link>:<span style={{padding:12,background:'#f0f4f7',color:'#657988',borderRadius:10,textAlign:'center'}}>ยังไม่เปิดใช้งาน</span>}
 </article>)}</div>
 {filtered.length===0&&<p>ไม่พบแอปที่ตรงกับคำค้นหา</p>}
 <p style={{fontSize:13,color:'#657988',marginTop:24}}>แอปที่ยังไม่พร้อมเป็นแผนพัฒนา ไม่มีการบันทึกคะแนนหรือส่งงานในรุ่นนี้</p>
 </main>
}
