'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {db} from '../../../../lib/supabase';
import {fluidTables,lookup} from '../../../../lib/fluid-property-data';
import {lookupWaterSupplement} from '../../../../lib/saturated-water-supplement';
export default function FluidPropertiesCalculator(){
 const [access,setAccess]=useState<'loading'|'allowed'|'denied'>('loading');
 const [id,setId]=useState('water'),[temp,setTemp]=useState('25');
 const table=fluidTables.find(t=>t.id===id)!;
 const temperature=Number(temp);
 const waterExtra=id==='water'&&temp.trim()!==''?lookupWaterSupplement(temperature):null;
 const result=useMemo(()=>temp.trim()===''?null:lookup(table.rows,temperature),[table,temperature,temp]);
 useEffect(()=>{let active=true;(async()=>{
 const {data:{user}}=await db().auth.getUser();
 if(!user){if(active)setAccess('denied');return;}
 const {data:profile,error}=await db().from('profiles').select('role').eq('id',user.id).single();
 if(error||!profile){if(active)setAccess('denied');return;}
 if(profile.role==='teacher'){if(active)setAccess('allowed');return;}
 if(profile.role!=='student'){if(active)setAccess('denied');return;}
 const {data:courses,error:courseError}=await db().rpc('my_courses');
 if(active)setAccess(!courseError&&(courses??[]).some((c:{code:string;status?:string})=>c.code==='4112203'&&c.status==='approved')?'allowed':'denied');
 })().catch(()=>{if(active)setAccess('denied')});return()=>{active=false}},[]);
 useEffect(()=>{if(access!=='allowed')return;void db().rpc('record_learning_app_visit',{p_app_id:'fluid-properties'}).then(({error})=>{if(error)console.warn('Visit tracking unavailable',error.message)});},[access]);
 if(access==='loading')return <main style={{padding:32}}>กำลังตรวจสอบสิทธิ์...</main>;
 if(access==='denied')return <main style={{padding:32}}><h1>Fluid Properties</h1><p>เฉพาะอาจารย์และนักศึกษาที่ได้รับอนุมัติรายวิชา 4112203</p><Link href="/">กลับสู่ ME-SMART</Link></main>;
 const catalog=[
 ['A–1','Molar mass, gas constant and ideal-gas specific heats','948','ค่าคงที่ของสาร'],
 ['A–2','Boiling and freezing point properties','949','จุดเดือดและจุดเยือกแข็ง'],
 ['A–3','Properties of saturated water','950','น้ำอิ่มตัว'],
 ['A–4','Properties of saturated refrigerant-134a','951','สารทำความเย็น R-134a'],
 ['A–5','Properties of saturated ammonia','952','แอมโมเนียอิ่มตัว'],
 ['A–6','Properties of saturated propane','953','โพรเพนอิ่มตัว'],
 ['A–7','Properties of liquids','954','ของเหลว'],
 ['A–8','Properties of liquid metals','955','โลหะเหลว'],
 ['A–9','Properties of air at 1 atm pressure','956','อากาศที่ 1 atm'],
 ['A–10','Properties of gases at 1 atm pressure','957–958','ก๊าซที่ 1 atm'],
 ['A–11','Properties of atmosphere at high altitude','959','บรรยากาศที่ระดับสูง'],

 ];
 const waterAdditional=[
 {label:'Saturation pressure Psat',unit:'kPa',key:'psat'},
 {label:'Vapor density ρg',unit:'kg/m³',key:'rhoV'},
 {label:'Enthalpy of vaporization hfg',unit:'kJ/kg',key:'hfg'},
 {label:'Vapor specific heat cp,g',unit:'J/(kg·K)',key:'cpV'},
 {label:'Vapor conductivity kg',unit:'W/(m·K)',key:'kV'},
 {label:'Vapor viscosity μg',unit:'kg/(m·s)',key:'muV'},
 {label:'Vapor Prandtl number Prg',unit:'–',key:'prV'},
 {label:'Liquid expansion coefficient β',unit:'1/K',key:'beta'},
 {label:'Surface tension σ',unit:'N/m',key:'sigma'}
 ] as const;
 const fields=[{key:'rho',label:'Density ρ',unit:'kg/m³'},{key:'mu',label:'Dynamic viscosity μ',unit:'kg/(m·s)'},{key:'nu',label:'Kinematic viscosity ν',unit:'m²/s'},{key:'cp',label:'Specific heat cp',unit:'J/(kg·K)'},{key:'k',label:'Thermal conductivity k',unit:'W/(m·K)'},{key:'pr',label:'Prandtl number',unit:'–'}] as const;
 const format=(n:number)=>Math.abs(n)<.001&&n!==0?n.toExponential(5):Number(n.toPrecision(7)).toString();
 return <main style={{maxWidth:1000,margin:'0 auto',padding:24,fontFamily:'system-ui,sans-serif',color:'#173b53'}}>
 <Link href="/learning-applications">← กลับสู่ Learning Hub</Link>
 <header style={{margin:'20px 0',padding:26,borderRadius:18,background:'linear-gradient(110deg,#133b60,#11848b)',color:'white'}}>
 <small>ME-SMART · 4112203 Fluid Mechanics · A3-FULL-COLUMNS-20261122</small><h1>Fluid Properties Calculator</h1><p>ตรวจคำตอบจากตารางคุณสมบัติของไหลที่ใช้สอน พร้อมแสดง Linear Interpolation</p></header>
 <section style={{padding:20,border:'1px solid #c9dce5',borderRadius:14,background:'#fff'}}>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:18}}>
 <label>เลือกของไหล / ตาราง<select value={id} onChange={e=>{setId(e.target.value);setTemp('')}} style={{display:'block',width:'100%',padding:12,marginTop:7}}>{fluidTables.map(t=><option value={t.id} key={t.id}>{t.name} — {t.table}</option>)}</select></label>
 <label>อุณหภูมิ (°C)<input type="number" value={temp} onChange={e=>setTemp(e.target.value)} step="any" style={{display:'block',width:'100%',boxSizing:'border-box',padding:12,marginTop:7}}/></label></div>
 <p><strong>อ้างอิง:</strong> {table.table} · {table.condition}</p><p style={{color:'#5d7080'}}>ช่วงข้อมูลที่ตรวจสอบแล้ว: {table.rows[0].t} ถึง {table.rows[table.rows.length-1].t} °C ({table.rows.length} แถว)</p>
 {!result?<p role="alert" style={{color:'#a04127'}}>กรุณาระบุอุณหภูมิภายในช่วงข้อมูลที่ตรวจสอบแล้ว แอปไม่คำนวณนอกช่วงตาราง</p>:<>
 <p style={{color:'#0a6e70',fontWeight:700}}>{result.interpolated?'คำนวณด้วย Linear Interpolation':'อ่านค่าตรงจากแถวตาราง'}</p>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12}}>
 {fields.map(f=>{const v=result.row[f.key];return v===undefined?null:<div key={f.key} style={{padding:14,background:'#eef7f9',borderRadius:10}}><div>{f.label}</div><strong style={{fontSize:21}}>{format(v)}</strong><div style={{fontSize:12}}>{f.unit}</div></div>})}</div>
 {result.interpolated&&<div style={{marginTop:18,padding:16,background:'#f3f5f8',borderRadius:12}}><strong>วิธีคำนวณ</strong><p>ใช้แถวที่ T₁ = {result.lower.t} °C และ T₂ = {result.upper.t} °C</p><p>X(T) = X₁ + [(T − T₁)/(T₂ − T₁)] × (X₂ − X₁)</p><p>ตัวอย่าง Density: {format(result.lower.rho)} + [({temperature} − {result.lower.t})/({result.upper.t} − {result.lower.t})] × ({format(result.upper.rho)} − {format(result.lower.rho)}) = <strong>{format(result.row.rho)} kg/m³</strong></p></div>}
 </>}
 <p style={{fontSize:13,color:'#687d8d',marginTop:18}}>หมายเหตุ: ขณะนี้เป็นข้อมูลที่ถอดและตรวจสอบเฉพาะบางแถวจาก PDF ต้นฉบับ ยังไม่ครอบคลุมทุกสารและทุกอุณหภูมิ ค่า ν จะแสดงเฉพาะเมื่อมีข้อมูลในตารางนั้น ไม่ใช้ค่าคำนวณแทนโดยไม่ระบุ</p>
 {id==='water'&&<section style={{marginTop:18,padding:16,background:'#fff8e9',borderRadius:12}}><strong>คอลัมน์เพิ่มเติมจากตาราง A–3</strong><p>ต้นฉบับมีค่า Psat, ρg, hfg, cp,g, kg, μg, Prg, β และ σ ด้วย แสดงค่าตามตารางต้นฉบับและคำนวณ Interpolation เมื่อมีข้อมูลสองแถวรองรับ; ช่องว่างในต้นฉบับจะไม่ถูกเติมด้วยค่าคาดเดา</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:8}}>{waterAdditional.map(f=><div key={f.key} style={{padding:10,border:'1px solid #e8d5a5',borderRadius:8}}><strong>{f.label}</strong><div>{waterExtra?.[f.key]===undefined?'ไม่มีข้อมูลในแถวต้นฉบับ':format(waterExtra[f.key]!)} {f.unit}</div></div>)}</div></section>}
 </section><section style={{marginTop:22,padding:20,background:'white',border:'1px solid #c9dce5',borderRadius:14}}><h2>สารบัญตารางสมบัติของไหล A–1 ถึง A–11</h2><p>แสดงเฉพาะตารางสมบัติของไหล ไม่รวม Moody Chart และตารางการไหลอัดตัวได้ เครื่องคำนวณด้านบนยังรองรับข้อมูลเชิงตัวเลขเฉพาะบางตารางเท่านั้น ตารางอื่นต้องตรวจสอบและนำเข้าข้อมูลก่อนเปิดใช้คำนวณ</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:10}}>{catalog.map(([id,title,page,thai])=><div key={id} style={{border:'1px solid #d9e4ec',borderRadius:10,padding:12}}><strong>{id} · หน้า {page}</strong><div>{title}</div><small>{thai}</small><div style={{fontSize:12,color:'#6c7d8a'}}>{['A–3','A–7','A–9','A–10'].includes(id)?'มีข้อมูลคำนวณบางช่วง':'ยังไม่มีข้อมูลคำนวณที่ตรวจสอบแล้ว'}</div></div>)}</div></section></main>;
}
