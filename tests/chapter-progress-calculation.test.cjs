const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/lib/chapter-progress.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const loaded=new Module('chapter-progress-test',module); loaded._compile(js,'chapter-progress-test.js');
const {summarizeChapters,bangkokDate}=loaded.exports;

test('progress counts completed topics equally and never fabricates progress for empty chapters',()=>{
 const chapters=[{id:1,material_id:1,chapter_number:1,title:'บทนำ',due_date:'2026-11-14'},
  {id:2,material_id:1,chapter_number:2,title:'พื้นฐาน',due_date:'2026-11-20'},
  {id:3,material_id:1,chapter_number:3,title:'ยังไม่วางแผน',due_date:'2026-11-14'}];
 const topics=[{id:1,material_id:1,chapter_id:1,title:'หัวข้อ ก',topic_status:'done'},
  {id:2,material_id:1,chapter_id:1,title:'หัวข้อ ข',topic_status:'writing'},
  {id:3,material_id:1,chapter_id:1,title:'หัวข้อ ค',topic_status:'review'},
  {id:4,material_id:1,chapter_id:2,title:'หัวข้อ ง',topic_status:'done'}];
 const result=summarizeChapters(chapters,topics,'2026-11-15');
 assert.equal(result.total,4);assert.equal(result.completed,2);assert.equal(result.percent,50,'overall progress is weighted by topic, not by chapter');
 assert.equal(result.summaries[0].percent,33.3);assert.equal(result.summaries[0].state,'overdue');
 assert.equal(result.summaries[1].percent,100);assert.equal(result.summaries[1].state,'done');
 assert.equal(result.summaries[2].percent,null);assert.equal(result.summaries[2].state,'unplanned');
 assert.equal(result.overdue,1);assert.equal(result.unplanned,1);
 assert.equal(summarizeChapters([chapters[2]],[],'2026-11-15').percent,null);
 const many=Array.from({length:2000},(_,i)=>({id:i,material_id:1,chapter_id:1,title:'หัวข้อ',topic_status:i===1999?'todo':'done'}));
 assert.equal(summarizeChapters([chapters[0]],many,'2026-11-15').percent,99.9,'an unfinished item must never round to 100%');
});

test('deadline states use the Bangkok calendar and do not invent dates',()=>{
 assert.equal(bangkokDate(new Date('2026-11-15T16:59:00Z')),'2026-11-15');
 assert.equal(bangkokDate(new Date('2026-11-15T17:00:00Z')),'2026-11-16');
 const chapters=[{id:1,material_id:1,chapter_number:1,title:'วันนี้',due_date:'2026-11-16'},{id:2,material_id:1,chapter_number:2,title:'ไม่มีกำหนด',due_date:null},{id:3,material_id:1,chapter_number:3,title:'เสร็จแล้ว',due_date:'2026-11-15'}];
 const topics=chapters.map((chapter,i)=>({id:i+1,material_id:1,chapter_id:chapter.id,title:'ทดสอบ',topic_status:i===2?'done':'todo'}));
 const result=summarizeChapters(chapters,topics,'2026-11-16');
 assert.deepEqual(result.summaries.map(row=>row.state),['due_today','not_started','done']);
 assert.equal(result.overdue,0);
});
