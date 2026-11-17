const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const test=require('node:test');
const ts=require('typescript');
const React=require('react');
const {create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

const course={id:1,code:'4112203',title:'Fluid Mechanics',term:'2/2569'};
const settings={course_id:1,expected_sessions:1,attendance_weight:10,homework_weight:10,project_weight:20,posttest_weight:20,midterm_weight:20,final_weight:20,late_credit:0.5,leave_credit:0,grade_a:80,grade_bplus:75,grade_b:70,grade_cplus:65,grade_c:60,grade_dplus:55,grade_d:50};
const fixtures={
 enrollments:[{course_id:1,student_id:'alice',status:'approved'},{course_id:1,student_id:'bob',status:'approved'}],
 attendance_sessions:[{id:10,course_id:1,session_date:'2026-11-17',topic:'คาบแรก',is_cancelled:false},{id:11,course_id:1,session_date:'2026-11-18',topic:'ยกเลิก',is_cancelled:true}],
 attendance_records:[{session_id:10,student_id:'alice',status:'present'},{session_id:10,student_id:'bob',status:'absent'}],
 gradebook_settings:[settings],
 gradebook_items:[
  {id:1,course_id:1,category:'homework',title:'WS1',max_score:1,position:1,is_archived:false},
  {id:2,course_id:1,category:'homework',title:'WS2',max_score:1,position:2,is_archived:false},
  {id:3,course_id:1,category:'homework',title:'WS3',max_score:1,position:3,is_archived:false},
  {id:4,course_id:1,category:'project',title:'รายงาน',max_score:5,position:1,is_archived:false},
  {id:5,course_id:1,category:'posttest',title:'สอบบท 1',max_score:20,position:1,is_archived:false},
  {id:6,course_id:1,category:'project',title:'รายการเก็บถาวร',max_score:5,position:2,is_archived:true}],
 gradebook_marks:[
  {course_id:1,item_id:1,student_id:'alice',submitted:true,score:null},
  {course_id:1,item_id:2,student_id:'alice',submitted:false,score:null},
  {course_id:1,item_id:4,student_id:'alice',submitted:null,score:4},
  {course_id:1,item_id:5,student_id:'alice',submitted:null,score:0},
  {course_id:1,item_id:4,student_id:'bob',submitted:null,score:999},
  {course_id:1,item_id:6,student_id:'alice',submitted:null,score:5}],
};
let failTable='';
const calls=[];
function query(table){
 const filters=[];let range=[0,499];
 const result=()=>{
  if(table===failTable)return {data:null,error:{message:'การเชื่อมต่อขัดข้อง'}};
  let rows=fixtures[table]??[];
  if(table==='enrollments'||table==='attendance_records'||table==='gradebook_marks')rows=rows.filter(row=>row.student_id==='alice');
  if(table==='gradebook_items')rows=rows.filter(row=>!row.is_archived);
  rows=rows.filter(row=>filters.every(f=>f.kind==='in'?f.value.includes(row[f.key]):row[f.key]===f.value)).slice(range[0],range[1]+1);
  return {data:rows,error:null};
 };
 const builder={
  select(){return this},eq(key,value){filters.push({kind:'eq',key,value});calls.push({table,key,value});return this},
  in(key,value){filters.push({kind:'in',key,value});return this},order(){return this},range(from,to){range=[from,to];return this},
  maybeSingle(){const r=result();return Promise.resolve({...r,data:r.data?.[0]??null});},
  then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);},
 };
 return builder;
}
const originalLoad=Module._load;
Module._load=function(request,parent){
 if(parent&&parent.filename.endsWith(path.join('src','app','StudentGradebook.tsx'))){
  if(request==='../lib/supabase')return {db:()=>({from:query})};
  if(request.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
 }
 return originalLoad.apply(this,arguments);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const StudentGradebook=require('../src/app/StudentGradebook.tsx').default;
Module._load=originalLoad;
const textOf=node=>node.children.flatMap(child=>typeof child==='string'?[child]:child&&typeof child==='object'?textOf(child):[]).join('');

test('student sees their own saved results, correct provisional totals and no editing controls',async()=>{
 let renderer;
 try{
  await act(async()=>{renderer=create(React.createElement(StudentGradebook,{course,userId:'alice'}));});
  const root=renderer.root, text=textOf(root);
  assert.ok(text.includes('ตารางคะแนนของฉัน'));
  assert.ok(text.includes('มาเรียน'));
  assert.ok(text.includes('ส่งแล้ว'));
  assert.ok(text.includes('ไม่ส่ง'));
  assert.ok(text.includes('ยังไม่บันทึก'));
  assert.ok(text.includes('4 / 5'));
  assert.ok(text.includes('0 / 20'),'zero is a recorded score');
  assert.ok(text.includes('29.33 / 100'),'student and teacher use the same weighted assessment');
  assert.ok(text.includes('ยังไม่สรุป'));
  assert.ok(!text.includes('999')&&!text.includes('รายการเก็บถาวร')&&!text.includes('ยกเลิก'));
  assert.equal(root.findAllByType('input').length,0,'students get no score editing fields');
  assert.equal(root.findAllByType('button').length,1,'only refresh is available');
  assert.ok(calls.some(c=>c.table==='gradebook_marks'&&c.key==='student_id'&&c.value==='alice'));
  failTable='gradebook_marks';
  await act(async()=>{root.findByType('button').props.onClick();});
  assert.ok(textOf(root).includes('โหลดผลคะแนนไม่สำเร็จ'));
  assert.ok(!textOf(root).includes('29.33 / 100'),'a failed reload clears stale marks');
 }finally{failTable='';if(renderer)await act(async()=>renderer.unmount());}
});

test('passing another student id or a course without approval cannot load a gradebook',async()=>{
 let renderer;
 try{
  await act(async()=>{renderer=create(React.createElement(StudentGradebook,{course,userId:'bob'}));});
  assert.ok(textOf(renderer.root).includes('ไม่พบสิทธิ์เข้าร่วมรายวิชานี้'));
  assert.ok(!textOf(renderer.root).includes('999'));
 }finally{if(renderer)await act(async()=>renderer.unmount());}
});
