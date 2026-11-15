const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const {create,act} = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = {confirm:()=>true};
const cancelled={id:21,course_id:1,session_date:'2026-11-14',topic:'คาบทดสอบ',is_cancelled:true,cancelled_at:'2026-11-14'};
const active={id:22,course_id:1,session_date:'2026-11-16',topic:'คาบจริง',is_cancelled:false,cancelled_at:null};
let sessions=[cancelled,active];
let members=[];
let attendance=[];
let excelReport;
const expected={session_id:21,course_id:1,course_code:'4112203',session_date:'2026-11-14',topic:'คาบทดสอบ',attendance_records:1,qr_windows:1,qr_tokens:1,qr_attempts:2,security_events:3,leave_requests:0};
const calls=[];
function query(table) {
  const result=()=>({data:table==='attendance_sessions'?sessions:table==='enrollments'?members:table==='attendance_records'?attendance:[],error:null});
  return {select(){return this},eq(){return this},order(){return this},then(ok,err){return Promise.resolve(result()).then(ok,err)}};
}
const fakeDb={from:query,rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='cancelled_session_delete_summary')return {data:expected,error:null};
  if(name==='delete_cancelled_session_permanently'){sessions=sessions.filter(s=>s.id!==args.p_session_id);return {data:null,error:null};}
  return {data:null,error:null};
}};
const originalLoad=Module._load;
Module._load=function(request,parent){
  if(parent && parent.filename.endsWith(path.join('src','app','AttendancePanel.tsx'))){
    if(request==='../lib/supabase')return {db:()=>fakeDb};
    if(request==='../lib/excel-export')return {downloadExcel:async(_name,sheets)=>{excelReport=sheets;}};
    if(request==='./Pagination'||request==='./SmartAttendanceTeacher')return {__esModule:true,default:()=>null};
    if(request.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  }
  return originalLoad.apply(this,arguments);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,filename)=>{
  const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  mod._compile(output,filename);
};
const AttendancePanel=require('../src/app/AttendancePanel.tsx').default;
Module._load=originalLoad;

test('teacher must review impacts and type the correct session number before deletion',async()=>{
  let renderer;
  try {
    await act(async()=>{renderer=create(React.createElement(AttendancePanel,{courseId:1,courseCode:'4112203',teacher:true}));});
    const root=renderer.root;
    const button=label=>root.findAllByType('button').find(b=>b.children.includes(label));
    const click=async el=>{assert.ok(el);await act(async()=>{el.props.onClick();});};
    const change=async(el,value)=>act(async()=>{el.props.onChange({target:{value}});});
    assert.equal(button('ลบคาบเรียน'),undefined,'the obsolete delete path is hidden for cancelled sessions');
    await click(button('ตรวจสอบก่อนลบคาบนี้ถาวร'));
    assert.equal(calls.filter(c=>c.name==='delete_cancelled_session_permanently').length,0);
    assert.ok(root.findByProps({'aria-labelledby':'delete-session-heading'}));
    assert.match(JSON.stringify(renderer.toJSON()),/คาบทดสอบ/);
    assert.equal(button('ยืนยันลบถาวร').props.disabled,true);
    const confirmation=root.findAllByType('input').find(el=>el.props.inputMode==='numeric');
    await change(confirmation,'22');
    assert.equal(button('ยืนยันลบถาวร').props.disabled,true);
    await click(button('กลับ โดยไม่ลบ'));
    assert.equal(calls.filter(c=>c.name==='delete_cancelled_session_permanently').length,0);
    await click(button('ตรวจสอบก่อนลบคาบนี้ถาวร'));
    await change(root.findAllByType('input').find(el=>el.props.inputMode==='numeric'),'21');
    assert.equal(button('ยืนยันลบถาวร').props.disabled,false);
    await click(button('ยืนยันลบถาวร'));
    const deletions=calls.filter(c=>c.name==='delete_cancelled_session_permanently');
    assert.equal(deletions.length,1);
    assert.deepEqual(deletions[0].args,{p_session_id:21,p_confirmation:'21',p_expected_summary:expected});
    assert.deepEqual(sessions.map(s=>s.id),[22]);
    assert.equal(button('ตรวจสอบก่อนลบคาบนี้ถาวร'),undefined,'active sessions do not show permanent deletion');
    assert.ok(button('ลบคาบเรียน'),'the original delete path remains available for active sessions');
  } finally {if(renderer)await act(async()=>renderer.unmount());}
});

test('attendance roster and Excel use student numbers while retaining each saved status',async()=>{
  sessions=[active];
  members=[
    {student_id:'high',status:'approved',profiles:{full_name:'นักศึกษารหัสสูง',student_id:'686040300125'}},
    {student_id:'low',status:'approved',profiles:{full_name:'นักศึกษารหัสต่ำ',student_id:'675040300425'}},
  ];
  attendance=[
    {session_id:22,student_id:'high',status:'present',note:''},
    {session_id:22,student_id:'low',status:'late',note:''},
  ];
  let renderer;
  try {
    await act(async()=>{renderer=create(React.createElement(AttendancePanel,{courseId:1,courseCode:'4112203',teacher:true}));});
    const root=renderer.root;
    const rows=root.findByType('tbody').findAllByType('tr');
    assert.equal(rows[0].findAllByType('td')[1].children[0],'675040300425');
    assert.equal(rows[0].findByType('select').props.value,'late');
    assert.equal(rows[1].findAllByType('td')[1].children[0],'686040300125');
    assert.equal(rows[1].findByType('select').props.value,'present');
    const excel=root.findAllByType('button').find(button=>button.children.includes('ดาวน์โหลด Excel (.xlsx)'));
    await act(async()=>{await excel.props.onClick();});
    assert.deepEqual(excelReport[0].rows.map(row=>[row[4],row[5]]),[['675040300425','สาย'],['686040300125','มาเรียน']]);
  } finally {
    if(renderer)await act(async()=>renderer.unmount());
    members=[];attendance=[];sessions=[cancelled,active];excelReport=undefined;
  }
});
