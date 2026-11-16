const assert=require('node:assert/strict');
const fs=require('node:fs');const Module=require('node:module');const path=require('node:path');const test=require('node:test');const ts=require('typescript');const React=require('react');const {create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const records={research_projects:[],research_tasks:[]};let serial=0;
function query(table){let action='select',payload=null,filters=[];
 const result=(single=false)=>{let matches=records[table].filter(row=>filters.every(([key,value])=>row[key]===value));
  if(action==='insert'){matches=[{id:++serial,is_archived:false,created_at:'2026-11-16',...payload}];records[table].push(...matches);}
  if(action==='update')matches.forEach(row=>Object.assign(row,payload));
  if(action==='delete'){records[table]=records[table].filter(row=>!matches.includes(row));if(table==='research_projects')records.research_tasks=records.research_tasks.filter(t=>!matches.some(p=>p.id===t.project_id));}
  const data=matches.map(row=>({...row}));return {data:single?(data[0]??null):data,error:null};};
 const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},insert(v){action='insert';payload=v;return q;},update(v){action='update';payload=v;return q;},delete(){action='delete';return q;},single(){return Promise.resolve(result(true));},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};return q;}
const originalLoad=Module._load;
Module._load=function(request,parent){if(parent&&parent.filename.endsWith(path.join('src','app','ResearchPanel.tsx'))){if(request==='../lib/supabase')return {db:()=>({from:query})};if(request.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};}return originalLoad.apply(this,arguments);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const ResearchPanel=require('../src/app/ResearchPanel.tsx').default;Module._load=originalLoad;
const textOf=node=>node.children.flatMap(x=>typeof x==='string'?[x]:typeof x==='object'?textOf(x):[]).join('');
const button=(root,label)=>root.findAllByType('button').find(node=>textOf(node)===label);
const field=(root,label,type)=>root.findAllByType('label').find(node=>node.children.some(child=>typeof child==='string'&&child===label)).findByType(type);
const change=async(node,value)=>act(async()=>{node.props.onChange({target:{value}})});
const click=async(node)=>act(async()=>{await node.props.onClick()});
const submit=async(node)=>act(async()=>{node.props.onSubmit({preventDefault(){}})});

test('teacher creates a group, tracks weighted articles, edits, archives and deletes safely',async()=>{
 let renderer;await act(async()=>{renderer=create(React.createElement(ResearchPanel,{teacherId:'teacher-1',active:true}));});let root=renderer.root;
 assert.match(textOf(root),/ยังไม่มีโครงงาน/);
 await click(button(root,'+ เพิ่มโครงงาน'));
 let form=root.findByProps({'aria-label':'เพิ่มโครงงาน'});
 await change(field(form,'ชื่อโครงงาน / ชื่อกลุ่ม *','input'),'กลุ่มวิจัยทดสอบ');
 await change(field(form,'รายชื่อสมาชิก','textarea'),'นักศึกษา ก');
 await change(field(form,'ขั้นตอนโครงงาน','select'),'defended');
 await change(field(form,'วันเป้าหมายส่งบทความ','input'),'2027-02-15');
 await submit(form);
 assert.equal(records.research_projects.length,1);assert.equal(records.research_projects[0].project_stage,'defended');
 assert.match(textOf(root.findByProps({'aria-label':'รายละเอียดโครงงาน'})),/ยังไม่มีงาน/);
 await click(button(root,'+ เพิ่มงาน'));form=root.findByProps({'aria-label':'เพิ่มงาน'});
 await change(field(form,'ชื่องาน *','input'),'บทนำ');await change(field(form,'ประเภทงาน','select'),'article');await change(field(form,'ผู้รับผิดชอบ','input'),'นักศึกษา ก');await change(field(form,'ความก้าวหน้า 0–100%','input'),'20');
 await submit(form);assert.equal(records.research_tasks.length,1);
 await click(button(root,'+ เพิ่มงาน'));form=root.findByProps({'aria-label':'เพิ่มงาน'});
 await change(field(form,'ชื่องาน *','input'),'ผลและวิจารณ์');await change(field(form,'ประเภทงาน','select'),'article');await change(field(form,'ความก้าวหน้า 0–100%','input'),'100');await change(field(form,'น้ำหนักงาน','input'),'3');await submit(form);
 assert.match(textOf(root.findByProps({'aria-label':'รายละเอียดโครงงาน'})),/80%/);
 const table=root.findByProps({'aria-label':'รายละเอียดโครงงาน'});let row=table.findAllByType('tr').find(tr=>textOf(tr).includes('บทนำ'));
 await click(button(row,'แก้ไข'));form=root.findByProps({'aria-label':'แก้ไขงาน'});await change(field(form,'ความก้าวหน้า 0–100%','input'),'100');await submit(form);
 assert.match(textOf(root.findByProps({'aria-label':'รายละเอียดโครงงาน'})),/100%/);
 row=table.findAllByType('tr').find(tr=>textOf(tr).includes('บทนำ'));await click(button(row,'ลบ'));
 form=root.findByProps({'aria-label':'ยืนยันการลบงานวิจัย'});assert.equal(button(form,'ลบถาวร').props.disabled,true);await submit(form);assert.equal(records.research_tasks.length,2);
 await change(field(form,'พิมพ์คำว่า ลบ เพื่อยืนยัน','input'),'ลบ');await submit(form);assert.equal(records.research_tasks.length,1);
 await click(button(root,'เก็บถาวร'));assert.equal(records.research_projects[0].is_archived,true);
 const show=root.findAllByType('input').find(n=>n.props.type==='checkbox');await act(async()=>show.props.onChange({target:{checked:true}}));
 await click(button(root,'คืนโครงงาน'));assert.equal(records.research_projects[0].is_archived,false);
 const projectRow=root.findAllByType('tr').find(tr=>textOf(tr).includes('กลุ่มวิจัยทดสอบ'));await click(button(projectRow,'ลบ'));
 form=root.findByProps({'aria-label':'ยืนยันการลบงานวิจัย'});assert.match(textOf(form),/1 รายการ/);await change(field(form,'พิมพ์คำว่า ลบ เพื่อยืนยัน','input'),'ลบ');await submit(form);
 assert.equal(records.research_projects.length,0);assert.equal(records.research_tasks.length,0);
 await act(async()=>renderer.unmount());
});
