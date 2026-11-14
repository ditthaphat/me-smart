const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/lib/gradebook.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const moduleCopy=new Module('gradebook-test',module);moduleCopy._compile(js,'gradebook-test.js');
const {assess,settingsExample,templateItems}=moduleCopy.exports;

test('attendance and grades stay provisional until every required mark is recorded',()=>{
 const settings={course_id:1,...settingsExample,expected_sessions:2,late_credit:0.5,leave_credit:1};
 const sessions=[{id:10,session_date:'2026-11-16',topic:''},{id:11,session_date:'2026-11-23',topic:''}];
 const entries=new Map([['10:s',{session_id:10,student_id:'s',status:'present'}],['11:s',{session_id:11,student_id:'s',status:'late'}]]);
 const items=[{id:1,course_id:1,category:'homework',title:'WS1',max_score:1,position:0},
  {id:2,course_id:1,category:'project',title:'Report',max_score:5,position:0},
  {id:3,course_id:1,category:'posttest',title:'CH1',max_score:20,position:0},
  {id:4,course_id:1,category:'midterm',title:'MID',max_score:20,position:0},
  {id:5,course_id:1,category:'final',title:'Final',max_score:20,position:0}];
 const marks=new Map([
  ['1:s',{item_id:1,student_id:'s',submitted:true,score:null}],
  ['2:s',{item_id:2,student_id:'s',submitted:null,score:5}],
  ['3:s',{item_id:3,student_id:'s',submitted:null,score:10}],
  ['4:s',{item_id:4,student_id:'s',submitted:null,score:20}],
 ]);
 let result=assess('s',sessions,entries,items,marks,settings);
 assert.equal(result.attendanceScore,7.5);
 assert.equal(result.partial,67.5);
 assert.equal(result.complete,false);
 assert.equal(result.grade,null);
 marks.set('5:s',{item_id:5,student_id:'s',submitted:null,score:20});
 result=assess('s',sessions,entries,items,marks,settings);
 assert.equal(result.partial,87.5);assert.equal(result.grade,'A');
 entries.delete('11:s');result=assess('s',sessions,entries,items,marks,settings);
 assert.equal(result.complete,false);assert.equal(result.grade,null,'an unrecorded class is not an absence or a final grade');
});

test('the example template includes the categories shown in the supplied sheet',()=>{
 const t=templateItems(1);
 assert.equal(t.filter(x=>x.category==='homework').length,12);
 assert.deepEqual(t.filter(x=>x.category==='project').map(x=>x.max_score),[10,5,5]);
 assert.equal(t.filter(x=>x.category==='posttest').length,12);
});
