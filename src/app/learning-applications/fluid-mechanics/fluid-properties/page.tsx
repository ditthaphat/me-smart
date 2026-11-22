'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {db} from '../../../../lib/supabase';
import {fluidTables,lookup} from '../../../../lib/fluid-property-data';
import {lookupWaterSupplement} from '../../../../lib/saturated-water-supplement';
import {gasConstants} from '../../../../lib/fluid-a1-gas-constants';
import {atmosphereAt} from '../../../../lib/fluid-a11-atmosphere';
import {phasePoints,liquidPoints} from '../../../../lib/fluid-a2-phase-points';
import {refrigerant134a,interpolateSaturated} from '../../../../lib/fluid-a4-saturated-r134a';
import {ammonia} from '../../../../lib/fluid-a5-saturated-ammonia';
import {propane} from '../../../../lib/fluid-a6-saturated-propane';
export default function FluidPropertiesCalculator(){
 const [access,setAccess]=useState<'loading'|'allowed'|'denied'>('loading');
 const [id,setId]=useState('water'),[temp,setTemp]=useState('25');
 const [a1Name,setA1Name]=useState('Air');
 const [altitude,setAltitude]=useState('0');
 const [a2Name,setA2Name]=useState('Water');
 const [r134Temp,setR134Temp]=useState('25');
 const [satFluid,setSatFluid]=useState('r134a');
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
 const fields=[{key:'rho',label:'Density ρ',unit:'kg/m³'},{key:'mu',label:'Dynamic viscosity μ',unit:'kg/(m·s)'},{key:'nu',label:'Kinematic viscosity ν',unit:'m²/s'},{key:'cp',label:'Specific heat cp',unit:'J/(kg·K)'},{key:'k',label:'Thermal conductivity k',unit:'W/(m·K)'},{key:'pr',label:'Prandtl number',unit:'–'},{key:'alpha',label:'Thermal diffusivity α',unit:'m²/s'},{key:'beta',label:'Volume expansion coefficient β',unit:'1/K'}] as const;
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
 </section><section style={{marginTop:22,padding:20,background:'white',border:'1px solid #c9dce5',borderRadius:14}}><h2>Tables A–4 to A–6 · Saturated Fluids</h2><p>แสดงค่าของ Liquid และ Vapor แยกกัน พร้อม Linear Interpolation เฉพาะภายในช่วงข้อมูลที่มี</p><label>เลือกสารอิ่มตัว<select value={satFluid} onChange={e=>setSatFluid(e.target.value)} style={{display:'block',width:'100%',padding:12,marginTop:8}}><option value="r134a">A–4 · Refrigerant-134a (−40 ถึง 100°C)</option><option value="ammonia">A–5 · Ammonia (−40 ถึง 100°C)</option><option value="propane">A–6 · Propane (−120 ถึง 90°C)</option></select></label><label>อุณหภูมิ (°C)<input type="number" step="any" value={r134Temp} onChange={e=>setR134Temp(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box',padding:12,marginTop:8}}/></label>{(()=>{const x=r134Temp.trim()===''?null:interpolateSaturated(satFluid==='ammonia'?ammonia:satFluid==='propane'?propane:refrigerant134a,Number(r134Temp));if(!x)return <p>อุณหภูมิอยู่นอกช่วงข้อมูลของสารที่เลือก (A–4: −40 ถึง 100°C; A–5: −40 ถึง 100°C; A–6: −120 ถึง 90°C)</p>;const props=[['Saturation pressure',x.psat,'kPa'],['Liquid density',x.rhoL,'kg/m³'],['Vapor density',x.rhoV,'kg/m³'],['Enthalpy of vaporization',x.hfg,'kJ/kg'],['Liquid cp',x.cpL,'J/(kg·K)'],['Vapor cp',x.cpV,'J/(kg·K)'],['Liquid conductivity',x.kL,'W/(m·K)'],['Vapor conductivity',x.kV,'W/(m·K)'],['Liquid viscosity',x.muL,'kg/(m·s)'],['Vapor viscosity',x.muV,'kg/(m·s)'],['Liquid Prandtl',x.prL,'–'],['Vapor Prandtl',x.prV,'–'],['Liquid expansion β',x.beta,'1/K'],['Surface tension σ',x.sigma,'N/m']] as const;return <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginTop:16}}>{props.map(([label,v,unit])=><div key={label} style={{padding:12,background:'#eef7f9',borderRadius:10}}><div>{label}</div><strong>{v===undefined?'—':format(v)}</strong><div>{unit}</div></div>)}</div>})()}</section><section style={{marginTop:22,padding:20,background:'white',border:'1px solid #c9dce5',borderRadius:14}}><h2>Table A–2 · Boiling and Freezing Point Properties</h2><p>จุดเดือด/จุดเยือกแข็ง ความร้อนแฝง และคุณสมบัติของเหลวที่อุณหภูมิซึ่งตารางระบุ (ไม่คาดเดาค่าที่ไม่มีในต้นฉบับ)</p><label>เลือกสาร<select value={a2Name} onChange={e=>setA2Name(e.target.value)} style={{display:'block',width:'100%',padding:12,marginTop:8}}>{phasePoints.map(x=><option key={x.name} value={x.name}>{x.name}</option>)}</select></label>{(()=>{const x=phasePoints.find(p=>p.name===a2Name);if(!x)return null;const properties=[{label:'Normal boiling / sublimation point',v:x.boilingC,unit:'°C'},{label:'Latent heat of vaporization',v:x.hfg,unit:'kJ/kg'},{label:'Freezing point',v:x.freezingC,unit:'°C'},{label:'Latent heat of fusion',v:x.hif,unit:'kJ/kg'}];return <><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12,marginTop:16}}>{properties.map(p=><div key={p.label} style={{padding:12,background:'#eef7f9',borderRadius:10}}><div>{p.label}</div><strong>{p.v===null?'—':p.v}</strong><div>{p.unit}</div></div>)}</div>{x.note&&<p>{x.note}</p>}<h3>Liquid properties at specified temperatures</h3><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th>Temperature (°C)</th><th>Density (kg/m³)</th><th>cp (kJ/kg·K)</th></tr></thead><tbody>{liquidPoints.filter(p=>p.name===a2Name).map(p=><tr key={p.t}><td>{p.t}</td><td>{p.rho}</td><td>{p.cp}</td></tr>)}</tbody></table></div></>})()}</section><section style={{marginTop:22,padding:20,background:'white',border:'1px solid #c9dce5',borderRadius:14}}><h2>Table A–11 · Atmosphere at High Altitude</h2><p>ข้อมูลต้นฉบับ 43 แถว ช่วงความสูง 0–18,000 m; ใช้ Interpolation ระหว่างแถว ไม่คำนวณนอกช่วง</p><label>ความสูง (m)<input type="number" value={altitude} onChange={e=>setAltitude(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box',padding:12,marginTop:8}} /></label>{(()=>{const a=altitude.trim()===''?null:atmosphereAt(Number(altitude));if(!a)return <p>กรุณาระบุความสูงระหว่าง 0–18,000 m</p>;return <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12,marginTop:16}}>{([{label:'Temperature',v:a.t,unit:'°C'},{label:'Pressure',v:a.p,unit:'kPa'},{label:'Gravity',v:a.g,unit:'m/s²'},{label:'Speed of sound',v:a.a,unit:'m/s'},{label:'Density',v:a.rho,unit:'kg/m³'},{label:'Dynamic viscosity',v:a.mu,unit:'kg/(m·s)'},{label:'Thermal conductivity',v:a.k,unit:'W/(m·K)'}]).map(x=><div key={x.label} style={{padding:12,background:'#eef7f9',borderRadius:10}}><div>{x.label}</div><strong>{x.v.toPrecision(6)}</strong><div>{x.unit}</div></div>)}</div>})()}<p style={{fontSize:12}}>หมายเหตุ: ค่า g ที่ 5,800 m ในต้นฉบับพิมพ์ 9.785 m/s² ซึ่งไม่เป็นไปตามแนวโน้มของแถวข้างเคียง จึงคงค่าเดิมไว้เพื่อให้ตรวจสอบกับต้นฉบับได้</p></section><section style={{marginTop:22,padding:20,background:'white',border:'1px solid #c9dce5',borderRadius:14}}><h2>Table A–1 · Gas Constants and Ideal-Gas Specific Heats</h2><p>ค่าความร้อนจำเพาะอ้างอิงที่ 25°C ไม่ใช้ Interpolation ตามอุณหภูมิ</p><label>เลือกสาร <select value={a1Name} onChange={e=>setA1Name(e.target.value)} style={{display:'block',padding:12,width:'100%',marginTop:8}}>{gasConstants.map(g=><option key={g.name} value={g.name}>{g.name}</option>)}</select></label>{(()=>{const g=gasConstants.find(x=>x.name===a1Name);if(!g)return null;return <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginTop:18}}>{([{label:'Molar mass M',value:g.M,unit:'kg/kmol'},{label:'Gas constant R',value:g.R,unit:'kJ/(kg·K)'},{label:'Specific heat cp',value:g.cp,unit:'kJ/(kg·K)'},{label:'Specific heat cv',value:g.cv,unit:'kJ/(kg·K)'},{label:'Heat capacity ratio k',value:g.kappa,unit:'–'}]).map(x=><div key={x.label} style={{padding:14,background:'#eef7f9',borderRadius:10}}><div>{x.label}</div><strong>{x.value}</strong><div>{x.unit}</div></div>)}</div>})()}</section><section style={{marginTop:22,padding:20,background:'white',border:'1px solid #c9dce5',borderRadius:14}}><h2>สารบัญตารางสมบัติของไหล A–1 ถึง A–11</h2><p>แสดงเฉพาะตารางสมบัติของไหล ไม่รวม Moody Chart และตารางการไหลอัดตัวได้ เครื่องคำนวณด้านบนยังรองรับข้อมูลเชิงตัวเลขเฉพาะบางตารางเท่านั้น ตารางอื่นต้องตรวจสอบและนำเข้าข้อมูลก่อนเปิดใช้คำนวณ</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:10}}>{catalog.map(([id,title,page,thai])=><div key={id} style={{border:'1px solid #d9e4ec',borderRadius:10,padding:12}}><strong>{id} · หน้า {page}</strong><div>{title}</div><small>{thai}</small><div style={{fontSize:12,color:'#6c7d8a'}}>{['A–3','A–7','A–9','A–10'].includes(id)?'มีข้อมูลคำนวณบางช่วง':'ยังไม่มีข้อมูลคำนวณที่ตรวจสอบแล้ว'}</div></div>)}</div></section></main>;
}
