'use client';

import {useEffect,useState} from 'react';
import {db} from '../lib/supabase';
import {assess,categories,categoryNames} from '../lib/gradebook';
import type {Attendance,Item,Mark,Session,Settings} from '../lib/gradebook';
import styles from './student-gradebook.module.css';

type Course = {id:number;code:string;title:string;term:string};
type Gradebook = {sessions:Session[];attendance:Attendance[];items:Item[];marks:Mark[];settings:Settings|null};
type PageResult = {data:unknown;error:unknown};
const attendanceLabels:Record<string,string>={present:'มาเรียน',late:'สาย',absent:'ขาด',leave:'ลา'};

async function readPages<T>(getPage:(from:number,to:number)=>PromiseLike<PageResult>):Promise<T[]> {
 const rows:T[]=[];
 for(let from=0;;from+=500){
  const result=await getPage(from,from+499);
  if(result.error)throw result.error;
  const batch=(result.data??[]) as T[];
  rows.push(...batch);
  if(batch.length<500)return rows;
 }
}
function message(error:unknown){
 return (error as {message?:string}|null)?.message || 'กรุณาลองอีกครั้ง';
}
function score(value:number){return Number(value).toFixed(2);}

export default function StudentGradebook({course,userId}:{course:Course;userId:string}){
 const [data,setData]=useState<Gradebook|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [refresh,setRefresh]=useState(0);
 const courseId=course.id;

 useEffect(()=>{
  let active=true;
  setLoading(true);setError('');setData(null);
  void (async()=>{
   try{
    const membership=await db().from('enrollments').select('course_id')
      .eq('course_id',courseId).eq('student_id',userId).eq('status','approved').maybeSingle();
    if(membership.error)throw membership.error;
    if(!membership.data)throw Error('ไม่พบสิทธิ์เข้าร่วมรายวิชานี้ กรุณาติดต่ออาจารย์');
    const [settingsResult,sessions,items,marks]=await Promise.all([
     db().from('gradebook_settings').select('*').eq('course_id',courseId).maybeSingle(),
     readPages<Session>((from,to)=>db().from('attendance_sessions').select('id,session_date,topic')
      .eq('course_id',courseId).eq('is_cancelled',false).order('session_date').order('id').range(from,to)),
     readPages<Item>((from,to)=>db().from('gradebook_items').select('id,course_id,category,title,max_score,position,is_archived')
      .eq('course_id',courseId).eq('is_archived',false).order('category').order('position').order('id').range(from,to)),
     readPages<Mark>((from,to)=>db().from('gradebook_marks').select('course_id,item_id,student_id,submitted,score')
      .eq('course_id',courseId).eq('student_id',userId).order('item_id').range(from,to)),
    ]);
    if(settingsResult.error)throw settingsResult.error;
    const chunks:number[][]=[];
    for(let i=0;i<sessions.length;i+=50)chunks.push(sessions.slice(i,i+50).map(s=>s.id));
    const attendance=(await Promise.all(chunks.map(ids=>readPages<Attendance>((from,to)=>
     db().from('attendance_records').select('session_id,student_id,status')
      .in('session_id',ids).eq('student_id',userId).order('session_id').range(from,to))))).flat();
    items.sort((a,b)=>categories.indexOf(a.category)-categories.indexOf(b.category)||a.position-b.position||a.id-b.id);
    if(active)setData({settings:settingsResult.data as Settings|null,sessions,items,marks,attendance});
   }catch(e){if(active)setError('โหลดผลคะแนนไม่สำเร็จ: '+message(e));}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[courseId,userId,refresh]);

 const attendance=new Map((data?.attendance??[]).map(a=>[`${a.session_id}:${a.student_id}`,a]));
 const marks=new Map((data?.marks??[]).map(m=>[`${m.item_id}:${m.student_id}`,m]));
 const summary=data?.settings?assess(userId,data.sessions,attendance,data.items,marks,data.settings):null;
 const settings=data?.settings;

 return <section className={styles.card} aria-label="ตารางคะแนนของฉัน">
  <div className={styles.heading}>
   <div><h2>ตารางคะแนนของฉัน</h2><p>{course.code} — {course.title} · ภาคเรียน {course.term}</p></div>
   <button type="button" onClick={()=>setRefresh(value=>value+1)} disabled={loading}>↻ อัปเดต</button>
  </div>
  <p className={styles.note}>แสดงเฉพาะผลของบัญชีนี้ คะแนนจะเปลี่ยนตามข้อมูลที่อาจารย์บันทึก</p>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {loading?<p role="status">กำลังโหลดผลคะแนน...</p>:data&&<>
   {summary&&settings?<div className={styles.summary}>
    <div><span>คะแนนสะสมปัจจุบัน</span><strong>{score(summary.partial)} / 100</strong><small>{summary.complete?'ข้อมูลครบตามเกณฑ์':'ชั่วคราว · ข้อมูลยังไม่ครบ'}</small></div>
    <div><span>เกรดตามเกณฑ์ในระบบ</span><strong>{summary.grade??'ยังไม่สรุป'}</strong><small>แสดงเมื่อบันทึกข้อมูลครบ โปรดตรวจสอบผลอย่างเป็นทางการกับอาจารย์</small></div>
   </div>:<p className={styles.note}>อาจารย์ยังไม่ได้ตั้งเกณฑ์คะแนน จึงยังไม่แสดงคะแนนรวมและเกรด</p>}
   {summary&&settings&&<div className={styles.tableWrap}><table>
    <caption>คะแนนแยกตามส่วน</caption><thead><tr><th scope="col">ส่วนคะแนน</th><th scope="col">คะแนนสะสม / คะแนนเต็ม</th><th scope="col">ข้อมูลที่บันทึก</th></tr></thead>
    <tbody><tr><th scope="row">เข้าเรียน</th><td>{score(summary.attendanceScore)} / {score(settings.attendance_weight)}</td><td>{summary.recorded} / {summary.expected} คาบ</td></tr>
    {categories.map(category=><tr key={category}><th scope="row">{categoryNames[category]}</th><td>{score(summary.results[category].earned)} / {score(settings[`${category}_weight` as keyof Settings])}</td><td>{summary.results[category].recorded} / {summary.results[category].total} รายการ</td></tr>)}</tbody>
   </table></div>}
   <details className={styles.details}><summary>ผลเช็กชื่อรายคาบ ({data.sessions.length} คาบ)</summary>
    {data.sessions.length?<div className={styles.tableWrap}><table><thead><tr><th scope="col">วันที่</th><th scope="col">หัวข้อ</th><th scope="col">สถานะ</th></tr></thead>
     <tbody>{data.sessions.map(s=>{const a=attendance.get(`${s.id}:${userId}`);return <tr key={s.id}><td>{s.session_date}</td><td>{s.topic||'—'}</td><td>{a?attendanceLabels[a.status]??a.status:'ยังไม่บันทึก'}</td></tr>;})}</tbody></table></div>
     :<p>ยังไม่มีคาบเรียนที่เปิดบันทึก</p>}
   </details>
   <details className={styles.details}><summary>ผลการบ้านและคะแนนรายรายการ ({data.items.length} รายการ)</summary>
    {data.items.length?<div className={styles.tableWrap}><table><thead><tr><th scope="col">ประเภท</th><th scope="col">รายการ</th><th scope="col">ผลของฉัน</th></tr></thead>
     <tbody>{data.items.map(item=>{const mark=marks.get(`${item.id}:${userId}`);
      const result=!mark?'ยังไม่บันทึก':item.category==='homework'
       ?mark.submitted===true?'ส่งแล้ว':mark.submitted===false?'ไม่ส่ง':'ยังไม่บันทึก'
       :mark.score===null?'ยังไม่บันทึก':`${Number(mark.score)} / ${Number(item.max_score)}`;
      return <tr key={item.id}><td>{categoryNames[item.category]}</td><th scope="row">{item.title}</th><td>{result}</td></tr>;})}</tbody></table></div>
     :<p>อาจารย์ยังไม่ได้เพิ่มรายการคะแนน</p>}
   </details>
  </>}
 </section>;
}
