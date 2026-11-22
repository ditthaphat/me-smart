'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db } from '../../lib/supabase';

export default function LearningApplications() {
  const [auth, setAuth] = useState<'loading'|'allowed'|'denied'>('loading');
  const [u, setU] = useState(0.4);
  const [hmm, setHmm] = useState(1);
  const [mu, setMu] = useState(0.1);
  const [dp, setDp] = useState(100);
  const h = hmm / 1000, L = 0.1;
  useEffect(() => {
    let active = true;
    db().auth.getUser().then(({data}) => { if(active) setAuth(data.user ? 'allowed':'denied'); })
      .catch(() => {if(active) setAuth('denied');});
    return () => {active = false;};
  }, []);
  const profile = useMemo(() => Array.from({length:41},(_,i) => {
    const z = i/40;
    return {z, velocity: u*z + dp*h*h*z*(1-z)/(2*mu*L)};
  }),[u,dp,h,mu]);
  const q = u*h/2 + dp*h*h*h/(12*mu*L);
  const tauBottom = mu*u/h + dp*h/(2*L);
  const tauTop = mu*u/h - dp*h/(2*L);
  const minV = Math.min(0,...profile.map(p=>p.velocity));
  const maxV = Math.max(0,...profile.map(p=>p.velocity));
  const x = (v:number) => 80 + (v-minV)/(maxV-minV || 1)*520;
  const y = (z:number) => 290-z*240;
  const curve = profile.map((p,i)=>`${i?'L':'M'} ${x(p.velocity).toFixed(2)} ${y(p.z).toFixed(2)}`).join(' ');
  if(auth==='loading') return <main style={{padding:32}}>กำลังตรวจสอบสิทธิ์ผู้ใช้งาน...</main>;
  if(auth==='denied') return <main style={{padding:32}}><h1>Learning Applications</h1><p>กรุณาเข้าสู่ระบบ ME-SMART ก่อนใช้งาน</p><Link href="/">เข้าสู่ระบบ</Link></main>;
  return <main style={{maxWidth:1050,margin:'0 auto',padding:'24px 18px',fontFamily:'system-ui, sans-serif',color:'#14263d'}}>
    <Link href="/">← กลับสู่ ME-SMART</Link>
    <h1>Learning Applications | แอปพลิเคชันเสริมการเรียนรู้</h1>
    <p>Fluid Mechanics · Virtual Laboratory</p>
    <section style={{border:'1px solid #d8e3ef',borderRadius:16,padding:20,background:'#fff'}}>
      <h2>Couette–Poiseuille Flow</h2>
      <p>การไหลระหว่างแผ่นขนาน: แผ่นล่างหยุดนิ่ง แผ่นบนเคลื่อนที่ และมีความดันตกคร่อมตามแนวการไหล</p>
      <p><strong>u(y) = Uy/h + (ΔP/2μL)y(h−y)</strong></p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16}}>
        {([
          ['ความเร็วแผ่นบน U (m/s)',u,setU,0,1,0.05],
          ['ช่องว่าง h (mm)',hmm,setHmm,0.5,3,0.1],
          ['ความหนืด μ (Pa·s)',mu,setMu,0.02,0.5,0.01],
          ['ความดันตกคร่อม ΔP (Pa)',dp,setDp,-10000,10000,100],
        ] as const).map(([label,value,set,min,max,step])=><label key={label} style={{display:'grid',gap:8}}>
          <span>{label}: <strong>{value}</strong></span>
          <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e=>set(Number(e.target.value))}/>
        </label>)}
      </div>
      <svg role="img" aria-label="กราฟความเร็วเทียบตำแหน่งระหว่างแผ่นขนาน" viewBox="0 0 700 350" style={{width:'100%',maxHeight:420,marginTop:20,background:'#f4f9fd',borderRadius:12}}>
        <line x1="80" y1="50" x2="80" y2="290" stroke="#94a3b8" strokeWidth="2"/>
        <line x1="80" y1="290" x2="620" y2="290" stroke="#94a3b8" strokeWidth="2"/>
        <line x1={x(0)} y1="50" x2={x(0)} y2="290" stroke="#94a3b8" strokeDasharray="5 5"/>
        <path d={curve} stroke="#0875b7" strokeWidth="4" fill="none"/>
        <text x="16" y="35" fontSize="15">y/h</text><text x="550" y="328" fontSize="15">u (m/s)</text>
        <text x="42" y="55" fontSize="14">1</text><text x="42" y="294" fontSize="14">0</text>
        <text x="80" y="315" fontSize="13">{minV.toFixed(3)}</text><text x="570" y="315" fontSize="13">{maxV.toFixed(3)}</text>
      </svg>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
        <p><strong>Q ต่อความกว้าง</strong><br/>{q.toExponential(4)} m²/s</p>
        <p><strong>แรงเฉือนผนังล่าง</strong><br/>{tauBottom.toFixed(3)} Pa</p>
        <p><strong>แรงเฉือนผนังบน</strong><br/>{tauTop.toFixed(3)} Pa</p>
      </div>
      <button type="button" onClick={()=>{setU(0.4);setHmm(1);setMu(0.1);setDp(100)}} style={{padding:'10px 18px',borderRadius:8,border:'1px solid #b5c9dc',background:'#e8f3fa',cursor:'pointer'}}>คืนค่าเริ่มต้น</button>
      <p style={{fontSize:13,color:'#52657b'}}>สมมติฐาน: steady, incompressible, Newtonian, fully developed, parallel plates, constant viscosity; L = 0.1 m. ผลลัพธ์เป็นแบบจำลองเชิงวิเคราะห์สำหรับการศึกษา ไม่ใช่ผล CFD</p>
    </section>
  </main>;
}
