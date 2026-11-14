'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {db} from '../lib/supabase';
import {userMessage} from '../lib/messages';
import {downloadExcel,type ExcelCell} from '../lib/excel-export';
import {assess,categories,categoryNames,settingsExample,templateItems,type Attendance,type AttendanceStatus,type Category,type Item,type Mark,type Session,type Settings} from '../lib/gradebook';
import Pagination from './Pagination';
import styles from './gradebook.module.css';

type Member={student_id:string;profiles:{full_name:string;student_id:string|null}|null};
const statusLabels:Record<AttendanceStatus,string>={present:'มาเรียน',late:'สาย',absent:'ขาด',leave:'ลา'};
const statusSymbols:Record<AttendanceStatus,string>={present:'✓',late:'ส',absent:'ข',leave:'ล'};
type NumericKey=Exclude<keyof Settings,'course_id'>;
type Draft=Record<NumericKey,string>;
const weightFields:[NumericKey,string][]=[['attendance_weight','เข้าเรียน'],['homework_weight','การบ้าน'],['project_weight','โครงงาน'],['posttest_weight','แบบทดสอบ'],['midterm_weight','กลางภาค'],['final_weight','ปลายภาค']];
const gradeFields:[NumericKey,string][]=[['grade_a','A'],['grade_bplus','B+'],['grade_b','B'],['grade_cplus','C+'],['grade_c','C'],['grade_dplus','D+'],['grade_d','D']];

function makeDraft(s:Settings|null):Draft {
 const v=s??{...settingsExample,late_credit:'',leave_credit:''};
 return Object.fromEntries(Object.entries(v).filter(([k])=>k!=='course_id'&&k!=='updated_at').map(([k,value])=>[k,String(value)])) as Draft;
}
function SettingsForm({courseId,settings,onSaved}:{courseId:number;settings:Settings|null;onSaved:(s:Settings)=>void}){
 const [draft,setDraft]=useState<Draft>(()=>makeDraft(settings));
 const [error,setError]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>setDraft(makeDraft(settings)),[settings]);
 const field=(key:NumericKey,label:string,step='0.01')=><label key={key}>{label}<input type="number" step={step} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 async function save(e:React.FormEvent){
  e.preventDefault();setError('');
  const pairs=Object.entries(draft);
  if(pairs.some(([,v])=>v.trim()===''||!Number.isFinite(Number(v)))){setError('กรอกตัวเลขให้ครบทุกช่อง รวมทั้งเกณฑ์สำหรับสายและลา');return}
  const values=Object.fromEntries(pairs.map(([k,v])=>[k,Number(v)])) as Omit<Settings,'course_id'>;
  if(!Number.isInteger(values.expected_sessions)||values.expected_sessions<1||values.expected_sessions>200){setError('จำนวนคาบต้องเป็นจำนวนเต็ม 1–200');return}
  const weights=weightFields.map(([k])=>values[k]);
  if(weights.some(n=>n<0||n>100)||Math.abs(weights.reduce((a,b)=>a+b,0)-100)>0.00001){setError('คะแนนเต็มแต่ละส่วนต้องอยู่ระหว่าง 0–100 และรวมกันเท่ากับ 100 คะแนน');return}
  if(values.late_credit<0||values.late_credit>1||values.leave_credit<0||values.leave_credit>1){setError('สัดส่วนสายและลาต้องอยู่ระหว่าง 0 ถึง 1');return}
  const thresholds=gradeFields.map(([k])=>values[k]);
  if(thresholds[0]>100||thresholds[thresholds.length-1]<0||thresholds.some((n,i)=>i>0&&n>=thresholds[i-1])){setError('เกณฑ์เกรดต้องเรียงจากมากไปน้อยระหว่าง 0 ถึง 100');return}
  setSaving(true);
  try{
   const payload={course_id:courseId,...values,updated_at:new Date().toISOString()};
   const r=await db().from('gradebook_settings').upsert(payload,{onConflict:'course_id'}).select().single();
   if(r.error)throw r.error;onSaved(r.data as Settings);
  }catch(err){setError(userMessage(err))}finally{setSaving(false)}
 }
 return <details className={styles.details} open={!settings}><summary>ตั้งเกณฑ์คะแนนและเกรด {settings?'· ตั้งแล้ว':'· ยังไม่ได้ยืนยัน'}</summary>
  <form onSubmit={save} className={styles.settings}>
   <p>ตัวเลขเริ่มต้นเป็นเพียงตัวอย่างจากแบบที่ส่งมา ตรวจสอบและปรับให้ตรงกับรายวิชาก่อนกดบันทึก ระบบจะยังไม่คำนวณเกรดจนกว่าจะกำหนดเกณฑ์ครบ</p>
   <h4>คะแนนเต็มแต่ละส่วน (รวม 100 คะแนน)</h4><div className={styles.fields}>{weightFields.map(([k,l])=>field(k,l))}</div>
   <h4>การเข้าเรียน</h4><p>นับตามจำนวนคาบเรียน ไม่รวมคาบที่ยกเลิก · มาเรียน = 1 และขาด = 0</p>
   <div className={styles.fields}>{field('expected_sessions','จำนวนคาบที่ใช้คิดคะแนน','1')}{field('late_credit','สายคิดเป็นสัดส่วน (0–1)')}{field('leave_credit','ลาคิดเป็นสัดส่วน (0–1)')}</div>
   <p>ตัวอย่าง: 1 = ได้เต็มคาบ, 0.5 = ครึ่งคาบ, 0 = ไม่ได้คะแนนคาบนั้น</p>
   <h4>คะแนนขั้นต่ำสำหรับแต่ละเกรด</h4><div className={styles.fields}>{gradeFields.map(([k,l])=>field(k,l))}</div>
   <p>เกรด F คือคะแนนที่ต่ำกว่าเกณฑ์ D และจะแสดงเมื่อข้อมูลครบเท่านั้น คะแนนรวมปัดเป็นทศนิยม 2 ตำแหน่งก่อนเทียบเกรด</p>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <button className={styles.primary} type="submit" disabled={saving}>{saving?'กำลังบันทึก…':'บันทึกเกณฑ์คะแนน'}</button>
  </form>
 </details>;
}

