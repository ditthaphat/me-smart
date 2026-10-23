'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {db} from '../lib/supabase';
import styles from './analytics.module.css';
type Status='present'|'late'|'absent'|'leave';
type Session={id:number;session_date:string;topic:string};
type Member={student_id:string;profiles:{full_name:string;student_id:string|null}|null};
type Entry={session_id:number;student_id:string;status:Status;note:string|null};
const statuses:Status[]=['present','late','absent','leave'];
const labels:Record<Status,string>={present:'มาเรียน',late:'สาย',absent:'ขาด',leave:'ลา'};
const safeCell=(v:string)=>'"'+(/^[\s]*[=+@-]/.test(v)?"'"+v:v).replace(/"/g,'""')+'"';
function csv(name:string,rows:string[][]){const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(safeCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function weekStart(date:string){const d=new Date(date+'T12:00:00Z');if(Number.isNaN(d.getTime()))return date;const day=d.getUTCDay();d.setUTCDate(d.getUTCDate()-((day+6)%7));return d.toISOString().slice(0,10)}
function pct(n:number,d:number){return d?100*n/d:0}
export default function AttendanceAnalytics({courseId,courseCode}:{courseId:number;courseCode:string}){
 const [sessions,setSessions]=useState<Session[]>([]),[members,setMembers]=useState<Member[]>([]),[entries,setEntries]=useState<Entry[]>([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[threshold,setThreshold]=useState(80),[query,setQuery]=useState(''),[selected,setSelected]=useState<string|null>(null);
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const [s,m]=await Promise.all([
    db().from('attendance_sessions').select('id,session_date,topic').eq('course_id',courseId).eq('is_cancelled',false).order('session_date',{ascending:true}).order('id',{ascending:true}),
    db().from('enrollments').select('student_id,profiles!enrollments_student_id_fkey(full_name,student_id)').eq('course_id',courseId).eq('status','approved')
   ]);
   if(s.error)throw s.error;if(m.error)throw m.error;
   const ss=(s.data??[]) as Session[];const mm=(m.data??[]) as unknown as Member[];
   const all:Entry[]=[];
   for(let start=0;start<ss.length;start+=50){const ids=ss.slice(start,start+50).map(x=>x.id);let from=0;const size=500;
    while(ids.length){const r=await db().from('attendance_records').select('session_id,student_id,status,note').in('session_id',ids).order('session_id',{ascending:true}).order('student_id',{ascending:true}).range(from,from+size-1);if(r.error)throw r.error;const batch=(r.data??[]) as Entry[];all.push(...batch);if(batch.length<size)break;from+=size}
   }
   setSessions(ss);setMembers(mm);setEntries(all);
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
 },[courseId]);
 useEffect(()=>{void refresh()},[refresh]);
 const entryMap=useMemo(()=>new Map(entries.map(e=>[`${e.session_id}:${e.student_id}`,e])),[entries]);
 const summary=useMemo(()=>members.map(m=>{
  const values=sessions.map(s=>entryMap.get(`${s.id}:${m.student_id}`));
  const count=Object.fromEntries(statuses.map(k=>[k,values.filter(v=>v?.status===k).length])) as Record<Status,number>;
  const recorded=values.filter(Boolean).length;return {...m,values,count,recorded,unrecorded:sessions.length-recorded,rate:pct(count.present+count.late,sessions.length)};
 }),[members,sessions,entryMap]);
 const visible=summary.filter(m=>`${m.profiles?.full_name??''} ${m.profiles?.student_id??''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const totals=Object.fromEntries(statuses.map(k=>[k,summary.reduce((n,m)=>n+m.count[k],0)])) as Record<Status,number>;
 const missing=summary.reduce((n,m)=>n+m.unrecorded,0);
 const warnings=summary.filter(m=>sessions.length>0&&m.unrecorded===0&&m.rate<threshold);
 const incomplete=summary.filter(m=>sessions.length>0&&m.unrecorded>0);
 const weekly=useMemo(()=>{
  const grouped=new Map<string,Session[]>();for(const s of sessions){const key=weekStart(s.session_date);grouped.set(key,[...(grouped.get(key)??[]),s])}
  return [...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([week,ss])=>{
   const counts=Object.fromEntries(statuses.map(k=>[k,0])) as Record<Status,number>;let missingCount=0;
   for(const s of ss)for(const m of members){const e=entryMap.get(`${s.id}:${m.student_id}`);if(e)counts[e.status]++;else missingCount++}
   const denominator=ss.length*members.length;return {week,sessions:ss.length,counts,missingCount,denominator,rate:pct(counts.present+counts.late,denominator)};
  });
 },[sessions,members,entryMap]);
 const detail=summary.find(m=>m.student_id===selected);
 function exportSummary(){csv(`ME-Smart-${courseCode}-attendance-summary.csv`,[['รหัสวิชา','ชื่อ–นามสกุล','รหัสนักศึกษา','คาบทั้งหมด','มาเรียน','สาย','ขาด','ลา','ยังไม่บันทึก','เข้าเรียน (%)','ผลประเมิน'],...summary.map(m=>[courseCode,m.profiles?.full_name??'',m.profiles?.student_id??'',String(sessions.length),...statuses.map(k=>String(m.count[k])),String(m.unrecorded),m.rate.toFixed(2),!sessions.length?'ยังไม่มีคาบ':m.unrecorded?'ข้อมูลไม่ครบ':m.rate<threshold?'ต่ำกว่าเกณฑ์':'ปกติ'])])}
 function exportHistory(){csv(`ME-Smart-${courseCode}-attendance-history.csv`,[['รหัสวิชา','วันที่','หัวข้อ','ชื่อ–นามสกุล','รหัสนักศึกษา','สถานะ','หมายเหตุ'],...summary.flatMap(m=>sessions.map((s,i)=>{const e=m.values[i];return [courseCode,s.session_date,s.topic,m.profiles?.full_name??'',m.profiles?.student_id??'',e?labels[e.status]:'ยังไม่บันทึก',e?.note??'']}))])}
 function exportWeekly(){csv(`ME-Smart-${courseCode}-weekly.csv`,[['สัปดาห์เริ่มวันจันทร์','จำนวนคาบ','มาเรียน','สาย','ขาด','ลา','ยังไม่บันทึก','เข้าเรียน (%)'],...weekly.map(w=>[w.week,String(w.sessions),...statuses.map(k=>String(w.counts[k])),String(w.missingCount),w.rate.toFixed(2)])])}
 function exportIndividual(m:typeof summary[number]){csv(`ME-Smart-${courseCode}-student-${m.profiles?.student_id??m.student_id.slice(0,8)}.csv`,[['รายวิชา',courseCode],['ชื่อ–นามสกุล',m.profiles?.full_name??''],['รหัสนักศึกษา',m.profiles?.student_id??''],['อัตราเข้าเรียน (%)',m.rate.toFixed(2)],[],['วันที่','หัวข้อ','สถานะ','หมายเหตุ'],...sessions.map((s,i)=>{const e=m.values[i];return [s.session_date,s.topic,e?labels[e.status]:'ยังไม่บันทึก',e?.note??'']})])}
 return <section className={styles.panel} aria-label="Attendance Analytics Phase 2.1">
  <div className={styles.header}><div><p className={styles.eyebrow}>ATTENDANCE ANALYTICS · PHASE 2.1</p><h2>สถิติ รายงาน และการแจ้งเตือนการเข้าเรียน</h2><p className={styles.muted}>รายวิชา {courseCode} · สรุปเฉพาะคาบเรียนที่ยังไม่ยกเลิก</p></div><button type="button" onClick={()=>void refresh()} disabled={loading} className={styles.button}>{loading?'กำลังโหลด...':'↻ อัปเดตข้อมูล'}</button></div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.cards}><div><strong>{sessions.length}</strong><span>คาบเรียนที่ไม่ยกเลิก</span></div><div><strong>{members.length}</strong><span>นักศึกษาปัจจุบัน</span></div><div><strong>{totals.present+totals.late}</strong><span>รายการมาเรียนและสาย</span></div><div><strong>{missing}</strong><span>รายการยังไม่บันทึก</span></div></div>
  <div className={styles.chart}><h3>ภาพรวมสถานะการเข้าเรียน</h3>{statuses.map(k=><div className={styles.barRow} key={k}><span>{labels[k]}</span><div className={styles.track}><div className={styles.fill} style={{width:`${pct(totals[k],members.length*sessions.length)}%`}}/></div><strong>{totals[k]}</strong></div>)}<p className={styles.muted}>จำนวนรายการเทียบกับจำนวนคาบเรียน × จำนวนนักศึกษาปัจจุบัน</p></div>
  <div className={styles.section}><div className={styles.header}><div><h3>แนวโน้มการเข้าเรียนรายสัปดาห์</h3><p className={styles.muted}>จัดกลุ่มสัปดาห์ตามวันจันทร์ · คิดจากมาเรียนและสาย หารด้วยจำนวนรายการที่ควรบันทึกทั้งหมด</p></div><button className={styles.button} disabled={!weekly.length||loading} onClick={exportWeekly}>ส่งออกกราฟ CSV</button></div>
   {weekly.length===0?<p className={styles.muted}>ยังไม่มีข้อมูลรายสัปดาห์</p>:<div className={styles.weekScroll}><div className={styles.weekChart}>{weekly.map(w=><div className={styles.weekColumn} key={w.week} title={`สัปดาห์ ${w.week} · ${w.sessions} คาบ · ไม่บันทึก ${w.missingCount}`}><strong>{w.rate.toFixed(1)}%</strong><div className={styles.weekTrack}><div className={styles.weekFill} style={{height:`${w.rate}%`}}/></div><small>{w.week}</small><span>{w.sessions} คาบ</span></div>)}</div></div>}
  </div>
  <div className={styles.section}><div className={styles.header}><div><h3>การแจ้งเตือนนักศึกษา</h3><p className={styles.muted}>เตือนเมื่อบันทึกครบทุกคาบและอัตราเข้าเรียนต่ำกว่าเกณฑ์ · ข้อมูลไม่ครบแสดงแยกต่างหาก</p></div><label className={styles.threshold}>เกณฑ์แจ้งเตือน (%)<input type="number" min={0} max={100} value={threshold} onChange={e=>setThreshold(Math.max(0,Math.min(100,Number(e.target.value)||0)))}/></label></div>
   <div className={styles.alertCards}><div><strong>{warnings.length}</strong><span>ต่ำกว่าเกณฑ์</span></div><div><strong>{incomplete.length}</strong><span>ข้อมูลยังไม่ครบ</span></div></div>
   {warnings.length===0?<p className={styles.muted}>ไม่มีนักศึกษาที่เข้าเงื่อนไขแจ้งเตือนในข้อมูลที่บันทึกครบ</p>:<div className={styles.alertList}>{warnings.map(m=><div key={m.student_id} className={styles.alertItem}><div><strong>{m.profiles?.full_name??m.student_id}</strong><small>{m.profiles?.student_id??'-'} · เข้าเรียน {m.rate.toFixed(1)}%</small></div><button className={styles.button} onClick={()=>setSelected(m.student_id)}>ดูรายงาน</button></div>)}</div>}
   {incomplete.length>0&&<p className={styles.muted}>มีนักศึกษา {incomplete.length} คนที่ข้อมูลไม่ครบ จึงยังไม่ตัดสินว่าต่ำกว่าเกณฑ์</p>}
  </div>
  <div className={styles.section}><h3>รายงานรายบุคคล</h3><div className={styles.tools}><label>ค้นหานักศึกษา<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ชื่อหรือรหัสนักศึกษา"/></label><button className={styles.button} onClick={exportSummary} disabled={!sessions.length||loading}>ส่งออกสรุป CSV</button><button className={styles.button} onClick={exportHistory} disabled={!sessions.length||loading}>ส่งออกประวัติ CSV</button></div>
   <div className={styles.scroll}><table><thead><tr><th>นักศึกษา</th><th>มา</th><th>สาย</th><th>ขาด</th><th>ลา</th><th>ไม่บันทึก</th><th>เข้าเรียน</th><th>สถานะ</th><th>รายงาน</th></tr></thead><tbody>{visible.map(m=><tr key={m.student_id}><td><strong>{m.profiles?.full_name??'-'}</strong><small>{m.profiles?.student_id??'-'}</small></td>{statuses.map(k=><td key={k}>{m.count[k]}</td>)}<td>{m.unrecorded}</td><td>{sessions.length?m.rate.toFixed(1)+'%':'—'}</td><td>{!sessions.length?'ยังไม่มีคาบเรียน':m.unrecorded?'ข้อมูลไม่ครบ':m.rate<threshold?<span className={styles.warning}>ต่ำกว่าเกณฑ์</span>:'ปกติ'}</td><td><button className={styles.button} onClick={()=>setSelected(m.student_id)}>รายละเอียด</button></td></tr>)}</tbody></table></div>
   {!visible.length&&<p className={styles.muted}>ไม่พบนักศึกษาตามคำค้นหา</p>}
   {detail&&<div className={styles.detail}><div className={styles.header}><div><h3>{detail.profiles?.full_name??'รายงานนักศึกษา'}</h3><p className={styles.muted}>รหัสนักศึกษา {detail.profiles?.student_id??'-'} · เข้าเรียน {detail.rate.toFixed(1)}% · ยังไม่บันทึก {detail.unrecorded} คาบ</p></div><div className={styles.actions}><button className={styles.button} onClick={()=>exportIndividual(detail)}>ส่งออกรายบุคคล CSV</button><button className={styles.button} onClick={()=>setSelected(null)}>ปิดรายละเอียด</button></div></div><div className={styles.scroll}><table><thead><tr><th>วันที่</th><th>หัวข้อ</th><th>สถานะ</th><th>หมายเหตุ</th></tr></thead><tbody>{sessions.map((s,i)=>{const e=detail.values[i];return <tr key={s.id}><td>{s.session_date}</td><td>{s.topic}</td><td>{e?labels[e.status]:'ยังไม่บันทึก'}</td><td>{e?.note??'-'}</td></tr>})}</tbody></table></div></div>}
  </div>
  <p className={styles.muted}>นโยบายการคำนวณปัจจุบัน: (มาเรียน + สาย) ÷ จำนวนคาบที่ไม่ยกเลิก × 100 โดยนับ “ลา” และ “ยังไม่บันทึก” ในตัวหาร แต่ไม่ถือว่า “ยังไม่บันทึก” เป็นการขาดเรียนอัตโนมัติ คาบที่ยกเลิกไม่รวมในสถิติและ CSV แต่ประวัติเดิมยังเก็บในฐานข้อมูล ข้อมูลรายงานครอบคลุมเฉพาะนักศึกษาที่มีสถานะอนุมัติในรายวิชาปัจจุบัน</p>
 </section>
}
