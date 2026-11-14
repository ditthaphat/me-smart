export type Category = 'homework'|'project'|'posttest'|'midterm'|'final';
export type AttendanceStatus = 'present'|'late'|'absent'|'leave';
export type Item = {id:number;course_id:number;category:Category;title:string;max_score:number;position:number;is_archived:boolean};
export type Mark = {course_id:number;item_id:number;student_id:string;submitted:boolean|null;score:number|null};
export type Session = {id:number;session_date:string;topic:string};
export type Attendance = {session_id:number;student_id:string;status:AttendanceStatus};
export type Settings = {
 course_id:number;expected_sessions:number;attendance_weight:number;homework_weight:number;project_weight:number;
 posttest_weight:number;midterm_weight:number;final_weight:number;late_credit:number;leave_credit:number;
 grade_a:number;grade_bplus:number;grade_b:number;grade_cplus:number;grade_c:number;grade_dplus:number;grade_d:number;
};
export const categories:Category[]=['homework','project','posttest','midterm','final'];
export const categoryNames:Record<Category,string>={homework:'การบ้าน',project:'โครงงาน',posttest:'แบบทดสอบ',midterm:'กลางภาค',final:'ปลายภาค'};
export const settingsExample:Omit<Settings,'course_id'|'late_credit'|'leave_credit'>={
 expected_sessions:15,attendance_weight:10,homework_weight:10,project_weight:20,posttest_weight:20,midterm_weight:20,final_weight:20,
 grade_a:80,grade_bplus:75,grade_b:70,grade_cplus:65,grade_c:60,grade_dplus:55,grade_d:50,
};
export function templateItems(courseId:number):Omit<Item,'id'|'is_archived'>[]{
 const row=(category:Category,title:string,max_score:number,position:number)=>({course_id:courseId,category,title,max_score,position});
 return [
  ...Array.from({length:12},(_,i)=>row('homework',`WS${i+1}`,1,i)),
  ...[['Tester',10],['Report',5],['Present',5]].map(([label,max],i)=>row('project',String(label),Number(max),i)),
  ...['CH01','CH02','CH03-1','CH03-2','CH03-3','CH04','CH05','CH06-1','CH06-2','CH06-3','CH07','CH08'].map((label,i)=>row('posttest',label,20,i)),
  row('midterm','MID',20,0),row('final','Final',20,0),
 ];
}
export function assess(studentId:string,sessions:Session[],attendance:Map<string,Attendance>,items:Item[],marks:Map<string,Mark>,settings:Settings){
 const getNumber=(n:number)=>Number(n);
 const expected=getNumber(settings.expected_sessions);
 let attendanceEarned=0, recorded=0;
 for(const session of sessions){
  const record=attendance.get(`${session.id}:${studentId}`);if(!record)continue;
  recorded++;
  attendanceEarned+=record.status==='present'?1:record.status==='late'?getNumber(settings.late_credit):record.status==='leave'?getNumber(settings.leave_credit):0;
 }
 const attendanceScore=Math.min(attendanceEarned/expected,1)*getNumber(settings.attendance_weight);
 const attendanceComplete=getNumber(settings.attendance_weight)===0||(sessions.length===expected&&recorded===expected);
 const results={} as Record<Category,{earned:number;complete:boolean;recorded:number;total:number}>;
 for(const category of categories){
  const group=items.filter(x=>x.category===category);const weight=getNumber(settings[`${category}_weight` as keyof Settings]);
  let got=0,maximum=0,count=0;
  for(const item of group){
   const mark=marks.get(`${item.id}:${studentId}`);
   if(category==='homework'){
    maximum+=1;if(mark&&mark.submitted!==null){count++;if(mark.submitted)got++}
   } else {
    maximum+=getNumber(item.max_score);if(mark&&mark.score!==null){count++;got+=getNumber(mark.score)}
   }
  }
  results[category]={earned:maximum?got/maximum*weight:0,complete:weight===0||(group.length>0&&count===group.length),recorded:count,total:group.length};
 }
 const partial=Number((attendanceScore+categories.reduce((sum,c)=>sum+results[c].earned,0)).toFixed(2));
 const complete=attendanceComplete&&categories.every(c=>results[c].complete);
 const grade=complete?(
  partial>=getNumber(settings.grade_a)?'A':partial>=getNumber(settings.grade_bplus)?'B+':partial>=getNumber(settings.grade_b)?'B':
  partial>=getNumber(settings.grade_cplus)?'C+':partial>=getNumber(settings.grade_c)?'C':partial>=getNumber(settings.grade_dplus)?'D+':
  partial>=getNumber(settings.grade_d)?'D':'F'
 ):null;
 return {attendanceScore,attendanceComplete,recorded,expected,results,partial,complete,grade};
}
