const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const test=require('node:test');
const ts=require('typescript');
const React=require('react');
const {create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

const records={
 advising_groups:[{id:10,owner_id:'teacher-1',name:'กลุ่มทดสอบ',cohort:'69',is_archived:false}],
 advising_students:[{id:1,owner_id:'teacher-1',group_id:10,student_number:'S001',full_name:'นักศึกษาทดสอบ ก',is_archived:false},{id:2,owner_id:'teacher-1',group_id:10,student_number:'S002',full_name:'นักศึกษาทดสอบ ข',is_archived:false}],
 advising_sessions:[{id:100,owner_id:'teacher-1',group_id:10,meeting_date:'2026-11-15',is_archived:false}],
 advising_participants:[{owner_id:'teacher-1',group_id:10,session_id:100,student_id:1,attendance_status:'present',student_number_snapshot:'S001',full_name_snapshot:'นักศึกษาทดสอบ ก'},{owner_id:'teacher-1',group_id:10,session_id:100,student_id:2,attendance_status:'present',student_number_snapshot:'S002',full_name_snapshot:'นักศึกษาทดสอบ ข'}],
};
let deletes=0;
function query(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},then(resolve,reject){const data=records[table].filter(row=>filters.every(([k,v])=>row[k]===v)).map(row=>({...row}));return Promise.resolve({data,error:null}).then(resolve,reject)}};return q}
async function rpc(name,args){
 const s=records.advising_students.find(row=>row.id===args.p_student_id);
 if(!s)return {data:null,error:{message:'ไม่พบรายชื่อนักศึกษา'}};
 if(name==='preview_advising_student_deletion'){
  const participants=records.advising_participants.filter(row=>row.student_id===s.id);
  return {data:{student_id:s.id,group_id:s.group_id,student_number:s.student_number,full_name:s.full_name,participant_count:participants.length,recorded_count:participants.filter(x=>x.attendance_status!=='not_recorded').length,fingerprint:'fixture'},error:null};
 }
 if(name==='delete_advising_student'){
  deletes++;
  if(args.p_confirmation!==s.student_number||args.p_expected_fingerprint!=='fixture')return {data:null,error:{message:'ข้อมูลยืนยันไม่ถูกต้อง'}};
  records.advising_students=records.advising_students.filter(row=>row.id!==s.id);
  records.advising_participants=records.advising_participants.filter(row=>row.student_id!==s.id);
  return {data:{student_id:s.id,deleted_participants:1},error:null};
 }
 return {data:null,error:{message:'unknown rpc'}};
}
const originalLoad=Module._load;
Module._load=function(request,parent){
 if(parent&&parent.filename.endsWith(path.join('src','app','AdvisingPanel.tsx'))){
  if(request==='../lib/supabase')return {db:()=>({from:query,rpc})};
  if(request==='./Pagination')return {__esModule:true,default:()=>null};
  if(request.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
 }
 return originalLoad.apply(this,arguments);
};
require.extensions['.tsx']=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const AdvisingPanel=require('../src/app/AdvisingPanel.tsx').default;Module._load=originalLoad;
const textOf=node=>node.children.flatMap(x=>typeof x==='string'?[x]:typeof x==='object'?textOf(x):[]).join('');

test('deletion shows the impact and requires the selected student number',async()=>{
 let renderer;await act(async()=>{renderer=create(React.createElement(AdvisingPanel,{teacherId:'teacher-1',teacherName:'อาจารย์ทดสอบ'}))});
 const root=renderer.root;
 await act(async()=>{await root.findByProps({'aria-label':'ลบ นักศึกษาทดสอบ ก'}).props.onClick()});
 const form=root.findByProps({'aria-label':'ตรวจสอบการลบนักศึกษา'});
 assert.match(textOf(form),/บันทึกการปรึกษา 1 ครั้ง/);
 assert.match(textOf(form),/แบบพิมพ์/);
 let confirm=form.findAllByType('button').find(x=>textOf(x)==='ลบรายชื่อนี้ถาวร');
 assert.equal(confirm.props.disabled,true);
 await act(async()=>{await form.props.onSubmit({preventDefault(){}})});
 assert.equal(deletes,0,'cannot submit without typing the number');
 const input=form.findByProps({'aria-label':'รหัสนักศึกษาเพื่อยืนยันการลบ'});
 await act(async()=>{input.props.onChange({target:{value:'S002'}})});
 confirm=form.findAllByType('button').find(x=>textOf(x)==='ลบรายชื่อนี้ถาวร');assert.equal(confirm.props.disabled,true);
 await act(async()=>{input.props.onChange({target:{value:'S001'}})});
 confirm=form.findAllByType('button').find(x=>textOf(x)==='ลบรายชื่อนี้ถาวร');assert.equal(confirm.props.disabled,false);
 await act(async()=>{await form.props.onSubmit({preventDefault(){}})});
 assert.equal(deletes,1);assert.deepEqual(records.advising_students.map(s=>s.id),[2]);
 assert.deepEqual(records.advising_participants.map(p=>p.student_id),[2]);assert.equal(records.advising_sessions.length,1);
 assert.equal(root.findAllByProps({'aria-label':'ลบ นักศึกษาทดสอบ ก'}).length,0);
 assert.equal(root.findAllByProps({'aria-label':'ลบ นักศึกษาทดสอบ ข'}).length,1);
 await act(async()=>renderer.unmount());
});
