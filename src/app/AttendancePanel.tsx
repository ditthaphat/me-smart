'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {downloadExcel} from '../lib/excel-export';
import {db} from '../lib/supabase';
import styles from './attendance.module.css';
import SmartAttendanceTeacher from './SmartAttendanceTeacher';
import {changedAttendance} from '../lib/attendance-utils';
type Member={student_id:string;status:string;profiles:{full_name:string;student_id:string|null}|null};
type Session={id:number;course_id:number;session_date:string;topic:string;is_cancelled:boolean;cancelled_at:string|null};
type RecordRow={session_id:number;student_id:string;status:Status;note:string};
type Status='present'|'late'|'absent'|'leave';
const options:{value:Status;label:string}[]=[{value:'present',label:'มาเรียน'},{value:'late',label:'สาย'},{value:'absent',label:'ขาด'},{value:'leave',label:'ลา'}];
const err = (e: unknown): string => {
  if (e instanceof Error) return e.message;

  if (typeof e === 'object' && e !== null) {
    const x = e as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };

    return [
      x.message,
      x.details,
      x.hint,
      x.code ? `Error code: ${x.code}` : ''
    ].filter(Boolean).join(' | ') || JSON.stringify(e);
  }

  return String(e);
};
export default function AttendancePanel({courseId,courseCode,teacher,onLockChange}:{courseId:number;courseCode:string;teacher:boolean;onLockChange?:(locked:boolean)=>void}){
 const [exporting,setExporting]=useState(false);
 const [sessions,setSessions]=useState<Session[]>([]),[members,setMembers]=useState<Member[]>([]),[records,setRecords]=useState<RecordRow[]>([]);
 const [selected,setSelected]=useState<number|null>(null),[date,setDate]=useState(()=>new Date().toLocaleDateString('en-CA')),[topic,setTopic]=useState('');
 const [qrLocked,setQrLocked]=useState(false);
 const [recordsLoading,setRecordsLoading]=useState(false);
 const [editingSession, setEditingSession] = useState(false);
const [editDate, setEditDate] = useState('');
const [editTopic, setEditTopic] = useState('');
 const [draft,setDraft]=useState<Record<string,{status:Status;note:string}>>({});const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const dirtyRows=changedAttendance(draft,records);
 const dirty=dirtyRows.length>0;
 useEffect(()=>{onLockChange?.(qrLocked||busy||dirty);return()=>onLockChange?.(false)},[qrLocked,busy,dirty,onLockChange]);
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const [s,m]=await Promise.all([
    db().from('attendance_sessions').select('id,course_id,session_date,topic,is_cancelled,cancelled_at').eq('course_id',courseId).order('session_date',{ascending:false}).order('id',{ascending:false}),
    teacher?db().from('enrollments').select('student_id,status,profiles!enrollments_student_id_fkey(full_name,student_id)').eq('course_id',courseId).eq('status','approved'):Promise.resolve({data:[],error:null})
   ]);
   if(s.error)throw s.error;if(m.error)throw m.error;
   const list=(s.data??[]) as Session[];setSessions(list);setMembers((m.data??[]) as unknown as Member[]);
   setSelected(old=>old!==null&&list.some(x=>x.id===old)?old:(list[0]?.id??null));
  }catch(e){setError(err(e));}finally{setLoading(false)}
 },[courseId,teacher]);
 useEffect(()=>{void refresh()},[refresh]);
 useEffect(()=>{setRecords([]);setDraft({});setRecordsLoading(true);if(selected===null){setRecordsLoading(false);return;}let active=true;
  (async()=>{try{const q=db().from('attendance_records').select('session_id,student_id,status,note').eq('session_id',selected);
   const {data,error:e}=await q;if(!active)return;setRecordsLoading(false);if(e){setError(e.message);return;}
   const rows=(data??[]) as RecordRow[];setRecords(rows);setDraft(Object.fromEntries(rows.map(r=>[r.student_id,{status:r.status,note:r.note??''}])));
  }catch(e){if(active)setError(err(e))}finally{if(active)setRecordsLoading(false)}})();return()=>{active=false};},[selected]);
 const selectedSession=sessions.find(s=>s.id===selected);
 
