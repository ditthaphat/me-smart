const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const test=require('node:test');
const ts=require('typescript');
const React=require('react');
const {create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

const records={material_publications:[],material_open_events:[]};
let serial=0, rejectClick=false, rejectStatus=false, lastTab=null, fallbackUrl='', activeStudent='student-a';
function query(table) {
  let action='select', payload=null, filters=[], slice=null;
  function result(single=false) {
    let rows=records[table].filter(row=>filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value));
    if(action==='insert'){
      if(table==='material_open_events' && rejectClick) return {data:null,error:{message:'permission denied'},count:null};
      if(table==='material_open_events' && records.material_open_events.some(row=>row.publication_id===payload.publication_id&&row.student_id===activeStudent)) return {data:null,error:{message:'MATERIAL_ALREADY_OPENED'},count:null};
      const row={id:++serial,created_at:'2026-11-15T00:00:00Z',...payload};
      if(table==='material_open_events')row.student_id=activeStudent;
      records[table].push(row); rows=[row];
    }
    if(action==='update') rows.forEach(row=>Object.assign(row,payload));
    const count=rows.length;
    if(slice)rows=rows.slice(slice[0],slice[1]+1);
    return {data:single?(rows[0]??null):rows.map(row=>({...row})),error:null,count};
  }
  const q={
    select(){return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},order(){return q;},
    range(a,b){slice=[a,b];return q;},insert(v){action='insert';payload=v;return q;},update(v){action='update';payload=v;return q;},
    single(){return Promise.resolve(result(true));},maybeSingle(){return Promise.resolve(result(true));},
    then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);},
  };
  return q;
}
const fakeDb={
  from:query,
  rpc:async(name,{p_publication_id,p_publication_ids})=>{
    if(name==='student_material_open_status'&&rejectStatus)return {data:null,error:{message:'status unavailable'}};
    if(name==='student_material_open_status')return {data:p_publication_ids.map(id=>({
      publication_id:id,
      already_opened:records.material_open_events.some(e=>e.publication_id===id&&e.student_id===activeStudent),
      student_id_available:true,
    })),error:null};
    assert.equal(name,'teacher_material_open_stats');
    const count=records.material_open_events.filter(e=>e.publication_id===p_publication_id&&e.student_id==='student-a').length;
    return {data:[
      {student_id:'student-a',student_number:'686040300125',full_name:'นักศึกษาทดสอบ ก',open_count:count,last_open:count?'2026-11-15T10:00:00Z':null},
      {student_id:'student-b',student_number:'675040300425',full_name:'นักศึกษาทดสอบ ข',open_count:0,last_open:null},
    ],error:null};
  },
};
global.window={
  confirm:()=>true,
  open:()=>{lastTab={opener:{},closed:false,location:{replace(value){lastTab.url=value;}},close(){lastTab.closed=true;}};return lastTab;},
  location:{assign(value){fallbackUrl=value;}},
};
const originalLoad=Module._load;
Module._load=function(request,parent){
  if(parent&&/\/(MaterialPublicationPanel|StudentMaterials)\.tsx$/.test(parent.filename)){
    if(request==='../lib/supabase')return {db:()=>fakeDb};
    if(request==='./Pagination')return {__esModule:true,default:()=>React.createElement('nav',null)};
    if(request.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  }
  return originalLoad.apply(this,arguments);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const Teacher=require('../src/app/MaterialPublicationPanel.tsx').default;
const Student=require('../src/app/StudentMaterials.tsx').default;
Module._load=originalLoad;
const textOf=node=>node.children.flatMap(x=>typeof x==='string'?[x]:typeof x==='object'?textOf(x):[]).join('');
const button=(root,label)=>root.findAllByType('button').find(node=>textOf(node)===label);
const click=async(node)=>act(async()=>{node.props.onClick();await Promise.resolve();await Promise.resolve();});

test('teacher publishes, student clicks, teacher sees current-roster counts, then unpublishes',async()=>{
  const source={id:8,course_id:5,title:'บทที่ 1',material_type:'lesson',material_status:'ready',version_label:'1',external_url:'https://example.com/chapter',is_archived:false};
  const courses=[{id:5,code:'4112203',title:'Fluid Mechanics',term:'2/2569'}];
  let teacher; await act(async()=>{teacher=create(React.createElement(Teacher,{teacherId:'teacher-1',source,courseName:'4112203',onBack(){}}));});
  assert.match(textOf(teacher.root),/ยังไม่เผยแพร่ให้นักศึกษา/);
  await click(button(teacher.root,'เผยแพร่ให้นักศึกษา'));
  assert.equal(records.material_publications[0].is_published,true);
  assert.doesNotMatch(JSON.stringify(records.material_publications[0]),/notes|private/);
  assert.match(textOf(teacher.root),/0\/2/);
  const studentRows=teacher.root.findByType('tbody').findAllByType('tr');
  assert.match(textOf(studentRows[0]),/675040300425/);
  assert.match(textOf(studentRows[1]),/686040300125/);
  let student; await act(async()=>{student=create(React.createElement(Student,{course:courses[0]}));});
  assert.match(textOf(student.root),/บทที่ 1/);
  await click(button(student.root,'เปิดเอกสาร ↗'));
  assert.equal(records.material_open_events.length,1);
  assert.equal(lastTab.url,'https://example.com/chapter');
  assert.equal(lastTab.opener,null);
  assert.equal(button(student.root,'เคยกดเปิดแล้ว').props.disabled,true);
  await click(button(teacher.root,'อัปเดตสถิติ'));
  assert.match(textOf(teacher.root),/1\/2/);
  assert.match(textOf(teacher.root),/50%/);
  assert.match(textOf(teacher.root),/ยังไม่เคยกด/);
  activeStudent='student-b';
  let secondStudent; await act(async()=>{secondStudent=create(React.createElement(Student,{course:courses[0]}));});
  await click(button(teacher.root,'หยุดเผยแพร่'));
  assert.equal(records.material_publications[0].is_published,false);
  rejectClick=true;
  await click(button(secondStudent.root,'เปิดเอกสาร ↗'));
  assert.equal(records.material_open_events.length,1);
  assert.equal(lastTab.closed,true);
  assert.match(textOf(secondStudent.root),/บันทึกการขอเปิดไม่สำเร็จ/);
  assert.equal(secondStudent.root.findAllByType('article').length,0);
  await act(async()=>{teacher.unmount();student.unmount();secondStudent.unmount();});
});

test('popup-blocked browsers still navigate after the request was recorded',async()=>{
  records.material_publications[0].is_published=true; rejectClick=false; activeStudent='student-b';
  window.open=()=>null;
  let student; await act(async()=>{student=create(React.createElement(Student,{course:{id:5,code:'4112203',title:'Fluid Mechanics',term:'2/2569'}}));});
  await click(button(student.root,'เปิดเอกสาร ↗'));
  assert.equal(records.material_open_events.length,2);
  assert.equal(fallbackUrl,'https://example.com/chapter');
  assert.equal(button(student.root,'เคยกดเปิดแล้ว').props.disabled,true);
  await act(async()=>student.unmount());
});

test('student document lists are scoped to the selected course',async()=>{
  records.material_publications=[
    {id:51,course_id:5,title:'เอกสารของไหล',material_type:'lesson',version_label:'',external_url:'https://example.com/fluid',is_published:true},
    {id:52,course_id:7,title:'เอกสาร CAE',material_type:'slides',version_label:'',external_url:'https://example.com/cae',is_published:true},
    {id:53,course_id:5,title:'เอกสารยังไม่เผยแพร่',material_type:'lesson',version_label:'',external_url:'https://example.com/private',is_published:false},
  ];
  let first,second;
  try{
    await act(async()=>{first=create(React.createElement(Student,{course:{id:5,code:'4112203',title:'Fluid',term:'2/2569'}}));});
    assert.match(textOf(first.root),/เอกสารของไหล/);
    assert.doesNotMatch(textOf(first.root),/เอกสาร CAE|เอกสารยังไม่เผยแพร่/);
    await act(async()=>{second=create(React.createElement(Student,{course:{id:7,code:'4111307',title:'CAE',term:'2/2569'}}));});
    assert.match(textOf(second.root),/เอกสาร CAE/);
    assert.doesNotMatch(textOf(second.root),/เอกสารของไหล|เอกสารยังไม่เผยแพร่/);
  }finally{if(first)await act(async()=>first.unmount());if(second)await act(async()=>second.unmount());}
});

test('cancelled clicks do not spend the allowance and another tab is detected',async()=>{
  records.material_publications=[{id:81,course_id:5,title:'เอกสารทดสอบ',material_type:'lesson',version_label:'',external_url:'https://example.com/test',is_published:true}];
  activeStudent='student-c'; rejectClick=false; rejectStatus=false;
  window.open=()=>{lastTab={opener:{},closed:false,location:{replace(value){lastTab.url=value;}},close(){lastTab.closed=true;}};return lastTab;};
  window.confirm=()=>false;
  let student; await act(async()=>{student=create(React.createElement(Student,{course:{id:5,code:'4112203',title:'Fluid',term:'2/2569'}}));});
  const count=records.material_open_events.length;
  await click(button(student.root,'เปิดเอกสาร ↗'));
  assert.equal(records.material_open_events.length,count);
  window.confirm=()=>true;
  records.material_open_events.push({publication_id:81,student_id:'student-c'});
  await click(button(student.root,'เปิดเอกสาร ↗'));
  assert.equal(records.material_open_events.length,count+1);
  assert.equal(lastTab.closed,true);
  assert.match(textOf(student.root),/เอกสารนี้เคยกดเปิดผ่าน ME-Smart แล้ว/);
  assert.equal(button(student.root,'เคยกดเปิดแล้ว').props.disabled,true);
  await act(async()=>student.unmount());
});

test('status lookup failure does not allow opening a document',async()=>{
  activeStudent='student-d'; rejectStatus=true;
  let student; await act(async()=>{student=create(React.createElement(Student,{course:{id:5,code:'4112203',title:'Fluid',term:'2/2569'}}));});
  assert.match(textOf(student.root),/โหลดเอกสารไม่สำเร็จ/);
  assert.equal(button(student.root,'เปิดเอกสาร ↗'),undefined);
  rejectStatus=false;
  await act(async()=>student.unmount());
});
