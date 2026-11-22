'use client';
import {useState} from 'react';

const G=9.81;
const liquids=[
 {name:'Water · น้ำ',rho:997,color:'#7cc9e9'},
 {name:'Mercury · ปรอท',rho:13546,color:'#9d9bb5'},
 {name:'Oil · น้ำมัน',rho:850,color:'#e6bd69'},
 {name:'Glycerin · กลีเซอริน',rho:1260,color:'#9ad2a5'},
 {name:'Seawater · น้ำทะเล',rho:1035,color:'#4a9dbf'},
 {name:'Custom · กำหนดเอง',rho:1100,color:'#bda3d9'}
];
type Column={fluid:string;rho:number;left:number;right:number};
const fmt=(n:number)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:5}):'—';
const fieldStyle={width:'100%',padding:9,border:'1px solid #a6c3d0',borderRadius:7,fontSize:15} as const;
const fluid=(name:string)=>liquids.find(f=>f.name===name)??liquids[0];
export default function MultiUManometer(){
 const [count,setCount]=useState(2);
 const [carrier,setCarrier]=useState(liquids[0].name);
 const [rhoCarrier,setRhoCarrier]=useState(997);
 const [pA,setPA]=useState(200);
 const [top,setTop]=useState(1.5);
 const [columns,setColumns]=useState<Column[]>(Array.from({length:4},(_,i)=>({fluid:i%2===0?liquids[1].name:liquids[3].name,rho:i%2===0?13546:1260,left:0.55,right:0.85})));
 const [answer,setAnswer]=useState('');
 const [show,setShow]=useState(false);
 const selected=columns.slice(0,count);
 const terms=selected.map(c=>(c.rho-rhoCarrier)*G*(c.left-c.right)/1000);
 const pB=pA+terms.reduce((a,b)=>a+b,0);
 const valid=[top,rhoCarrier,pA,...selected.flatMap(c=>[c.rho,c.left,c.right])].every(Number.isFinite)&&top>0&&rhoCarrier>0&&pA>=0&&pB>=0&&selected.every(c=>c.rho>rhoCarrier&&c.left>=0&&c.right>=0&&c.left<=top&&c.right<=top);
 const err=answer.trim()!==''&&Number.isFinite(Number(answer))&&valid?100*Math.abs(Number(answer)-pB)/Math.max(1,Math.abs(pB)):null;
 const edit=(i:number,patch:Partial<Column>)=>setColumns(old=>old.map((c,j)=>i===j?{...c,...patch}:c));
 const changeFluid=(i:number,name:string)=>{const f=fluid(name);edit(i,{fluid:name,rho:f.rho})};
 const W=125+count*182, H=350;
 const y=(height:number)=>216-(height/top)*155;
 const tube=(i:number)=>{const x=72+i*182, x2=x+118, bottom=282, leftY=y(selected[i].left),rightY=y(selected[i].right);const heavy=fluid(selected[i].fluid).color,upper=fluid(carrier).color;
  return <g key={i}>
   <path d={`M${x} 55 V${bottom-66} C${x} ${bottom+24} ${x2} ${bottom+24} ${x2} ${bottom-66} V55`} fill="none" stroke="#426c82" strokeWidth="26" strokeLinejoin="round" strokeLinecap="butt"/>
   <path d={`M${x} 55 V${bottom-66} C${x} ${bottom+24} ${x2} ${bottom+24} ${x2} ${bottom-66} V55`} fill="none" stroke="#f4f9fc" strokeWidth="18"/>
   <path d={`M${x} ${leftY} V${bottom-66} C${x} ${bottom+24} ${x2} ${bottom+24} ${x2} ${bottom-66} V${rightY}`} fill="none" stroke={heavy} strokeWidth="18"/>
   <path d={`M${x} 55 V${leftY}`} stroke={upper} strokeWidth="18"/>
   <path d={`M${x2} ${rightY} V55`} stroke={upper} strokeWidth="18"/>
   <line x1={x-23} x2={x+15} y1={leftY} y2={leftY} stroke="#233e56" strokeWidth="1.5" strokeDasharray="3 2"/>
   <line x1={x2-15} x2={x2+23} y1={rightY} y2={rightY} stroke="#233e56" strokeWidth="1.5" strokeDasharray="3 2"/>
   <text x={x+58} y="310" fontSize="13" textAnchor="middle" fill="#173f55">U{i+1}: {selected[i].fluid.split(' · ')[0]}</text>
   <text x={x-6} y={Math.max(18,leftY-8)} fontSize="11" textAnchor="middle" fill="#173f55">{fmt(selected[i].left)} m</text>
   <text x={x2+5} y={Math.max(18,rightY-8)} fontSize="11" fill="#173f55">{fmt(selected[i].right)} m</text>
   {i<count-1&&<><path d={`M${x2} 55 H${x+182}`} stroke="#426c82" strokeWidth="26"/><path d={`M${x2} 55 H${x+182}`} stroke={upper} strokeWidth="18"/></>}
  </g>;
 };
 return <section style={{border:'1px solid #c7dce7',borderRadius:15,padding:20,background:'white',marginTop:16,color:'#123c54'}}>
 <h2>6. Multi U-tube Manometer · แมนอมิเตอร์หลายชุด U</h2>
 <p>แบบจำลองท่อ U ต่ออนุกรมตามหลักใน Chapter 3 (แนวคิดจาก Figure P3–44): ของไหลหลักชนิดเดียวไหลผ่านส่วนเชื่อมด้านบน และแต่ละ U มีของไหลแมนอมิเตอร์ที่หนักกว่า พร้อมรอยต่อของไหลสองด้านที่ปรับระดับได้</p>
 <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
 <label style={{flex:'1 1 140px'}}>จำนวน U<select style={fieldStyle} value={count} onChange={e=>{setCount(Number(e.target.value));setAnswer('')}}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} U</option>)}</select></label>
 <label style={{flex:'1 1 180px'}}>ของไหลหลักในท่อเชื่อม<select style={fieldStyle} value={carrier} onChange={e=>{const f=fluid(e.target.value);setCarrier(f.name);setRhoCarrier(f.rho)}}>{liquids.map(f=><option key={f.name} value={f.name}>{f.name}</option>)}</select></label>
 <label style={{flex:'1 1 140px'}}>ρ หลัก (kg/m³)<input style={fieldStyle} type="number" step="any" min="0" value={rhoCarrier} onChange={e=>setRhoCarrier(Number(e.target.value))}/></label>
 <label style={{flex:'1 1 140px'}}>P_A (kPa abs)<input style={fieldStyle} type="number" step="any" min="0" value={pA} onChange={e=>setPA(Number(e.target.value))}/></label>
 <label style={{flex:'1 1 140px'}}>ระดับท่อบน H (m)<input style={fieldStyle} type="number" step="any" min="0.01" value={top} onChange={e=>setTop(Number(e.target.value))}/></label>
 </div>
 <div style={{display:'flex',flexWrap:'wrap',gap:14,marginTop:15}}>
 {selected.map((c,i)=><div key={i} style={{flex:'1 1 260px',padding:14,border:'1px solid #d2e2e9',borderRadius:10,background:'#f2f8fb'}}><strong>U{i+1} · ของไหลและระดับรอยต่อ</strong><label style={{display:'block',marginTop:8}}>ของไหลใน U<select style={fieldStyle} value={c.fluid} onChange={e=>changeFluid(i,e.target.value)}>{liquids.map(f=><option key={f.name} value={f.name}>{f.name}</option>)}</select></label><label style={{display:'block',marginTop:8}}>ρ ใน U (kg/m³)<input style={fieldStyle} type="number" step="any" min="0" value={c.rho} onChange={e=>edit(i,{rho:Number(e.target.value)})}/></label><label style={{display:'block',marginTop:8}}>ระดับรอยต่อซ้าย zL (m)<input style={fieldStyle} type="number" step="any" min="0" value={c.left} onChange={e=>edit(i,{left:Number(e.target.value)})}/></label><label style={{display:'block',marginTop:8}}>ระดับรอยต่อขวา zR (m)<input style={fieldStyle} type="number" step="any" min="0" value={c.right} onChange={e=>edit(i,{right:Number(e.target.value)})}/></label><small>ΔP = {valid?fmt(terms[i]):'—'} kPa</small></div>)}
 </div>
 <div style={{overflowX:'auto',marginTop:18,padding:12,background:'#f8fcfd',borderRadius:12}}>
 <svg viewBox={`0 0 ${W} ${H}`} style={{display:'block',width:'100%',minWidth:Math.max(450,W),maxWidth:1000}} role="img" aria-label={`ภาพท่อ U ${count} ชุดต่อเนื่องกัน แสดงของไหลและระดับรอยต่อซ้ายขวาตามข้อมูลที่กรอก`}>
 {selected.map((_,i)=>tube(i))}
 <path d="M18 55 H72" stroke="#426c82" strokeWidth="26"/><path d="M18 55 H72" stroke={fluid(carrier).color} strokeWidth="18"/><path d={`M${72+(count-1)*182+118} 55 H${W-18}`} stroke="#426c82" strokeWidth="26"/><path d={`M${72+(count-1)*182+118} 55 H${W-18}`} stroke={fluid(carrier).color} strokeWidth="18"/><text x="12" y="26" fontSize="16" fontWeight="bold">A</text><text x={W-26} y="26" fontSize="16" fontWeight="bold">B</text>
 <text x="15" y="328" fontSize="12">z = 0 ที่ระดับเริ่มโค้ง (เส้นอ้างอิงแนวดิ่ง) · ระดับรอยต่อแสดงตามสัดส่วน H</text>
 </svg></div>
 <p style={{fontSize:13}}>ปลาย A และ B เป็นจุดต่อท่อที่ระดับเดียวกัน; เส้นสีด้านบนคือของไหลหลัก ส่วนโค้งแต่ละ U เป็นของไหลที่เลือก · ภาพแสดงระดับรอยต่อของไหลตามค่าที่ป้อนจริงบนแกนความสูงร่วมกัน สีแยกชนิดของไหล แต่ไม่ได้คำนวณการเคลื่อนตัวของผิวรอยต่อจากปริมาตรท่อ หากค่าความดันที่กำหนดไม่สอดคล้องกับสมดุล ระบบจะคำนวณ P_B ที่ต้องเป็นเพื่อให้สมดุล</p>
 {!valid&&<p role="alert" style={{color:'#b42318',fontWeight:700}}>ตรวจสอบข้อมูล: ต้องมี ρ ของไหลในแต่ละ U มากกว่า ρ ของไหลหลัก, 0 ≤ zL,zR ≤ H และ P_B ต้องไม่ติดลบ</p>}
 <div style={{background:'#eaf5f8',padding:16,borderRadius:10,marginTop:16}}><strong>คำนวณความดันที่ B</strong><p style={{fontSize:23,fontWeight:700}}>{valid?fmt(pB):'—'} kPa abs</p><p>P_B = P_A + Σ[(ρ_U − ρ_main)g(zL − zR)]/1000</p><label style={{display:'block'}}>คำตอบของนักศึกษา (kPa abs)<input style={fieldStyle} type="number" step="any" value={answer} onChange={e=>setAnswer(e.target.value)}/></label>{err!==null&&<p style={{color:err<=1?'#087852':'#b45309'}}>คลาดเคลื่อน {fmt(err)}% · {err<=1?'ผ่านเกณฑ์ ±1%':'โปรดตรวจทิศทางและหน่วย'}</p>}<button type="button" onClick={()=>setShow(v=>!v)} style={{padding:'10px 16px',marginTop:10,background:'#0c6c7d',color:'white',border:0,borderRadius:8,cursor:'pointer'}}>{show?'ซ่อนวิธีทำ':'แสดงวิธีทำทีละขั้น'}</button>{show&&valid&&<div style={{marginTop:12}}>{selected.map((c,i)=><p key={i}>U{i+1}: ({fmt(c.rho)} − {fmt(rhoCarrier)}) × 9.81 × ({fmt(c.left)} − {fmt(c.right)}) / 1000 = {fmt(terms[i])} kPa</p>)}<p>P_B = {fmt(pA)} + ({terms.map(t=>fmt(t)).join(' + ')}) = {fmt(pB)} kPa abs</p></div>}</div>
 <p style={{fontSize:13,marginTop:15}}>ข้อจำกัด: แบบจำลองนี้รองรับของไหลหลักชนิดเดียวในท่อเชื่อมและของไหลหนักหนึ่งชนิดต่อ U, จุด A และ B อยู่ระดับเดียวกัน ไม่รองรับอากาศหรือของไหลเบาที่อยู่แยกเป็นชั้นบนสะพานเชื่อมหลายชนิดแบบ Figure P3–44 อย่างครบถ้วน และไม่รวม capillarity · อ้างอิง Çengel &amp; Cimbala (2020), Chapter 3, Figure P3–44</p>
 </section>;
}