function selectSession(id:number) {
  if(qrLocked||busy)return;
  if(dirty&&!window.confirm('มีรายการแก้ไขที่ยังไม่บันทึก ต้องการทิ้งการแก้ไขและเปลี่ยนคาบหรือไม่?'))return;
  setEditingSession(false);setMessage('');setError('');setSelected(id);
}
 // Refresh only clean drafts. Never overwrite a teacher's unsaved edits with QR polling.
 useEffect(()=>{
  if(!teacher||!qrLocked||dirty||busy||selected===null||recordsLoading)return;
  let active=true,inFlight=false;
  const poll=async()=>{if(inFlight)return;inFlight=true;try{
    const {data,error:e}=await db().from('attendance_records').select('session_id,student_id,status,note').eq('session_id',selected);
    if(!active)return;if(e)throw e;const rows=(data??[]) as RecordRow[];setRecords(rows);setDraft(Object.fromEntries(rows.map(r=>[r.student_id,{status:r.status,note:r.note??''}])));
  }catch(e){if(active)setError('อัปเดตรายชื่อไม่สำเร็จ: '+err(e))}finally{inFlight=false}};
  void poll();const timer=setInterval(()=>void poll(),5000);return()=>{active=false;clearInterval(timer)};
 },[teacher,qrLocked,dirty,busy,selected,recordsLoading]);

 const counts=useMemo(()=>Object.fromEntries(options.map(o=>[o.value,records.filter(r=>r.status===o.value).length])) as Record<Status,number>,[records]);
 async function create(){if(qrLocked||busy)return;if(dirty){setError('กรุณาบันทึกหรือยกเลิกการแก้ไขรายชื่อก่อนสร้างคาบใหม่');return;}if(!date||!topic.trim()){setError('กรุณากรอกวันที่และหัวข้อคาบเรียน');return;}setBusy(true);setError('');setMessage('');try{const {data,error:e}=await db().rpc('create_attendance_session',{p_course_id:courseId,p_date:date,p_topic:topic.trim()});if(e)throw e;await refresh();setSelected(Number(data));setTopic('');setMessage('สร้างคาบเรียนแล้ว');}catch(e){setError(err(e))}finally{setBusy(false)}}
 function beginEditSession() {
  if (!selectedSession || qrLocked || busy) return;

  setEditDate(selectedSession.session_date);
  setEditTopic(selectedSession.topic);
  setEditingSession(true);
  setError('');
  setMessage('');
}

async function updateSession() {
  if (!selectedSession || qrLocked || busy) return;

  if (!editDate || editTopic.trim().length > 200) {
    setError('กรุณาตรวจสอบวันที่และหัวข้อการเรียน');
    return;
  }

  setBusy(true);
  setError('');
  setMessage('');

  try {
    const { error: e } = await db().rpc(
      'update_attendance_session',
      {
        p_session_id: selectedSession.id,
        p_date: editDate,
        p_topic: editTopic.trim()
      }
    );

    if (e) throw e;

    setEditingSession(false);
    await refresh();
    setMessage('แก้ไขข้อมูลคาบเรียนสำเร็จ');
  } catch (e) {
    setError(err(e));
  } finally {
    setBusy(false);
  }
}

async function deleteSession() {
  if (!selectedSession || qrLocked || busy) return;

  const confirmed = window.confirm(
    `ต้องการลบคาบเรียนวันที่ ${selectedSession.session_date}\n` +
    `หัวข้อ: ${selectedSession.topic}\n\n` +
    'ระบบจะอนุญาตให้ลบเฉพาะคาบที่ไม่มีประวัติการเช็คชื่อหรือ QR เท่านั้น'
  );

  if (!confirmed) return;

  setBusy(true);
  setError('');
  setMessage('');

  try {
    const { error: e } = await db().rpc(
      'delete_attendance_session',
      {
        p_session_id: selectedSession.id
      }
    );

    if (e) throw e;

    setEditingSession(false);
    await refresh();
    setMessage('ลบคาบเรียนสำเร็จ');
  } catch (e) {
    setError(err(e));
  } finally {
    setBusy(false);
  }
}
 async function setCancellation(cancel: boolean) {
  if (!selectedSession || busy || qrLocked) return;
  const action = cancel ? 'ยกเลิก' : 'คืนสถานะ';
  if (!window.confirm(`ยืนยัน${action}คาบเรียนวันที่ ${selectedSession.session_date}\nหัวข้อ: ${selectedSession.topic}\n\n${cancel ? 'ประวัติการเช็คชื่อและ QR เดิมจะถูกเก็บไว้ คาบนี้จะไม่ถูกนับในสถิติการเข้าเรียน' : 'คาบนี้จะกลับมาเป็นคาบเรียนปกติ'}`)) return;
  setBusy(true); setError(''); setMessage('');
  try {
    const {error:e} = await db().rpc(cancel ? 'cancel_attendance_session' : 'restore_attendance_session', {
      p_session_id: selectedSession.id
    });
    if (e) throw e;
    setEditingSession(false);
    await refresh();
    setMessage(cancel ? 'ยกเลิกคาบเรียนแล้ว (ยังเก็บประวัติเดิม)' : 'คืนสถานะคาบเรียนแล้ว');
  } catch (e) {setError(err(e));} finally {setBusy(false);}
 }
 
