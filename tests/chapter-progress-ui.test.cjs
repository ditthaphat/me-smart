const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const test=require('node:test');
const ts=require('typescript');
const React=require('react');
const {create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

const records={material_chapters:[],material_topics:[],teaching_materials:[{id:9,title:'ตำราทดสอบ'}]};
let serial=0;
function query(table){
 let action='select',payload=null,filters=[],range=null;
 const result=(single=false)=>{
  let matches=records[table].filter(row=>filters.every(([key,value])=>row[key]===value));
  if(action==='insert'){
   const values=Array.isArray(payload)?payload:[payload];
   matches=values.map(value=>({id:++serial,due_date:null,topic_status:'todo',...value}));
   records[table].push(...matches);
  }
  if(action==='update')matches.forEach(row=>Object.assign(row,payload));
  if(action==='delete'){
   records[table]=records[table].filter(row=>!matches.includes(row));
   if(table==='material_chapters')records.material_topics=records.material_topics.filter(topic=>!matches.some(row=>row.id===topic.chapter_id));
  }
  if(range)matches=matches.slice(range[0],range[1]+1);
  const data=matches.map(row=>({...row}));return {data:single?(data[0]??null):data,error:null};
 };
 const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},range(a,b){range=[a,b];return q;},
  insert(v){action='insert';payload=v;return q;},update(v){action='update';payload=v;return q;},delete(){action='delete';return q;},
  single(){return Promise.resolve(result(true));},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};
 return q;
}
const originalLoad=Module._load;
Module._load=function(request,parent){
 if(parent&&parent.filename.endsWith(path.join('src','app','ChapterProgressPanel.tsx'))){
  if(request==='../lib/supabase')return {db:()=>({from:query})};
  if(request.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
 }
 return originalLoad.apply(this,arguments);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const ChapterProgressPanel=require('../src/app/ChapterProgressPanel.tsx').default;Module._load=originalLoad;
const textOf=node=>node.children.flatMap(x=>typeof x==='string'?[x]:typeof x==='object'?textOf(x):[]).join('');
const button=(root,label)=>root.findAllByType('button').find(node=>textOf(node)===label);
const field=(root,label,type)=>root.findAllByType('label').find(node=>node.children.some(child=>typeof child==='string'&&child===label)).findByType(type);
const change=async(node,value)=>act(async()=>{await node.props.onChange({target:{value}});});
const click=async(node)=>act(async()=>{await node.props.onClick();});
const submit=async(node)=>act(async()=>{await node.props.onSubmit({preventDefault(){}});});

test('the author tracks incomplete topics, deadlines and progress without changing other records',async()=>{
 const dirtyStates=[];const onDirtyChange=value=>dirtyStates.push(value);
 let renderer;await act(async()=>{renderer=create(React.createElement(ChapterProgressPanel,{teacherId:'teacher-1',materialId:9,materialTitle:'ตำราทดสอบ',active:true,onBack(){},onDirtyChange}));});
 let root=renderer.root;
 assert.match(textOf(root.findByProps({'aria-label':'ติดตามความก้าวหน้ารายบท'})),/ยังคำนวณไม่ได้/);
 await click(button(root,'+ เพิ่มบท'));
 let form=root.findByProps({'aria-label':'เพิ่มบท'});
 await change(field(form,'ชื่อบท *','input'),'บทนำ');
 assert.equal(dirtyStates.at(-1),true);
 await change(field(form,'วันเป้าหมายแล้วเสร็จ','input'),'2020-01-01');
 await submit(form);
 assert.equal(dirtyStates.at(-1),false);
 assert.equal(records.material_chapters.length,1);
 assert.match(textOf(root.findByProps({'aria-label':'ติดตามความก้าวหน้ารายบท'})),/ยังไม่กำหนดหัวข้อ/);
 const topicArea=root.findByProps({placeholder:'เช่น 1.1 บทนำ\n1.2 ความเป็นมา'});
 await change(topicArea,'หัวข้อ ก\nหัวข้อ ข\nหัวข้อ ค');
 assert.equal(dirtyStates.at(-1),true);
 await submit(topicArea.parent.parent);
 assert.equal(dirtyStates.at(-1),false);
 assert.equal(records.material_topics.length,3);
 assert.match(textOf(root.findByProps({'aria-label':'ติดตามความก้าวหน้ารายบท'})),/เลยกำหนด/);
 await change(root.findByProps({'aria-label':'สถานะ หัวข้อ ก'}),'done');
 assert.match(textOf(root.findByProps({'aria-label':'ติดตามความก้าวหน้ารายบท'})),/33.3%/);
 await change(root.findByProps({'aria-label':'สถานะ หัวข้อ ข'}),'review');
 await change(root.findByProps({'aria-label':'สถานะ หัวข้อ ค'}),'done');
 assert.match(textOf(root.findByProps({'aria-label':'ติดตามความก้าวหน้ารายบท'})),/66.7%/);
 await act(async()=>renderer.unmount());
 await act(async()=>{renderer=create(React.createElement(ChapterProgressPanel,{teacherId:'teacher-1',materialId:9,materialTitle:'ตำราทดสอบ',active:true,onBack(){}}));});
 root=renderer.root;
 assert.match(textOf(root.findByProps({'aria-label':'ติดตามความก้าวหน้ารายบท'})),/66.7%/);
 await click(button(root,'จัดการหัวข้อ'));
 await change(root.findByProps({'aria-label':'สถานะ หัวข้อ ข'}),'done');
 assert.match(textOf(root.findByProps({'aria-label':'ติดตามความก้าวหน้ารายบท'})),/100%/);
 assert.doesNotMatch(textOf(root.findByProps({'aria-label':'ติดตามความก้าวหน้ารายบท'})),/หัวข้อ ข \(รอตรวจทาน\)/);
 await click(root.findByProps({'aria-label':'ลบบทที่ 1'}));
 form=root.findByProps({'aria-label':'ตรวจสอบการลบบทหรือหัวข้อ'});
 assert.match(textOf(form),/หัวข้อในบทนี้ 3 รายการ/);
 assert.equal(button(form,'ลบถาวร').props.disabled,true);
 await submit(form);assert.equal(records.material_chapters.length,1);
 await change(form.findByProps({'aria-label':'คำยืนยันลบบทหรือหัวข้อ'}),'ลบ');
 await submit(form);assert.equal(records.material_chapters.length,0);assert.equal(records.material_topics.length,0);
 assert.equal(records.teaching_materials.length,1);
 await act(async()=>renderer.unmount());
});
