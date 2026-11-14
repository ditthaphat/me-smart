// Synthetic in-memory fixture used only by the isolated preview deployment.
// No real account, course, student, or mark is read or written.
const members=Array.from({length:12},(_,i)=>({student_id:`demo-${i+1}`,profiles:{full_name:`นักศึกษาทดสอบ ${i+1}`,student_id:`TEST${String(i+1).padStart(3,'0')}`}}));
const sessions=Array.from({length:4},(_,i)=>({id:i+1,session_date:`2026-11-${String(16+i).padStart(2,'0')}`,topic:`คาบทดสอบ ${i+1}`}));
const items=[...Array.from({length:12},(_,i)=>({id:i+1,course_id:1,category:'homework',title:`WS${i+1}`,max_score:1,position:i,is_archived:false})),{id:20,course_id:1,category:'project',title:'Report',max_score:5,position:0,is_archived:false},{id:21,course_id:1,category:'posttest',title:'CH01',max_score:20,position:0,is_archived:false},{id:22,course_id:1,category:'midterm',title:'MID',max_score:20,position:0,is_archived:false},{id:23,course_id:1,category:'final',title:'Final',max_score:20,position:0,is_archived:false}];
const attendance=members.flatMap((m,i)=>sessions.map(s=>({session_id:s.id,student_id:m.student_id,status:i===1&&s.id===2?'late':i===2&&s.id===3?'absent':'present'})));
const setting={course_id:1,expected_sessions:15,attendance_weight:10,homework_weight:10,project_weight:20,posttest_weight:20,midterm_weight:20,final_weight:20,late_credit:.5,leave_credit:1,grade_a:80,grade_bplus:75,grade_b:70,grade_cplus:65,grade_c:60,grade_dplus:55,grade_d:50};
const tables:Record<string,any[]>={attendance_sessions:sessions,enrollments:members,attendance_records:attendance,gradebook_items:items,gradebook_settings:[setting],gradebook_marks:[]};
function builder(table:string):any {
 let operation='read';let payload:any;const filters:Record<string,any>={};let lo=0,hi=100000;
 const result=()=>{
  if(operation==='upsert'){
   if(table==='gradebook_marks'){tables[table]=tables[table].filter(m=>m.item_id!==payload.item_id||m.student_id!==payload.student_id);tables[table].push({...payload});return {data:{...payload},error:null}}
   tables[table]=[{...payload}];return {data:{...payload},error:null};
  }
  if(operation==='insert'){const rows=Array.isArray(payload)?payload:[payload];tables[table].push(...rows.map((row:any,index:number)=>({...row,id:100+tables[table].length+index,is_archived:false})));return {data:null,error:null};}
  if(operation==='update'){const row=tables[table].find(x=>x.id===filters.id);if(row)Object.assign(row,payload);return {data:{id:row?.id},error:null}}
  if(operation==='delete'){tables[table]=tables[table].filter(x=>!(x.item_id===filters.item_id&&x.student_id===filters.student_id));return {data:null,error:null}}
  return {data:(tables[table]??[]).slice(lo,hi+1),error:null};
 };
 const q:any={select(){return q},eq(k:string,v:any){filters[k]=v;return q},in(){return q},order(){return q},range(a:number,b:number){lo=a;hi=b;return q},upsert(v:any){operation='upsert';payload=v;return q},insert(v:any){operation='insert';payload=v;return q},update(v:any){operation='update';payload=v;return q},delete(){operation='delete';return q},maybeSingle(){return Promise.resolve({data:tables[table]?.[0]??null,error:null})},single(){return Promise.resolve(result())},then(resolve:any,reject:any){return Promise.resolve(result()).then(resolve,reject)}};
 return q;
}
export function db():any{return {from:builder,auth:{getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}}}