async function refreshAttendanceRecords() {
  if (selected === null || busy || dirty || recordsLoading) return;

  setBusy(true);
  setError('');
  setMessage('');

  try {
    const { data, error: e } = await db()
      .from('attendance_records')
      .select('session_id,student_id,status,note')
      .eq('session_id', selected);

    if (e) throw e;

    const rows = (data ?? []) as RecordRow[];

    setRecords(rows);
    setDraft(
      Object.fromEntries(
        rows.map(r => [
          r.student_id,
          { status: r.status, note: r.note }
        ])
      )
    );

    setMessage('อัปเดตผลการเช็คชื่อจาก QR สำเร็จ');
  } catch (e) {
    setError(err(e));
  } finally {
    setBusy(false);
  }
}
async function deleteStudentAttendance(
  studentId: string,
  studentName: string
) {
  if (selected === null || selectedSession?.is_cancelled || qrLocked || busy) return;

  const confirmed = window.confirm(
    `ต้องการลบผลการเช็คชื่อของ ${studentName} ใช่หรือไม่?\n\n` +
    'จะลบเฉพาะประวัติการเช็คชื่อในคาบนี้ ไม่ลบรายชื่อนักศึกษา'
  );

  if (!confirmed) return;

  setBusy(true);
  setError('');
  setMessage('');

  try {
    const { error: e } = await db().rpc(
      'delete_attendance_record',
      {
        p_session_id: selected,
        p_student_id: studentId
      }
    );

    if (e) throw e;

    const { data, error: readError } = await db()
      .from('attendance_records')
      .select('session_id,student_id,status,note')
      .eq('session_id', selected);

    if (readError) throw readError;

    const rows = (data ?? []) as RecordRow[];

    setRecords(rows);

    setDraft(
      Object.fromEntries(
        rows.map(r => [
          r.student_id,
          { status: r.status, note: r.note }
        ])
      )
    );

    setMessage(`ลบผลการเช็คชื่อของ ${studentName} สำเร็จ`);
  } catch (e) {
    setError(err(e));
  } finally {
    setBusy(false);
  }
}
 async function save(){if(selected===null||busy||qrLocked||recordsLoading||!dirty)return;if(selectedSession?.is_cancelled){setError('คาบเรียนนี้ถูกยกเลิก ไม่สามารถบันทึกการเข้าเรียนได้');return;}setBusy(true);setError('');setMessage('');try{
  // Save sequentially to avoid overloading small Supabase instances; retry safe via upsert.
  for(const [studentId,d] of dirtyRows){if(!members.some(m=>m.student_id===studentId))continue;
   const {error:e}=await db().rpc('save_attendance',{p_session_id:selected,p_student_id:studentId,p_status:d.status,p_note:d.note});if(e)throw e;
  }
  const {data,error:e}=await db().from('attendance_records').select('session_id,student_id,status,note').eq('session_id',selected);if(e)throw e;
  const rows=(data??[]) as RecordRow[];setRecords(rows);setDraft(Object.fromEntries(rows.map(r=>[r.student_id,{status:r.status,note:r.note??''}])));setMessage('บันทึกการเข้าเรียนสำเร็จ');
 }catch(e){setError('บันทึกไม่ครบ กรุณาตรวจสอบแล้วกดบันทึกอีกครั้ง: '+err(e))}finally{setBusy(false)}}
 async function exportExcel(){
  if(exporting||!selectedSession)return;setExporting(true);setError('');
  try{await downloadExcel(`attendance-${courseCode}-${selectedSession.session_date}-${selectedSession.id}.xlsx`,[{name:'ผลเข้าเรียนรายคาบ',metadata:[['รายวิชา',courseCode],['วันที่',selectedSession.session_date],['หัวข้อ',selectedSession.topic],['สถานะคาบ',selectedSession.is_cancelled?'ยกเลิกแล้ว (ไม่นับในสถิติ)':'ไม่ยกเลิก'],['ข้อมูล','ผลที่บันทึกในฐานข้อมูล ไม่รวมการแก้ไขที่ยังไม่บันทึก']],headers:['รหัสวิชา','วันที่','หัวข้อ','ชื่อ–นามสกุล','รหัสนักศึกษา','สถานะ','หมายเหตุ'],rows:members.map(m=>{const r=records.find(x=>x.student_id===m.student_id);return [courseCode,selectedSession.session_date,selectedSession.topic,m.profiles?.full_name??'',m.profiles?.student_id??'',r?options.find(x=>x.value===r.status)?.label??'':'ยังไม่บันทึก',r?.note??'']})}])}catch(e){setError('ส่งออก Excel ไม่สำเร็จ: '+err(e))}finally{setExporting(false)}
 }
 function exportCsv(){const safe=(v:string)=>/^[\s]*[=+@-]/.test(v)?"'"+v:v;const esc=(v:string)=>'"'+safe(v).replace(/"/g,'""')+'"';
  const rows=[['รหัสวิชา','วันที่','หัวข้อ','ชื่อ–นามสกุล','รหัสนักศึกษา','สถานะ','หมายเหตุ'],...members.map(m=>{const r=records.find(x=>x.student_id===m.student_id);return[courseCode,selectedSession?.session_date??'',selectedSession?.topic??'',m.profiles?.full_name??'',m.profiles?.student_id??'',r?options.find(x=>x.value===r.status)?.label??'':'ยังไม่บันทึก',r?.note??'']})];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(v=>esc(v)).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`attendance-${courseCode}-${selectedSession?.session_date??'all'}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className={styles.panel} aria-label="Attendance Management">
  <div className={styles.heading}><div><p className={styles.eyebrow}>CLASSROOM CONTROL</p><h2>ควบคุมคาบเรียนและการเข้าเรียน</h2><p className={styles.sub}>รายวิชา {courseCode} · {teacher?'อาจารย์ผู้สอน':'ประวัติการเข้าเรียนของฉัน'}</p></div>{teacher&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className={styles.secondary} onClick={()=>void exportExcel()} disabled={!selectedSession||busy||exporting}>{exporting?'กำลังสร้าง Excel...':'ดาวน์โหลด Excel (.xlsx)'}</button><button className={styles.secondary} onClick={exportCsv} disabled={!selectedSession||busy}>ส่งออก CSV</button></div>}</div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status" className={styles.success}>{message}</p>}
  {teacher&&<div className={styles.createBox}><h3>สร้างคาบเรียนใหม่</h3><p className={styles.sub}>กรอกวันที่และหัวข้อ แล้วกดสร้างคาบเรียน · หากมีคาบแล้วให้เลือกจากรายการด้านล่าง</p><form className={styles.create} onSubmit={e=>{e.preventDefault();void create()}}><label>วันที่เรียน<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label><label>หัวข้อคาบเรียน<input required maxLength={200} value={topic} onChange={e=>setTopic(e.target.value)} placeholder="เช่น บทที่ 3 สมการพลังงาน หรือ ทดสอบ QR"/></label><button className={styles.primary} disabled={busy||qrLocked||dirty||!topic.trim()}>+ สร้างคาบเรียนใหม่</button></form></div>}
  {loading?<p>กำลังโหลดข้อมูล...</p>:sessions.length===0?<p className={styles.empty}>ยังไม่มีคาบเรียน อาจารย์สามารถสร้างคาบเรียนแรกได้</p>:<>
   <label className={styles.selectLabel}>1. เลือกคาบเรียนที่ต้องการจัดการ<select disabled={busy||qrLocked} value={selected??''} onChange={e=>selectSession(Number(e.target.value))}>{sessions.map(s=><option key={s.id} value={s.id}>{s.is_cancelled?'[ยกเลิกแล้ว] ':''}{s.session_date} — {s.topic||'ไม่ระบุหัวข้อ'} </option>)}</select></label>
   {teacher && selectedSession && (
  <div style={{
    margin: '16px 0',
    padding: '18px',
    border: '1px solid #dbe5f2',
    borderRadius: '12px'
  }}>
    <h3>จัดการคาบเรียน</h3>
    
{qrLocked && <p role="status" className={styles.sub}>กำลังเปิดรับหรือดำเนินการกับ QR กรุณาปิดรับก่อนเปลี่ยนคาบหรือแก้ไขรายชื่อ</p>}
{selectedSession.is_cancelled && <p role="status" className={styles.error}>คาบนี้ยกเลิกแล้ว · เก็บประวัติไว้ แต่ไม่นับในสถิติ</p>}

<button
  type="button"
  className={styles.secondary}
  disabled={busy || selected === null || dirty || recordsLoading}
  onClick={() => void refreshAttendanceRecords()}
  style={{ marginBottom: '14px', marginLeft: '10px' }}
>
  🔄 รีเฟรชผลเช็คชื่อ
</button>

    {!editingSession ? (
      <div style={{
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap'
      }}>
        <button
          type="button"
          className={styles.secondary}
          disabled={busy || qrLocked || recordsLoading}
          onClick={beginEditSession}
        >
          ✏️ แก้ไขคาบเรียน
        </button>

        <button
          type="button"
          className={styles.secondary}
          disabled={busy || qrLocked || recordsLoading}
          onClick={() => void deleteSession()}
        >
          ลบคาบเรียน
        </button>
        <button type="button" className={styles.secondary} disabled={busy || qrLocked || recordsLoading}
          onClick={() => void setCancellation(!selectedSession?.is_cancelled)}>
          {selectedSession?.is_cancelled ? '↩ คืนสถานะคาบเรียน' : '⊘ ยกเลิกคาบเรียน (เก็บประวัติ)'}
        </button>
      </div>
    ) : (
      <div style={{
        display: 'grid',
        gap: '12px'
      }}>
        <label>
          วันที่เรียน
          <input
            type="date"
            value={editDate}
            onChange={e => setEditDate(e.target.value)}
          />
        </label>
        <label style={{display:'block', width:'100%'}}>
          หัวข้อการเรียน
          <input
                  type="text"
             maxLength={200}
             value={editTopic}
             onChange={e => setEditTopic(e.target.value)}
             style={{
               display: 'block',
               width: '100%',
               minWidth: 0,
               boxSizing: 'border-box',
               padding: '12px 14px',
               fontSize: '16px'
               }}
             />
        </label>

        <div style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap'
        }}>
          <button
            type="button"
            className={styles.primary}
            disabled={busy || qrLocked || !editDate}
            onClick={() => void updateSession()}
          >
            {busy ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>

          <button
            type="button"
            className={styles.secondary}
            disabled={busy || qrLocked || recordsLoading}
            onClick={() => setEditingSession(false)}
          >
            ยกเลิก
          </button>
        </div>
      </div>
    )}
  </div>
)}
   {teacher&&selectedSession&&<SmartAttendanceTeacher key={selectedSession.id} session={selectedSession} courseCode={courseCode} onLockChange={setQrLocked} disabled={busy||dirty||editingSession||recordsLoading}/>}
   <h3>{teacher?'3. รายชื่อและผลการเข้าเรียน':'ผลการเข้าเรียน'}</h3>
   {recordsLoading&&<p role="status">กำลังโหลดผลการเข้าเรียนของคาบนี้...</p>}
   {dirty&&<p role="status" className={styles.pending}>มีการแก้ไข {dirtyRows.length} รายการที่ยังไม่บันทึก <button type="button" disabled={busy||qrLocked} className={styles.secondary} onClick={()=>setDraft(Object.fromEntries(records.map(r=>[r.student_id,{status:r.status,note:r.note??''}])))}>ยกเลิกการแก้ไข</button></p>}
   <div className={styles.summary}>{options.map(o=><div key={o.value}><strong>{counts[o.value]}</strong><span>{o.label}</span></div>)}<div><strong>{records.length}</strong><span>บันทึกแล้ว</span></div></div>
   {teacher?<><div className={styles.toolbar}><strong>นักศึกษาที่อนุมัติแล้ว {members.length} คน</strong><button className={styles.secondary} disabled={busy||qrLocked||recordsLoading||members.length===0||selectedSession?.is_cancelled} onClick={()=>setDraft(Object.fromEntries(members.map(m=>[m.student_id,{status:'present' as Status,note:draft[m.student_id]?.note??''}])))}>ตั้งค่าทั้งหมดเป็นมาเรียน</button></div>
<div className={styles.tableWrap}>
  <table>
    <thead>
      <tr>
        <th>ชื่อ–นามสกุล</th>
        <th>รหัสนักศึกษา</th>
        <th>สถานะ</th>
        <th>หมายเหตุ</th>
        <th>จัดการ</th>
      </tr>
    </thead>

    <tbody>
      {members.map(m => {
        const saved = records.some(
          r => r.student_id === m.student_id
        );

        return (
          <tr key={m.student_id}>
            <td>{m.profiles?.full_name ?? '-'}</td>

            <td>{m.profiles?.student_id ?? '-'}</td>

            <td>
              <select
                disabled={busy || qrLocked || recordsLoading || selectedSession?.is_cancelled}
                aria-label={`สถานะ ${m.profiles?.full_name ?? m.student_id}`}
                value={draft[m.student_id]?.status ?? ''}
                onChange={e =>
                  setDraft(d => ({
                    ...d,
                    [m.student_id]: {
                      status: e.target.value as Status,
                      note: d[m.student_id]?.note ?? ''
                    }
                  }))
                }
              >
                <option value="">ยังไม่บันทึก</option>

                {options.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </td>

            <td>
              <input
                disabled={busy || qrLocked || recordsLoading || selectedSession?.is_cancelled}
                maxLength={500}
                placeholder="หมายเหตุ (ไม่บังคับ)"
                value={draft[m.student_id]?.note ?? ''}
                onChange={e =>
                  setDraft(d => ({
                    ...d,
                    [m.student_id]: {
                      status: d[m.student_id]?.status ?? 'present',
                      note: e.target.value
                    }
                  }))
                }
              />
            </td>

            <td>
              {saved ? (
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy || qrLocked || recordsLoading || selectedSession?.is_cancelled}
                  onClick={() =>
                    void deleteStudentAttendance(
                      m.student_id,
                      m.profiles?.full_name ?? 'นักศึกษา'
                    )
                  }
                  style={{
                    color: '#b91c1c',
                    whiteSpace: 'nowrap'
                  }}
                >
                  ลบผลเช็คชื่อ
                </button>
              ) : (
                <span>ยังไม่บันทึก</span>
              )}
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
</div>
    <button className={styles.primary} disabled={busy||qrLocked||recordsLoading||selectedSession?.is_cancelled||!dirty} onClick={()=>void save()}>{busy?'กำลังบันทึก...':'บันทึกการเข้าเรียน'}</button><p className={styles.sub}>บันทึกเฉพาะแถวที่แก้ไข · ผลจาก QR บันทึกให้อัตโนมัติ ไม่ต้องกดบันทึกซ้ำ · ปิดรับ QR ก่อนแก้ไขรายชื่อ</p></>
   :<div className={styles.tableWrap}><table><thead><tr><th>วันที่</th><th>หัวข้อ</th><th>สถานะของฉัน</th><th>หมายเหตุ</th></tr></thead><tbody>{sessions.map(s=><tr key={s.id}><td>{s.session_date}</td><td>{s.topic||'-'}{s.is_cancelled?' (ยกเลิกแล้ว)':''}</td><td>{options.find(o=>o.value===records.find(r=>r.session_id===s.id)?.status)?.label??(s.id===selected?'ยังไม่บันทึก':'เลือกคาบเรียนเพื่อดู')}</td><td>{s.id===selected?records[0]?.note??'-':'-'}</td></tr>)}</tbody></table></div>}
  </>}
 </section>
}
