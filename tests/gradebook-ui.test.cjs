const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const test=require('node:test');
const ts=require('typescript');
const React=require('react');
const {create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

const student='student-1';
const settings={course_id:1,expected_sessions:1,attendance_weight:10,homework_weight:10,project_weight:20,posttest_weight:20,midterm_weight:20,final_weight:20,late_credit:0.5,leave_credit:0,grade_a:80,grade_bplus:75,grade_b:70,grade_cplus:65,grade_c:60,grade_dplus:55,grade_d:50};
const fixtures={
 attendance_sessions:[{id:10,session_date:'2026-11-16',topic:'คาบแรก'}],
 enrollments:[{student_id:student,profiles:{full_name:'นักศึกษาทดสอบ',student_id:'TEST001'}}],
 attendance_records:[{session_id:10,student_id:student,status:'present'}],
 gradebook_settings:[settings],
 gradebook_items:[{id:1,course_id:1,category:'homework',title:'WS1',max_score:1,position:0,is_archived:false},{id:2,course_id:1,category:'project',title:'Report',max_score:5,position:0,is_archived:false}],
 gradebook_marks:[],
};
let failSave=false;
function query(table){
 let action='read',payload=null;
 const builder={
  select(){return this},eq(){return this},in(){return this},order(){return this},range(){return this},
  upsert(value){action='upsert';payload=value;return this},
  delete(){action='delete';return this},
  maybeSingle(){return Promise.resolve({data:fixtures[table][0]??null,error:null})},
  single(){
   if(failSave)return Promise.resolve({data:null,error:{message:'simulated failure'}});
   if(action==='upsert'){
    fixtures[table]=fixtures[table].filter(x=>x.item_id!==payload.item_id||x.student_id!==payload.student_id);
    fixtures[table].push({...payload});return Promise.resolve({data:{...payload},error:null});
   }
   return Promise.resolve({data:fixtures[table][0]??null,error:null});
  },
  then(resolve,reject){return Promise.resolve({data:fixtures[table]??[],error:null}).then(resolve,reject)},
 };
 return builder;
}
const gradebookFile=path.join(__dirname,'../src/lib/gradebook.ts');
const copy=new Module('gradebook-logic',module);
copy._compile(ts.transpileModule(fs.readFileSync(gradebookFile,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'gradebook-logic.js');
const originalLoad=Module._load;
Module._load=function(request,parent){
 if(parent&&parent.filename.endsWith(path.join('src','app','GradebookPanel.tsx'))){
  if(request==='../lib/supabase')return {db:()=>({from:query})};
  if(request==='../lib/messages')return {userMessage:e=>e.message??String(e)};
  if(request==='../lib/excel-export')return {downloadExcel:async()=>{}};
  if(request==='../lib/gradebook')return copy.exports;
  if(request==='./Pagination')return {__esModule:true,default:()=>null};
  if(request.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
 }
 return originalLoad.apply(this,arguments);
};
require.extensions['.tsx']=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const GradebookPanel=require('../src/app/GradebookPanel.tsx').default;
Module._load=originalLoad;
const textOf=node=>node.children.flatMap(x=>typeof x==='string'?[x]:typeof x==='object'?textOf(x):[]).join('');

test('teacher sees live attendance and saved homework and score after reloading the panel',async()=>{
 let renderer;await act(async()=>{renderer=create(React.createElement(GradebookPanel,{courseId:1,courseCode:'4112203',refreshVersion:0}))});
 const root=renderer.root;
 assert.equal(root.findAll(x=>x.type==='td'&&x.props.title==='มาเรียน').length,1);
 let checkbox=root.findByProps({'aria-label':'WS1 นักศึกษาทดสอบ ส่งแล้ว'});
 assert.equal(checkbox.props.checked,false);
 await act(async()=>{await checkbox.props.onChange({target:{checked:true}})});
 assert.equal(fixtures.gradebook_marks.find(m=>m.item_id===1).submitted,true);
 const score=root.findByProps({'aria-label':'Report นักศึกษาทดสอบ'});
 await act(async()=>{score.props.onChange({target:{value:'4'}})});
 await act(async()=>{await score.props.onBlur({target:{value:'4'}})});
 assert.equal(fixtures.gradebook_marks.find(m=>m.item_id===2).score,4);
 const headings=root.findAllByType('th').map(textOf);
 assert.ok(headings.some(x=>x.includes('คะแนนเข้าเรียน')));
 assert.ok(headings.some(x=>x.includes('คะแนนการบ้าน')));
 assert.ok(headings.some(x=>x.includes('คะแนนโครงงาน')));
 const row=root.findAllByType('tr').find(x=>textOf(x).includes('TEST001'));
 const cells=row.findAllByType('td').map(textOf);
 assert.ok(cells[5].startsWith('10.00'),'attendance subtotal uses the configured weight');
 assert.ok(cells[6].startsWith('10.00'),'homework subtotal reflects submitted work');
 assert.ok(cells[7].startsWith('16.00'),'project subtotal reflects 4 of 5 points');
 assert.ok(cells[11].startsWith('36.00'),'the running total is the sum of weighted categories');
 const refresh=root.findAllByType('button').find(b=>textOf(b)==='↻ อัปเดต');
 await act(async()=>{await refresh.props.onClick()});
 checkbox=root.findByProps({'aria-label':'WS1 นักศึกษาทดสอบ ส่งแล้ว'});
 assert.equal(checkbox.props.checked,true);
 assert.equal(root.findByProps({'aria-label':'Report นักศึกษาทดสอบ'}).props.value,'4');
 assert.ok(root.findAll(x=>x.type==='small'&&textOf(x)==='ยังไม่ครบ').length>0);
 failSave=true;
 await act(async()=>{await checkbox.props.onChange({target:{checked:false}})});
 assert.equal(fixtures.gradebook_marks.find(m=>m.item_id===1).submitted,true,'a failed request must not silently change the saved mark');
 assert.ok(root.findAll(x=>x.props.role==='alert'&&textOf(x).includes('บันทึกไม่สำเร็จ')).length);
 failSave=false;await act(async()=>renderer.unmount());
});
