'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {db} from '../../lib/supabase';
import styles from './learning-hub.module.css';

type Course={code:string;status?:string};
const apps=[
 {id:'fluid-properties',title:'Fluid Properties',thai:'สมบัติของไหล',topic:'พื้นฐาน',detail:'ความหนาแน่น ความหนืด และความถ่วงจำเพาะ',ready:false},
 {id:'pressure-manometry',title:'Pressure & Manometry',thai:'ความดันและแมนอมิเตอร์',topic:'ความดัน',detail:'ทดลองความดันเกจ ความดันสัมบูรณ์ และเฮดความดัน (แมนอมิเตอร์หลายของเหลวอยู่ระหว่างพัฒนา)',ready:true},
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
 const [availability,setAvailability]=useState<'all'|'ready'>('all');
 const [visits,setVisits]=useState<Record<string,{count:number;users:number}>>({});
 const [visitError,setVisitError]=useState(false);
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
 const filtered=useMemo(()=>apps.filter(a=>(topic==='ทั้งหมด'||a.topic===topic)&&(availability==='all'||a.ready)&&[a.title,a.thai,a.detail].join(' ').toLowerCase().includes(search.toLowerCase())),[topic,search,availability]);
 useEffect(()=>{if(auth!=='allowed')return;let active=true;db().rpc('learning_app_visit_stats').then(({data,error})=>{if(!active)return;if(error){setVisitError(true);return;}const next:Record<string,{count:number;users:number}>={};for(const row of data??[]){next[row.app_id]={count:Number(row.visit_count),users:Number(row.unique_users)}}setVisits(next);setVisitError(false)});return()=>{active=false}},[auth]);
 if(auth==='loading')return <main style={{padding:32}}>กำลังตรวจสอบสิทธิ์รายวิชา...</main>;
 if(auth==='denied')return <main style={{padding:32}}><h1>Learning Applications</h1><p>เฉพาะนักศึกษาที่ได้รับอนุมัติในรายวิชา 4112203 Fluid Mechanics และอาจารย์เท่านั้น</p><Link href="/">กลับสู่ ME-SMART</Link></main>;
 const symbols:Record<string,string>={'fluid-properties':'💧','pressure-manometry':'📏','hydrostatic-pressure':'🌊','hydrostatic-forces':'🚪','buoyancy':'⚓','continuity':'🔀','bernoulli':'📉','pipe-friction':'🧪','couette-poiseuille':'〰️','pump-curves':'⚙️'};
 const readyApps=filtered.filter(a=>a.ready);
 const plannedApps=filtered.filter(a=>!a.ready);
 const renderCard=(a:typeof apps[number],index:number)=><article key={a.id} className={styles.card}>
   <div className={styles.cardTop}><span className={styles.symbol} aria-hidden="true">{symbols[a.id]}</span><span className={a.ready?styles.status:`${styles.status} ${styles.pending}`}>{a.ready?'● พร้อมทดลอง':'○ อยู่ในแผนพัฒนา'}</span></div>
   <span className={styles.topic}>บทเรียน {String(apps.indexOf(a)+1).padStart(2,'0')} · {a.topic}</span>
   <h3>{a.title}</h3>{a.ready&&<span className={styles.topic}>{visitError?'สถิติการใช้งานยังไม่พร้อม':`เปิดใช้งาน ${(visits[a.id]?.count??0).toLocaleString('th-TH')} ครั้ง · ผู้ใช้ ${(visits[a.id]?.users??0).toLocaleString('th-TH')} คน`}</span>}<span className={styles.thai}>{a.thai}</span><p className={styles.desc}>{a.detail}</p>
   {a.ready?<Link className={styles.launch} href={a.id==='pressure-manometry'?'/learning-applications/fluid-mechanics/pressure-manometry':'/learning-applications/fluid-mechanics/couette-poiseuille'}>เปิดห้องทดลอง →</Link>:<span className={styles.disabled}>ยังไม่เปิดใช้งาน</span>}
 </article>;
 return <main className={styles.shell}>
 <Link className={styles.back} href="/">← กลับสู่ ME-SMART</Link>
 <header className={styles.hero}><div className={styles.eyebrow}>ME-SMART · 4112203 Fluid Mechanics</div><h1>Engineering Learning Hub</h1><p>ห้องปฏิบัติการเสมือนจริงสำหรับนักศึกษาวิศวกรรมเครื่องกล เลือกบทเรียน ทดลองปรับตัวแปร และศึกษาผลลัพธ์ด้วยตนเอง</p></header>
 <div className={styles.stats}><div className={styles.stat}><strong>{apps.length}</strong><span>แอปทั้งหมด</span></div><div className={styles.stat}><strong>{apps.filter(a=>a.ready).length}</strong><span>พร้อมทดลอง</span></div><div className={styles.stat}><strong>{apps.filter(a=>!a.ready).length}</strong><span>อยู่ในแผนพัฒนา</span></div><div className={styles.stat}><strong>{visitError?'—':Object.values(visits).reduce((n,v)=>n+v.count,0).toLocaleString('th-TH')}</strong><span>ครั้งที่เปิดใช้งานรวม</span></div></div>
 <div className={styles.toolbar}><label className={styles.field} htmlFor="app-search">ค้นหาแอป<input id="app-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อแอปหรือหัวข้อบทเรียน"/></label><label className={styles.field} htmlFor="topic-select">หมวดบทเรียน<select id="topic-select" value={topic} onChange={e=>setTopic(e.target.value)}>{topics.map(t=><option key={t}>{t}</option>)}</select></label></div>
 <div className={styles.topicTabs} aria-label="สถานะแอป"><button type="button" className={availability==='all'?`${styles.tab} ${styles.tabActive}`:styles.tab} onClick={()=>setAvailability('all')}>ทั้งหมด ({apps.length})</button><button type="button" className={availability==='ready'?`${styles.tab} ${styles.tabActive}`:styles.tab} onClick={()=>setAvailability('ready')}>พร้อมทดลอง ({apps.filter(a=>a.ready).length})</button></div>
 <p aria-live="polite">พบ {filtered.length} แอป · พร้อมทดลอง {readyApps.length} แอป</p>
 {readyApps.length>0&&<section aria-labelledby="ready-heading"><div className={styles.sectionTitle}><h2 id="ready-heading">พร้อมทดลองทันที</h2><span>{readyApps.length} แอป</span></div><div className={styles.grid}>{readyApps.map(renderCard)}</div></section>}
 {plannedApps.length>0&&<section aria-labelledby="planned-heading"><div className={styles.sectionTitle}><h2 id="planned-heading">บทเรียนที่กำลังพัฒนา</h2><span>{plannedApps.length} แอป</span></div><div className={styles.grid}>{plannedApps.map(renderCard)}</div></section>}
 {filtered.length===0&&<p className={styles.empty}>ไม่พบแอปที่ตรงกับคำค้นหา ลองเปลี่ยนหมวดหรือคำค้นหา</p>}
 <p className={styles.footnote}>แอปที่ยังไม่พร้อมเป็นรายการแผนพัฒนา · ยังไม่มีการบันทึกคะแนนหรือส่งงานในรุ่นนี้</p>
 </main>;
}
