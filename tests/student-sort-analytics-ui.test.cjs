const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const test=require('node:test');
const ts=require('typescript');
const React=require('react');
const {create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

const fixtures={
  attendance_sessions:[{id:10,session_date:'2026-11-16',topic:'คาบเรียน'}],
  enrollments:[
    {student_id:'high',profiles:{full_name:'นักศึกษารหัสสูง',student_id:'686040300125'}},
    {student_id:'low',profiles:{full_name:'นักศึกษารหัสต่ำ',student_id:'675040300425'}},
  ],
  attendance_records:[
    {session_id:10,student_id:'high',status:'present',note:''},
    {session_id:10,student_id:'low',status:'late',note:''},
  ],
};
let excelReport;
function query(table){
 const q={select(){return q},eq(){return q},in(){return q},order(){return q},range(){return q},
   then(resolve,reject){return Promise.resolve({data:fixtures[table]??[],error:null}).then(resolve,reject)}};
 return q;
}
const originalLoad=Module._load;
Module._load=function(request,parent){
 if(parent&&parent.filename.endsWith(path.join('src','app','AttendanceAnalytics.tsx'))){
  if(request==='../lib/supabase')return {db:()=>({from:query})};
  if(request==='../lib/messages')return {userMessage:e=>e.message??String(e)};
  if(request==='../lib/excel-export')return {downloadExcel:async(_name,sheets)=>{excelReport=sheets;}};
  if(request==='./Pagination')return {__esModule:true,default:()=>null};
  if(request.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
 }
 return originalLoad.apply(this,arguments);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const Analytics=require('../src/app/AttendanceAnalytics.tsx').default;
Module._load=originalLoad;
const textOf=node=>node.children.flatMap(x=>typeof x==='string'?[x]:typeof x==='object'?textOf(x):[]).join('');

test('attendance analytics and its workbook use ascending student IDs without mixing records',async()=>{
 let renderer;
 try{
  await act(async()=>{renderer=create(React.createElement(Analytics,{courseId:1,courseCode:'4112203'}));});
  const root=renderer.root,rows=root.findByType('tbody').findAllByType('tr');
  assert.match(textOf(rows[0]),/675040300425/);
  assert.match(textOf(rows[1]),/686040300125/);
  const exportButton=root.findAllByType('button').find(button=>textOf(button).includes('Excel')&&!textOf(button).includes('รายบุคคล'));
  assert.ok(exportButton);
  await act(async()=>{await exportButton.props.onClick();});
  assert.deepEqual(excelReport[0].rows.map(row=>row[2]),['675040300425','686040300125']);
  assert.deepEqual(excelReport[1].rows.map(row=>[row[4],row[5]]),[['675040300425','สาย'],['686040300125','มาเรียน']]);
 }finally{if(renderer)await act(async()=>renderer.unmount());}
});
