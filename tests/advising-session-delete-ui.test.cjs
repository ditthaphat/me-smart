const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const records = {
  advising_groups: [{ id: 10, owner_id: 'teacher-1', name: 'กลุ่มทดสอบ', cohort: '69', is_archived: false }],
  advising_students: [{ id: 1, owner_id: 'teacher-1', group_id: 10, student_number: 'S001', full_name: 'นักศึกษาทดสอบ ก', is_archived: false }],
  advising_sessions: [
    { id: 100, owner_id: 'teacher-1', group_id: 10, meeting_date: '2026-11-15', start_time: '09:00:00', end_time: '10:00:00', location: 'ห้องทดสอบ', advisors: ['อาจารย์ทดสอบ'], discussion: 'การประชุมทดสอบ', recommendations: '', next_meeting_date: null, next_meeting_time: null, next_meeting_note: '', is_archived: false },
    { id: 101, owner_id: 'teacher-1', group_id: 10, meeting_date: '2026-11-16', start_time: null, end_time: null, location: 'อีกครั้ง', advisors: ['อาจารย์ทดสอบ'], discussion: 'ข้อมูลที่ต้องเก็บไว้', recommendations: '', next_meeting_date: null, next_meeting_time: null, next_meeting_note: '', is_archived: false },
  ],
  advising_participants: [
    { owner_id: 'teacher-1', group_id: 10, session_id: 100, student_id: 1, student_number_snapshot: 'S001', full_name_snapshot: 'นักศึกษาทดสอบ ก', attendance_status: 'present' },
    { owner_id: 'teacher-1', group_id: 10, session_id: 101, student_id: 1, student_number_snapshot: 'S001', full_name_snapshot: 'นักศึกษาทดสอบ ก', attendance_status: 'present' },
  ],
};
let deletes = 0, version = 'first';
function query(table) {
  const filters = [];
  const q = { select() { return q; }, eq(k,v) { filters.push([k,v]); return q; }, order() { return q; },
    then(resolve,reject) { return Promise.resolve({ data: records[table].filter(row=>filters.every(([k,v])=>row[k]===v)).map(row=>({...row})), error: null }).then(resolve,reject); } };
  return q;
}
async function rpc(name,args) {
  const s = records.advising_sessions.find(row=>row.id===args.p_session_id);
  if (!s) return { data:null,error:{message:'ไม่พบบันทึกการปรึกษา'} };
  const attendees = records.advising_participants.filter(row=>row.session_id===s.id);
  if (name === 'preview_advising_session_deletion') return { data:{ session_id:s.id, group_id:s.group_id, meeting_date:s.meeting_date, start_time:s.start_time, end_time:s.end_time, location:s.location, is_archived:s.is_archived, participant_count:attendees.length, recorded_count:attendees.filter(row=>row.attendance_status!=='not_recorded').length, fingerprint:version },error:null };
  if (name === 'delete_advising_session') {
    deletes++;
    if (args.p_confirmation !== 'ลบ' || args.p_expected_fingerprint !== version) return { data:null,error:{message:'บันทึกเปลี่ยนไป กรุณาตรวจสอบใหม่ก่อนลบ'} };
    records.advising_sessions = records.advising_sessions.filter(row=>row.id!==s.id);
    records.advising_participants = records.advising_participants.filter(row=>row.session_id!==s.id);
    return { data:{session_id:s.id,deleted_participants:attendees.length},error:null };
  }
  return {data:null,error:{message:'unknown rpc'}};
}
const originalLoad = Module._load;
Module._load = function(request,parent) {
  if (parent && parent.filename.endsWith(path.join('src','app','AdvisingPanel.tsx'))) {
    if (request === '../lib/supabase') return {db:()=>({from:query,rpc})};
    if (request === './Pagination') return {__esModule:true,default:()=>null};
    if (request.endsWith('.css')) return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  }
  return originalLoad.apply(this,arguments);
};
require.extensions['.tsx'] = (mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const AdvisingPanel = require('../src/app/AdvisingPanel.tsx').default;
Module._load = originalLoad;
const textOf = node=>node.children.flatMap(x=>typeof x==='string'?[x]:typeof x==='object'?textOf(x):[]).join('');
const button = (root,label)=>root.findAllByType('button').find(node=>textOf(node)===label);
const deleteButton = (root,id)=>root.findAllByType('button').find(node=>node.props['aria-label']?.endsWith(`หมายเลข ${id}`));

test('the teacher reviews the chosen meeting, confirms deletion and keeps unrelated data', async()=>{
  let renderer;
  await act(async()=>{renderer=create(React.createElement(AdvisingPanel,{teacherId:'teacher-1',teacherName:'อาจารย์ทดสอบ'}));});
  const root=renderer.root;
  await act(async()=>{button(root,'บันทึกการปรึกษา').props.onClick();});
  await act(async()=>{await deleteButton(root,100).props.onClick();});
  let form=root.findByProps({'aria-label':'ตรวจสอบการลบบันทึกการปรึกษา'});
  assert.match(textOf(form),/หมายเลข 100/); assert.match(textOf(form),/ห้องทดสอบ/);
  assert.match(textOf(form),/ผู้เข้าร่วม 1 รายการ/); assert.match(textOf(form),/รายชื่อนักศึกษาในกลุ่ม/);
  let confirm=button(form,'ลบบันทึกนี้ถาวร'); assert.equal(confirm.props.disabled,true);
  await act(async()=>{await form.props.onSubmit({preventDefault(){}});}); assert.equal(deletes,0);
  const input=()=>form.findByProps({'aria-label':'คำยืนยันลบบันทึกการปรึกษา'});
  await act(async()=>{input().props.onChange({target:{value:'ผิด'}});}); assert.equal(button(form,'ลบบันทึกนี้ถาวร').props.disabled,true);
  await act(async()=>{button(form,'ยกเลิก').props.onClick();});
  assert.equal(deletes,0); assert.equal(records.advising_sessions.length,2);
  await act(async()=>{await deleteButton(root,100).props.onClick();});
  form=root.findByProps({'aria-label':'ตรวจสอบการลบบันทึกการปรึกษา'});
  await act(async()=>{input().props.onChange({target:{value:'ลบ'}});});
  assert.equal(button(form,'ลบบันทึกนี้ถาวร').props.disabled,false);
  version='changed';
  await act(async()=>{await form.props.onSubmit({preventDefault(){}});});
  assert.equal(records.advising_sessions.length,2,'stale review does not delete');
  assert.equal(root.findAllByProps({'aria-label':'ตรวจสอบการลบบันทึกการปรึกษา'}).length,0);
  await act(async()=>{await deleteButton(root,100).props.onClick();});
  form=root.findByProps({'aria-label':'ตรวจสอบการลบบันทึกการปรึกษา'});
  await act(async()=>{input().props.onChange({target:{value:'ลบ'}});});
  await act(async()=>{await form.props.onSubmit({preventDefault(){}});});
  assert.deepEqual(records.advising_sessions.map(row=>row.id),[101]);
  assert.deepEqual(records.advising_participants.map(row=>row.session_id),[101]);
  assert.equal(records.advising_students.length,1); assert.equal(records.advising_groups.length,1);
  assert.equal(deleteButton(root,100),undefined); assert.ok(deleteButton(root,101));
  await act(async()=>renderer.unmount());
});
