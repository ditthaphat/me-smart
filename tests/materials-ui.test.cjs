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
  courses: [{ id: 5, teacher_id: 'teacher-1', code: '4112203', title: 'Fluid Mechanics', term: '2/2569' }, { id: 6, teacher_id: 'other', code: '4111307', title: 'CAE', term: '2/2569' }],
  teaching_materials: [],
  advising_sessions: [{ id: 44, discussion: 'ตัวอย่าง' }],
};
let serial = 0;
function query(table) {
  let action = 'select', payload = null, filters = [], range = null;
  const result = (single = false) => {
    let matches = records[table].filter(row=>filters.every(([key,value])=>value && typeof value==='object' && 'term' in value ? String(row[key]).toLowerCase().includes(value.term) : row[key]===value));
    if (action === 'insert') { const row={id:++serial,is_archived:false,created_at:'2026-11-15T00:00:00Z',...payload}; records[table].push(row); matches=[row]; }
    if (action === 'update') matches.forEach(row=>Object.assign(row,payload));
    if (action === 'delete') records[table]=records[table].filter(row=>!matches.includes(row));
    const count=matches.length;
    if (range) matches=matches.slice(range[0],range[1]+1);
    const data=matches.map(row=>({...row}));
    return {data:single?(data[0]??null):data,count,error:null};
  };
  const q = {
    select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},
    ilike(k,v){const term=v.slice(1,-1).replace(/\\([\\%_])/g,'$1').toLowerCase();filters.push([k,{term}]);return q;},
    range(a,b){range=[a,b];return q;},insert(v){action='insert';payload=v;return q;},
    update(v){action='update';payload=v;return q;},delete(){action='delete';return q;},
    single(){return Promise.resolve(result(true));},
    then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);},
  };
  return q;
}
const originalLoad=Module._load;
Module._load=function(request,parent){
  if(parent&&parent.filename.endsWith(path.join('src','app','MaterialsPanel.tsx'))){
    if(request==='../lib/supabase')return {db:()=>({from:query})};
    if(request==='./Pagination')return {__esModule:true,default:({page,total,onChange})=>React.createElement('nav',null,React.createElement('span',null,`หน้า ${page+1} จาก ${total}`),React.createElement('button',{type:'button',onClick:()=>onChange(page+1)},'ถัดไป'))};
    if(request==='./ChapterProgressPanel')return {__esModule:true,default:({materialTitle,onBack})=>React.createElement('section',{'data-testid':'progress-panel'},materialTitle,React.createElement('button',{type:'button',onClick:onBack},'กลับ'))};
    if(request.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  }
  return originalLoad.apply(this,arguments);
};
require.extensions['.tsx']=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const MaterialsPanel=require('../src/app/MaterialsPanel.tsx').default; Module._load=originalLoad;
const textOf=node=>node.children.flatMap(x=>typeof x==='string'?[x]:typeof x==='object'?textOf(x):[]).join('');
const button=(root,label)=>root.findAllByType('button').find(node=>textOf(node)===label);
const inputIn=(form,label,type)=>form.findAllByType('label').find(node=>node.children.some(c=>typeof c==='string'&&c===label)).findByType(type);
const change=async(node,value)=>act(async()=>{node.props.onChange({target:{value}});});
const submit=async(form)=>act(async()=>{await form.props.onSubmit({preventDefault(){}});});

test('teacher manages an external teaching document without uploading or losing other data',async()=>{
  let renderer; await act(async()=>{renderer=create(React.createElement(MaterialsPanel,{teacherId:'teacher-1',active:true}));});
  let root=renderer.root;
  assert.match(textOf(root.findByProps({'aria-label':'เอกสารการสอน'})),/เฉพาะอาจารย์เจ้าของข้อมูล/);
  await act(async()=>{button(root,'+ เพิ่มเอกสาร').props.onClick();});
  let form=root.findByProps({'aria-label':'เพิ่มเอกสาร'});
  await change(inputIn(form,'ชื่อเอกสาร *','input'),'ตำรากลศาสตร์ของไหล');
  await change(inputIn(form,'รายวิชา','select'),'5');
  await change(inputIn(form,'ประเภทเอกสาร','select'),'textbook');
  await change(inputIn(form,'สถานะ','select'),'ready');
  await change(inputIn(form,'เวอร์ชัน','input'),'1.0');
  await change(inputIn(form,'ลิงก์ไฟล์','input'),'javascript:alert(1)');
  await submit(form); assert.equal(records.teaching_materials.length,0);
  assert.match(textOf(root.findByProps({role:'alert'})),/https/);
  await change(inputIn(form,'ลิงก์ไฟล์','input'),'https://user:password@example.com/');
  await submit(form); assert.equal(records.teaching_materials.length,0);
  await change(inputIn(form,'ลิงก์ไฟล์','input'),'https://drive.google.com/file/d/example/view');
  await submit(form); assert.equal(records.teaching_materials.length,1);
  assert.equal(records.teaching_materials[0].course_id,5);
  let link=root.findByType('a'); assert.equal(link.props.href,'https://drive.google.com/file/d/example/view'); assert.equal(link.props.rel,'noopener noreferrer');
  await act(async()=>{button(root,'ติดตามรายบท').props.onClick();});
  assert.match(textOf(root.findByProps({'data-testid':'progress-panel'})),/ตำรากลศาสตร์ของไหล/);
  await act(async()=>{button(root,'กลับ').props.onClick();});
  await act(async()=>{button(root,'แก้ไข').props.onClick();});
  form=root.findByProps({'aria-label':'แก้ไขเอกสาร'});
  await change(inputIn(form,'เวอร์ชัน','input'),'2.0');
  await change(inputIn(form,'สถานะ','select'),'review');
  await submit(form); assert.equal(records.teaching_materials[0].version_label,'2.0');
  assert.equal(records.teaching_materials[0].material_status,'review');
  await act(async()=>renderer.unmount());
  await act(async()=>{renderer=create(React.createElement(MaterialsPanel,{teacherId:'teacher-1',active:true}));});
  root=renderer.root;
  assert.match(textOf(root.findByProps({'aria-label':'เอกสารการสอน'})),/เวอร์ชัน 2.0/);
  await act(async()=>{await button(root,'เก็บถาวร').props.onClick();});
  assert.equal(records.teaching_materials[0].is_archived,true);
  const archived=root.findAllByType('input').find(node=>node.props.type==='checkbox');
  await act(async()=>{archived.props.onChange({target:{checked:true}});});
  await act(async()=>{root.findByProps({'aria-label':'ลบ ตำรากลศาสตร์ของไหล'}).props.onClick();});
  form=root.findByProps({'aria-label':'ตรวจสอบการลบเอกสาร'});
  assert.match(textOf(form),/ไฟล์ต้นฉบับ/); assert.match(textOf(form),/ความก้าวหน้าของบทและหัวข้อ/);
  assert.equal(button(form,'ลบรายการนี้ถาวร').props.disabled,true);
  await submit(form); assert.equal(records.teaching_materials.length,1);
  await change(form.findByProps({'aria-label':'คำยืนยันลบเอกสาร'}),'ลบ');
  assert.equal(button(form,'ลบรายการนี้ถาวร').props.disabled,false);
  await submit(form); assert.equal(records.teaching_materials.length,0);
  assert.equal(records.courses.length,2); assert.equal(records.advising_sessions.length,1);
  await act(async()=>renderer.unmount());
});

test('teacher can page and filter their document list',async()=>{
  records.teaching_materials=Array.from({length:12},(_,i)=>({id:100+i,owner_id:'teacher-1',course_id:5,title:`บทที่ ${i+1}`,material_type:'lesson',material_status:'draft',version_label:'',external_url:'',notes:'',is_archived:false,created_at:'2026-11-15T00:00:00Z'}));
  records.teaching_materials.push({id:999,owner_id:'other',course_id:6,title:'ของผู้อื่น',material_type:'lesson',material_status:'ready',version_label:'',external_url:'',notes:'',is_archived:false,created_at:'2026-11-15T00:00:00Z'});
  let renderer; await act(async()=>{renderer=create(React.createElement(MaterialsPanel,{teacherId:'teacher-1',active:true}));});
  const root=renderer.root;
  assert.equal(root.findAllByType('article').length,10);
  await act(async()=>{button(root,'ถัดไป').props.onClick();});
  assert.equal(root.findAllByType('article').length,2);
  const search=root.findByProps({placeholder:'ค้นหาชื่อเอกสาร'});
  await change(search,'บทที่ 11');
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,300));});
  assert.equal(root.findAllByType('article').length,1);
  assert.match(textOf(root.findByType('article')),/บทที่ 11/);
  assert.doesNotMatch(textOf(root.findByProps({'aria-label':'เอกสารการสอน'})),/ของผู้อื่น/);
  await act(async()=>{button(root,'+ เพิ่มเอกสาร').props.onClick();});
  const form=root.findByProps({'aria-label':'เพิ่มเอกสาร'});
  await change(inputIn(form,'ชื่อเอกสาร *','input'),'เอกสารที่เพิ่มขณะค้นหา');
  await submit(form);
  assert.equal(root.findByProps({placeholder:'ค้นหาชื่อเอกสาร'}).props.value,'');
  assert.equal(records.teaching_materials.filter(row=>row.owner_id==='teacher-1').length,13);
  await act(async()=>renderer.unmount());
});