function ItemEditor({item,courseId,onChanged}:{item:Item;courseId:number;onChanged:()=>Promise<void>}){
 const [title,setTitle]=useState(item.title),[max,setMax]=useState(String(item.max_score)),[working,setWorking]=useState(false),[error,setError]=useState('');
 async function change(e:React.FormEvent,archive?:boolean){
  e.preventDefault();const score=Number(max),name=title.trim();setError('');
  if(!name||!Number.isFinite(score)||score<=0||score>10000){setError('กรุณากรอกชื่อและคะแนนเต็มที่ถูกต้อง');return}
  setWorking(true);
  try{
   const r=await db().from('gradebook_items').update({title:name,max_score:score,is_archived:archive??item.is_archived}).eq('course_id',courseId).eq('id',item.id).select('id').single();
   if(r.error)throw r.error;await onChanged();
  }catch(err){setError('บันทึกรายการไม่สำเร็จ: '+userMessage(err))}finally{setWorking(false)}
 }
 return <form onSubmit={e=>void change(e)} className={`${styles.itemRow} ${item.is_archived?styles.archived:''}`}>
  <span>{categoryNames[item.category]}{item.is_archived?' · เก็บไว้':''}</span>
  <label>ชื่อ<input maxLength={80} value={title} onChange={e=>setTitle(e.target.value)}/></label>
  {item.category!=='homework'&&<label>คะแนนเต็ม<input type="number" min="0.0001" max="10000" step="any" value={max} onChange={e=>setMax(e.target.value)}/></label>}
  <button type="submit" className={styles.secondary} disabled={working}>บันทึก</button>
  <button type="button" className={styles.secondary} disabled={working} onClick={e=>void change(e,!item.is_archived)}>{item.is_archived?'นำกลับมาใช้':'เก็บรายการ'}</button>
  {error&&<span className={styles.error} role="alert">{error}</span>}
 </form>;
}

