const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const test=require('node:test');
const ts=require('typescript');
const React=require('react');
const {create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window={location:{origin:'https://example.test',search:'?session=101&token=test-token'},confirm:()=>true};
Object.defineProperty(globalThis,'navigator',{value:{geolocation:{getCurrentPosition(ok){ok({coords:{latitude:13.7563,longitude:100.5018,accuracy:5}})}}},configurable:true});

let user=null,profile=null;
let calls=[];
function query(table){
 const result=()=>{
  if(table==='profiles')return {data:profile,error:null};
  if(table==='attendance_records')return {data:null,error:null};
  if(table==='attendance_sessions')return {data:{session_date:'2026-11-16',topic:'Test',is_cancelled:false,course_id:1},error:null};
  return {data:[],error:null};
 };
 return {select(){return this},eq(){return this},order(){return this},single(){return Promise.resolve(result())},maybeSingle(){return Promise.resolve(result())},then(ok,err){return Promise.resolve(result()).then(ok,err)}};
}
const fakeDb={
 auth:{getUser:async()=>({data:{user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
  signUp:async input=>{calls.push({name:'signup',input});return {error:null}},
  signInWithPassword:async input=>{calls.push({name:'login',input});return {data:{user},error:null}},
  updateUser:async input=>{calls.push({name:'updateUser',input});return {error:null}},
  resend:async input=>{calls.push({name:'resend',input});return {error:null}},
  signOut:async()=>({error:null})},
 from:query,rpc:async(name,input)=>{calls.push({name,input});return {data:name==='smart_checkin_v7'?{ok:true,status:'present'}:[],error:null}}
};
const originalLoad=Module._load;
Module._load=function(request,parent){
 if(request==='../lib/supabase'||request==='../../lib/supabase')return {db:()=>fakeDb};
 if(request==='next/image')return {__esModule:true,default:props=>React.createElement('img',props)};
 if(request.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
 if(['./Pagination','./AttendancePanel','./AttendanceSecurity','./AttendanceAnalytics','./StudentLeaveRequest','./TeacherLeaveApproval'].includes(request))return {__esModule:true,default:()=>null};
 return originalLoad.apply(this,arguments);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,filename)=>{
 const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;mod._compile(output,filename);
};
const Home=require('../src/app/page.tsx').default;
const Checkin=require('../src/app/checkin/page.tsx').default;
Module._load=originalLoad;
const button=(root,text)=>root.findAllByType('button').find(x=>x.children.includes(text));
const field=(root,label)=>root.findAllByType('label').find(x=>x.children.some(c=>typeof c==='string'&&c.includes(label))).findByType('input');
const click=async b=>{assert.ok(b);await act(async()=>{b.props.onClick();});};
const fill=async (el,value)=>act(async()=>{el.props.onChange({target:{value}});});
const submit=async form=>act(async()=>{form.props.onSubmit({preventDefault(){}});});

test('student signup requires matching university email',async()=>{
 user=null;profile=null;calls=[];let renderer;
 try{await act(async()=>{renderer=create(React.createElement(Home));});const root=renderer.root;
  await click(button(root,'สมัครบัญชีนักศึกษา'));
  await fill(field(root,'ชื่อ–นามสกุล'),'นักศึกษาตัวอย่าง');await fill(field(root,'รหัสนักศึกษา'),'66504030041-0');
  await fill(field(root,'อีเมล'),'665040300410@gmail.com');await fill(field(root,'รหัสผ่าน'),'password123');
  await submit(root.findByType('form'));assert.equal(calls.filter(c=>c.name==='signup').length,0);
  assert.match(JSON.stringify(renderer.toJSON()),/อีเมลต้องเป็นรหัสนักศึกษา/);
  await fill(field(root,'อีเมล'),'665040300410@mail.rmutk.ac.th');await submit(root.findByType('form'));
  assert.equal(calls.filter(c=>c.name==='signup').length,1);
 }finally{if(renderer)await act(async()=>renderer.unmount());}
});

test('legacy student is offered email migration without loading courses',async()=>{
 user={id:'legacy',email:'old@example.org',email_confirmed_at:'2026-11-01'};profile={id:'legacy',role:'student',student_id:'66504030041-0',full_name:'นักศึกษา'};calls=[];let renderer;
 try{await act(async()=>{renderer=create(React.createElement(Home));});const root=renderer.root;
  assert.match(JSON.stringify(renderer.toJSON()),/เปลี่ยนเป็นอีเมลมหาวิทยาลัย/);
  assert.equal(calls.some(c=>c.name==='my_courses'),false);
  await submit(root.findByType('form'));assert.deepEqual(calls.find(c=>c.name==='updateUser').input,{email:'665040300410@mail.rmutk.ac.th'});
 }finally{if(renderer)await act(async()=>renderer.unmount());}
});

test('teacher can keep using the existing non-student email',async()=>{
 user={id:'teacher',email:'teacher@example.org',email_confirmed_at:'2026-11-01'};profile={id:'teacher',role:'teacher',student_id:null,full_name:'อาจารย์'};calls=[];let renderer;
 try{await act(async()=>{renderer=create(React.createElement(Home));});
  assert.match(JSON.stringify(renderer.toJSON()),/TEACHER DASHBOARD/);
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()),/เปลี่ยนเป็นอีเมลมหาวิทยาลัย/);
 }finally{if(renderer)await act(async()=>renderer.unmount());}
});

test('an unconfirmed university email can request its confirmation again',async()=>{
 user={id:'student',email:'665040300410@mail.rmutk.ac.th',email_confirmed_at:null};profile={id:'student',role:'student',student_id:'66504030041-0',full_name:'นักศึกษา'};calls=[];let renderer;
 try{await act(async()=>{renderer=create(React.createElement(Home));});await submit(renderer.root.findByType('form'));
  assert.deepEqual(calls.find(c=>c.name==='resend').input,{type:'signup',email:'665040300410@mail.rmutk.ac.th'});
  assert.equal(calls.some(c=>c.name==='updateUser'),false);
 }finally{if(renderer)await act(async()=>renderer.unmount());}
});

test('QR page blocks legacy student and allows verified student check-in',async()=>{
 user={id:'legacy',email:'old@example.org',email_confirmed_at:'2026-11-01'};profile={id:'legacy',role:'student',student_id:'66504030041-0'};calls=[];let renderer;
 try{await act(async()=>{renderer=create(React.createElement(Checkin));});
  assert.match(JSON.stringify(renderer.toJSON()),/ต้องเปลี่ยนและยืนยันอีเมลมหาวิทยาลัย/);
  assert.equal(calls.some(c=>c.name==='smart_checkin_v7'),false);
 }finally{if(renderer)await act(async()=>renderer.unmount());}
 user={id:'student',email:'665040300410@mail.rmutk.ac.th',email_confirmed_at:'2026-11-01'};profile={id:'student',role:'student',student_id:'66504030041-0'};calls=[];
 try{await act(async()=>{renderer=create(React.createElement(Checkin));});await click(button(renderer.root,'ยืนยันการเข้าเรียน'));
  const request=calls.find(c=>c.name==='smart_checkin_v7');assert.ok(request);assert.equal(request.input.p_lat,13.7563);assert.equal(request.input.p_lng,100.5018);
  assert.match(JSON.stringify(renderer.toJSON()),/บันทึกสำเร็จ/);
 }finally{if(renderer)await act(async()=>renderer.unmount());}
});
