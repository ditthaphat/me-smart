const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),path=require('node:path'),test=require('node:test'),ts=require('typescript'),React=require('react'),{create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let user=null,signupPayload=null,memberStatus=null,reportRows=[],sent=[];
const prof={id:'student-1',full_name:'นักศึกษาทดสอบ',student_id:'S001',role:'research_student'};
function query(table){let action='select',payload,filters=[];function result(single=false){if(table==='profiles')return {data:prof,error:null};let rows=reportRows.filter(row=>filters.every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v));if(action==='insert'){rows=[{id:1,author_id:'student-1',status:'pending',feedback:'',created_at:'2026-11-17',...payload}];reportRows.push(...rows)}return {data:single?(rows[0]??null):rows,error:null}}
 const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(k,v){filters.push([k,v]);return q},order(){return q},insert(v){action='insert';payload=v;return q},single(){return Promise.resolve(result(true))},then(a,b){return Promise.resolve(result()).then(a,b)}};return q;}
const fakeDb={auth:{getUser:async()=>({data:{user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signUp:async v=>{signupPayload=v;return {error:null}},signInWithPassword:async()=>({error:null}),signOut:async()=>{user=null;return {error:null}}},from:query,rpc:async(name,args)=>{sent.push([name,args]);if(name==='my_research_projects')return {data:memberStatus?[{project_id:42,title:'โครงงานทดสอบ',article_title:'บทความ',publication_target:'',article_due_date:null,membership_status:memberStatus}]:[],error:null};if(name==='request_research_membership'){memberStatus='pending';return {data:'pending',error:null}}if(name==='my_research_tasks')return {data:[{id:7,project_id:42,title:'เขียนบทนำ',category:'article',assignee:'นักศึกษาทดสอบ',start_date:null,due_date:null,progress:20,notes:'ส่งฉบับร่าง',external_url:'',assigned_to:'student-1'}],error:null};throw Error(name)}};
const original=Module._load;Module._load=function(request,parent){if(parent&&parent.filename.endsWith(path.join('src','app','research','page.tsx'))){if(request==='../../lib/supabase')return {db:()=>fakeDb};if(request.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}}return original.apply(this,arguments)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const Page=require('../src/app/research/page.tsx').default;Module._load=original;
const textOf=n=>n.children.flatMap(x=>typeof x==='string'?[x]:typeof x==='object'?textOf(x):[]).join('');
const button=(r,label)=>r.findAllByType('button').find(n=>textOf(n)===label);
const field=(r,label,type)=>r.findAllByType('label').find(n=>n.children.some(c=>typeof c==='string'&&c===label)).findByType(type);
const change=async(n,value)=>act(async()=>n.props.onChange({target:{value}}));const click=async(n)=>act(async()=>n.props.onClick());const submit=async(n)=>act(async()=>n.props.onSubmit({preventDefault(){}}));

test('new project student registers a research-only account and is told to confirm email',async()=>{
 user=null;signupPayload=null;let renderer;await act(async()=>{renderer=create(React.createElement(Page))});const r=renderer.root;
 await click(button(r,'สมัครบัญชีงานวิจัย'));let f=r.findByProps({'aria-label':'เข้าสู่ระบบงานวิจัย'});
 await change(field(f,'ชื่อ–นามสกุล','input'),'นักศึกษาทดสอบ');await change(field(f,'รหัสนักศึกษา','input'),'S001');await change(field(f,'อีเมล','input'),'student@example.edu');await change(field(f,'รหัสผ่าน','input'),'pass1234');await submit(f);
 assert.equal(signupPayload.options.data.account_type,'research');assert.match(textOf(r),/ตรวจอีเมล/);await act(async()=>renderer.unmount());
});
test('student requests a separate research project and reports work after approval',async()=>{
 user={id:'student-1'};memberStatus=null;reportRows=[];sent=[];let renderer;await act(async()=>{renderer=create(React.createElement(Page))});let r=renderer.root;
 assert.doesNotMatch(textOf(r),/เข้าร่วมรายวิชาและรออาจารย์อนุมัติ/);
 let f=r.findByProps({'aria-label':'ขอเข้าร่วมโครงงาน'});await change(field(f,'หมายเลขโครงงาน','input'),'42');await change(field(f,'รหัสเข้าร่วมโครงงาน','input'),'Research_123');await submit(f);
 assert.equal(memberStatus,'pending');assert.match(textOf(r),/รออาจารย์อนุมัติ/);await act(async()=>renderer.unmount());
 memberStatus='approved';await act(async()=>{renderer=create(React.createElement(Page))});r=renderer.root;await click(button(r,'ดูงานของกลุ่ม'));
 assert.match(textOf(r),/เขียนบทนำ/);assert.match(textOf(r),/อาจารย์รับรองแล้ว: 20%/);await click(button(r,'รายงานความก้าวหน้า'));
 f=r.findByProps({'aria-label':'รายงานความก้าวหน้า'});await change(field(f,'ความก้าวหน้าที่เสนอ 0–100%','input'),'60');await change(field(f,'รายละเอียด / ปัญหาที่พบ','textarea'),'ฉบับร่าง');await submit(f);
 assert.equal(reportRows[0].progress,60);assert.match(textOf(r),/รออาจารย์ตรวจ/);assert.match(textOf(r),/อาจารย์รับรองแล้ว: 20%/);
 await act(async()=>renderer.unmount());
});