export default function GradebookPanel({courseId,courseCode,refreshVersion}:{courseId:number;courseCode:string;refreshVersion:number}){
 const [sessions,setSessions]=useState<Session[]>([]),[students,setStudents]=useState<Member[]>([]),[attendance,setAttendance]=useState<Attendance[]>([]);
 const [items,setItems]=useState<Item[]>([]),[marks,setMarks]=useState<Mark[]>([]),[settings,setSettings]=useState<Settings|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[page,setPage]=useState(0),[pending,setPending]=useState<string[]>([]);
 const [category,setCategory]=useState<Category>('homework'),[title,setTitle]=useState(''),[maxScore,setMaxScore]=useState('20');
 const [drafts,setDrafts]=useState<Record<string,string>>({});const request=useRef(0);
 const refresh=useCallback(async()=>{
  const version=++request.current;setLoading(true);setError('');
  try{
   const [sessionResult,memberResult,itemResult,settingsResult]=await Promise.all([
    db().from('attendance_sessions').select('id,session_date,topic').eq('course_id',courseId).eq('is_cancelled',false).order('session_date').order('id'),
    db().from('enrollments').select('student_id,profiles!enrollments_student_id_fkey(full_name,student_id)').eq('course_id',courseId).eq('status','approved'),
    db().from('gradebook_items').select('id,course_id,category,title,max_score,position,is_archived').eq('course_id',courseId).order('position').order('id'),
    db().from('gradebook_settings').select('*').eq('course_id',courseId).maybeSingle(),
   ]);
   for(const result of [sessionResult,memberResult,itemResult,settingsResult])if(result.error)throw result.error;
   const ss=(sessionResult.data??[]) as Session[], mm=(memberResult.data??[]) as unknown as Member[];
   const ordered=(itemResult.data??[]) as Item[];
   ordered.sort((a,b)=>categories.indexOf(a.category)-categories.indexOf(b.category)||a.position-b.position||a.id-b.id);
   const aa:Attendance[]=[];const loadedMarks:Mark[]=[];
   for(let start=0;start<ss.length;start+=50){const ids=ss.slice(start,start+50).map(s=>s.id);let from=0;
    while(ids.length){const r=await db().from('attendance_records').select('session_id,student_id,status').in('session_id',ids).order('session_id').order('student_id').range(from,from+499);if(r.error)throw r.error;const batch=(r.data??[]) as Attendance[];aa.push(...batch);if(batch.length<500)break;from+=500}
   }
   for(let from=0;;from+=500){const r=await db().from('gradebook_marks').select('course_id,item_id,student_id,submitted,score').eq('course_id',courseId).order('item_id').order('student_id').range(from,from+499);if(r.error)throw r.error;const batch=(r.data??[]) as Mark[];loadedMarks.push(...batch);if(batch.length<500)break}
   if(version!==request.current)return;
   setSessions(ss);setStudents(mm.sort((a,b)=>(a.profiles?.student_id??'').localeCompare(b.profiles?.student_id??'')));setAttendance(aa);setItems(ordered);setMarks(loadedMarks);setSettings(settingsResult.data as Settings|null);setDrafts({});
  }catch(err){if(version===request.current){setError('โหลดตารางคะแนนไม่สำเร็จ: '+userMessage(err));setStudents([]);setItems([]);setMarks([]);setSessions([]);setAttendance([])}}finally{if(version===request.current)setLoading(false)}
 },[courseId]);
 useEffect(()=>{void refresh();return()=>{request.current++}},[refresh,refreshVersion]);
 useEffect(()=>setPage(0),[filter,query,courseId]);
 const attendanceMap=useMemo(()=>new Map(attendance.map(x=>[`${x.session_id}:${x.student_id}`,x])),[attendance]);
 const marksMap=useMemo(()=>new Map(marks.map(x=>[`${x.item_id}:${x.student_id}`,x])),[marks]);
 const activeItems=useMemo(()=>items.filter(item=>!item.is_archived),[items]);
 const matches=students.filter(s=>`${s.profiles?.student_id??''} ${s.profiles?.full_name??''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const safePage=Math.min(page,Math.max(0,Math.ceil(matches.length/10)-1));
 const rows=matches.slice(safePage*10,safePage*10+10);
 const shownItems=activeItems.filter(item=>filter==='all'||filter===item.category);
 const showAttendance=filter==='all'||filter==='attendance';
 const key=(itemId:number,studentId:string)=>`${itemId}:${studentId}`;
 async function writeMark(item:Item,studentId:string,patch:{submitted:boolean|null;score:number|null}|null){
  const k=key(item.id,studentId);if(pending.includes(k))return;setPending(p=>[...p,k]);setError('');setMessage('');
  try{
   if(patch){const r=await db().from('gradebook_marks').upsert({course_id:courseId,item_id:item.id,student_id:studentId,...patch},{onConflict:'item_id,student_id'}).select('course_id,item_id,student_id,submitted,score').single();if(r.error)throw r.error;
    setMarks(previous=>[...previous.filter(m=>key(m.item_id,m.student_id)!==k),r.data as Mark]);
   } else {const r=await db().from('gradebook_marks').delete().eq('course_id',courseId).eq('item_id',item.id).eq('student_id',studentId);if(r.error)throw r.error;setMarks(previous=>previous.filter(m=>key(m.item_id,m.student_id)!==k));}
   setDrafts(previous=>{const next={...previous};delete next[k];return next});setMessage('บันทึกแล้ว');
  }catch(err){setError('บันทึกไม่สำเร็จ: '+userMessage(err))}finally{setPending(p=>p.filter(x=>x!==k))}
 }
 async function commitScore(item:Item,studentId:string,value:string){
  const old=marksMap.get(key(item.id,studentId));
  if(value.trim()===''){if(old)await writeMark(item,studentId,null);return}
  const n=Number(value);if(!Number.isFinite(n)||n<0||n>Number(item.max_score)){setError(`${item.title}: คะแนนต้องอยู่ระหว่าง 0 ถึง ${item.max_score}`);return}
  if(old?.score!==null&&old?.score!==undefined&&Number(old.score)===n)return;
  await writeMark(item,studentId,{submitted:null,score:n});
 }
 async function addTemplate(){
  if(items.length||busy)return;setBusy(true);setError('');
  try{const r=await db().from('gradebook_items').insert(templateItems(courseId));if(r.error)throw r.error;await refresh();setMessage('สร้างรายการตามตัวอย่างแล้ว สามารถเพิ่มรายการสำหรับรายวิชานี้ได้')}
  catch(err){setError('สร้างรายการไม่สำเร็จ: '+userMessage(err))}finally{setBusy(false)}
 }
 async function addItem(e:React.FormEvent){
  e.preventDefault();const label=title.trim(),max=category==='homework'?1:Number(maxScore);
  if(!label||label.length>80||!Number.isFinite(max)||max<=0||max>10000){setError('กรอกชื่อรายการและคะแนนเต็มที่มากกว่า 0');return}
  setBusy(true);setError('');
  try{const r=await db().from('gradebook_items').insert({course_id:courseId,category,title:label,max_score:max,position:items.filter(i=>i.category===category).length});if(r.error)throw r.error;setTitle('');await refresh();setMessage('เพิ่มรายการแล้ว')}
  catch(err){setError('เพิ่มรายการไม่สำเร็จ: '+userMessage(err))}finally{setBusy(false)}
 }
 async function exportTable(){
  setBusy(true);setError('');
  try{
   const headers=['รหัสนักศึกษา','ชื่อ–สกุล',...sessions.map((s,i)=>`คาบ ${i+1} ${s.session_date}`),...activeItems.map(i=>`${categoryNames[i.category]}: ${i.title}${i.category==='homework'?'':` (เต็ม ${i.max_score})`}`),'คะแนนสะสม','สถานะคะแนน','เกรด'];
   const rows:ExcelCell[][]=matches.map(student=>{
    const summary=settings?assess(student.student_id,sessions,attendanceMap,activeItems,marksMap,settings):null;
    return [student.profiles?.student_id??'',student.profiles?.full_name??'',...sessions.map(s=>{const a=attendanceMap.get(`${s.id}:${student.student_id}`);return a?statusLabels[a.status]:'ยังไม่บันทึก'}),...activeItems.map(i=>{const m=marksMap.get(key(i.id,student.student_id));return !m?'ยังไม่บันทึก':i.category==='homework'?(m.submitted?'ส่งแล้ว':'ไม่ส่ง'):Number(m.score)}),summary?summary.partial:null,summary?(summary.complete?'ครบ':'ยังไม่ครบ'):'ยังไม่ตั้งเกณฑ์',summary?.grade??'ยังไม่สรุป'];
   });
   await downloadExcel(`ME-Smart-${courseCode}-gradebook.xlsx`,[{name:'ตารางคะแนน',headers,rows,metadata:[['รายวิชา',courseCode],['คำอธิบาย','เกรดแสดงเมื่อข้อมูลครบและกำหนดเกณฑ์แล้ว; คาบที่ยกเลิกไม่นำมาคิด'],['คะแนน',settings?'คะแนนสะสมคำนวณตามเกณฑ์ที่อาจารย์บันทึก':'ยังไม่ได้บันทึกเกณฑ์']]}]);
  }catch(err){setError('ส่งออกไม่สำเร็จ: '+userMessage(err))}finally{setBusy(false)}
 }
 return <section className={styles.panel} aria-label="ตารางคะแนนรายวิชา">
  <div className={styles.heading}><div><h2>ตารางคะแนนและติดตามงาน</h2><p>รายวิชา {courseCode} · เฉพาะอาจารย์ผู้สอน</p></div><div className={styles.actions}><button type="button" className={styles.secondary} onClick={()=>void refresh()} disabled={loading||pending.length>0}>↻ อัปเดต</button><button type="button" className={styles.secondary} onClick={()=>void exportTable()} disabled={busy||loading||!!error||!students.length}>ส่งออก Excel</button></div></div>
  <p>ดึงผลเช็กชื่อจากคาบเรียนอัตโนมัติ · อาจารย์บันทึกการส่งงานและคะแนนด้วยตนเอง · ระบบไม่เก็บไฟล์การบ้าน</p>
  <p className={styles.note}>✓ มาเรียน · ส สาย · ข ขาด · ล ลา · — ยังไม่บันทึก | แสดงเป็นรายคาบตามวันที่ ไม่รวมคาบที่ยกเลิก</p>
  {message&&<p className={styles.success} role="status">{message}</p>}{error&&<p className={styles.error} role="alert">{error}</p>}
  {loading?<p>กำลังโหลดตารางคะแนน…</p>:<>
   <SettingsForm courseId={courseId} settings={settings} onSaved={s=>{setSettings(s);setMessage('บันทึกเกณฑ์คะแนนแล้ว')}}/>
   <details className={styles.details}><summary>เพิ่มรายการงานและคะแนน</summary><div className={styles.settings}>
    {!items.length&&<><p>สร้างรายการเริ่มต้นตามภาพ: การบ้าน 12 ชิ้น โครงงาน 3 ส่วน แบบทดสอบ 12 ครั้ง กลางภาค และปลายภาค คะแนนเต็มของแต่ละแบบทดสอบเป็นตัวอย่าง โปรดตรวจสอบและปรับก่อนใช้งาน</p><button type="button" className={styles.secondary} disabled={busy} onClick={()=>void addTemplate()}>สร้างรายการตามแบบตัวอย่าง</button></>}
    <form onSubmit={addItem} className={styles.addItem}><label>ประเภท<select value={category} onChange={e=>setCategory(e.target.value as Category)}>{categories.map(c=><option key={c} value={c}>{categoryNames[c]}</option>)}</select></label><label>ชื่อรายการ<input value={title} maxLength={80} onChange={e=>setTitle(e.target.value)} placeholder="เช่น WS13 หรือบทที่ 9" required/></label>{category!=='homework'&&<label>คะแนนเต็ม<input type="number" min="0.0001" max="10000" step="0.0001" value={maxScore} onChange={e=>setMaxScore(e.target.value)} required/></label>}<button className={styles.primary} disabled={busy} type="submit">+ เพิ่มรายการ</button></form>
    {items.length>0&&<details><summary>แก้ไขหรือเก็บรายการ ({items.length})</summary><p>รายการที่เก็บไว้จะไม่แสดงในตารางและไม่คิดคะแนน สามารถนำกลับมาใช้ได้ โดยข้อมูลเดิมยังอยู่</p><div className={styles.itemRows}>{items.map(item=><ItemEditor key={item.id} item={item} courseId={courseId} onChanged={refresh}/>)}</div></details>}
   </div></details>
   <div className={styles.tools}><label>ค้นหานักศึกษา<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ชื่อหรือรหัส"/></label><label>แสดงคอลัมน์<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">ทั้งหมด</option><option value="attendance">การเข้าเรียน</option>{categories.map(c=><option key={c} value={c}>{categoryNames[c]}</option>)}</select></label></div>
   <p className={styles.note}>คลิก ✓ เพื่อระบุว่าส่งงานแล้ว · ใช้ “ไม่ส่ง” เมื่อยืนยันว่าไม่ส่ง · คะแนนตัวเลขจะบันทึกเมื่อออกจากช่อง ล้างช่องเพื่อลบคะแนนที่เคยบันทึก</p>
   {sessions.length>0&&settings&&sessions.length>Number(settings.expected_sessions)&&<p className={styles.error}>จำนวนคาบจริงมากกว่าจำนวนคาบที่ตั้งไว้ โปรดตรวจสอบเกณฑ์ก่อนสรุปเกรด</p>}
   <div className={styles.scroll}><table className={styles.table}><thead><tr><th className={styles.idCol}>รหัสนักศึกษา</th><th className={styles.nameCol}>ชื่อ–สกุล</th>{showAttendance&&sessions.map((s,i)=><th key={s.id} title={`${s.session_date} ${s.topic}`}>คาบ {i+1}<small>{s.session_date}</small></th>)}{shownItems.map(i=><th key={i.id}><small>{categoryNames[i.category]}</small>{i.title}<small>{i.category==='homework'?'ส่งงาน':`เต็ม ${i.max_score}`}</small></th>)}<th>คะแนนสะสม<small>เต็ม 100</small></th><th>เกรด</th></tr></thead><tbody>
    {rows.map(student=>{const summary=settings?assess(student.student_id,sessions,attendanceMap,activeItems,marksMap,settings):null;const displayName=student.profiles?.full_name??'ไม่ทราบชื่อ';return <tr key={student.student_id}><td className={styles.idCol}>{student.profiles?.student_id??'—'}</td><td className={styles.nameCol}>{displayName}</td>
     {showAttendance&&sessions.map(s=>{const a=attendanceMap.get(`${s.id}:${student.student_id}`);return <td key={s.id} title={a?statusLabels[a.status]:'ยังไม่บันทึก'} className={a?styles[a.status]:styles.unrecorded}>{a?statusSymbols[a.status]:'—'}</td>})}
     {shownItems.map(item=>{const k=key(item.id,student.student_id),mark=marksMap.get(k),disabled=pending.includes(k);return <td key={item.id}>{item.category==='homework'?<div className={styles.homework}><input aria-label={`${item.title} ${displayName} ส่งแล้ว`} type="checkbox" checked={mark?.submitted===true} disabled={disabled} onChange={e=>void writeMark(item,student.student_id,{submitted:e.target.checked,score:null})}/>{mark?mark.submitted?<span>ส่งแล้ว</span>:<span>ไม่ส่ง</span>:<button type="button" disabled={disabled} onClick={()=>void writeMark(item,student.student_id,{submitted:false,score:null})}>ไม่ส่ง</button>}</div>:<input className={styles.score} aria-label={`${item.title} ${displayName}`} type="number" min="0" max={item.max_score} step="any" disabled={disabled} value={drafts[k]??(mark?.score===null||mark?.score===undefined?'':String(mark.score))} onChange={e=>setDrafts(previous=>({...previous,[k]:e.target.value}))} onBlur={e=>void commitScore(item,student.student_id,e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/>}</td>})}
     <td>{summary?<>{summary.partial.toFixed(2)}{!summary.complete&&<small>ยังไม่ครบ</small>}</>:'ยังไม่ตั้งเกณฑ์'}</td><td>{summary?.grade??'—'}</td></tr>})}
   </tbody></table></div>
   <Pagination page={safePage} total={matches.length} onChange={setPage}/>
   {!students.length&&<p>ยังไม่มีนักศึกษาที่ได้รับอนุมัติในรายวิชานี้</p>}
  </>}
 </section>;
}
