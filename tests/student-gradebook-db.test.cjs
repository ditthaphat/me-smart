const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
const teacher='00000000-0000-4000-8000-000000000001';
const alice='00000000-0000-4000-8000-000000000002';
const bob='00000000-0000-4000-8000-000000000003';
const pending='00000000-0000-4000-8000-000000000004';
const otherTeacher='00000000-0000-4000-8000-000000000005';

test('students can read only their own approved, active marks and cannot change any marks',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon; create role authenticated; create schema auth;
   grant usage on schema auth to authenticated,anon;
   create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
   $$;
   create table public.courses(id bigint primary key,teacher_id uuid not null);
   create table public.enrollments(course_id bigint,student_id uuid,status text,primary key(course_id,student_id));
   insert into public.courses values(1,'${teacher}'),(2,'${otherTeacher}');
   insert into public.enrollments values(1,'${alice}','approved'),(1,'${bob}','approved'),
    (1,'${pending}','pending'),(2,'${bob}','approved');
   grant select on public.courses,public.enrollments to authenticated;
   alter table public.courses enable row level security;
   alter table public.enrollments enable row level security;
   create policy own_courses on public.courses for select to authenticated using (teacher_id=auth.uid());
   create policy own_enrollments on public.enrollments for select to authenticated using
    (student_id=auth.uid() or exists(select 1 from public.courses c where c.id=course_id and c.teacher_id=auth.uid()));
  `);
  await db.exec(read('../docs/database/gradebook.sql'));
  await db.exec(read('../docs/database/student-gradebook-read.sql'));
  async function asUser(id,role='authenticated'){
   await db.exec('reset role');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
   await db.exec('set role '+role);
  }
  await asUser(teacher);
  await db.query(`insert into gradebook_settings values
   (1,1,10,10,20,20,20,20,0.5,0,80,75,70,65,60,55,50,now())`);
  const rows=(await db.query(`insert into gradebook_items(course_id,category,title,max_score,is_archived)
   values(1,'project','visible',10,false),(1,'project','archived',10,true),(1,'homework','no mark yet',1,false)
   returning id,title`)).rows;
  const id=name=>rows.find(x=>x.title===name).id;
  await db.query(`insert into gradebook_marks(course_id,item_id,student_id,score)
   values (1,$1,$2,7),(1,$1,$3,9),(1,$4,$2,8)`,[id('visible'),alice,bob,id('archived')]);
  assert.equal((await db.query('select * from gradebook_marks')).rows.length,3,'the teacher retains full access');

  await asUser(alice);
  const own=(await db.query('select student_id,item_id,score from gradebook_marks order by item_id')).rows;
  assert.equal(own.length,1);assert.equal(own[0].student_id,alice);assert.equal(Number(own[0].score),7);
  assert.equal((await db.query('select * from gradebook_marks where student_id=$1',[bob])).rows.length,0,
   'a direct request for another student returns no rows');
  assert.equal((await db.query('select * from gradebook_items where id=$1',[id('archived')])).rows.length,0);
  assert.equal((await db.query('select * from gradebook_settings where course_id=1')).rows.length,1);
  assert.equal((await db.query('select * from gradebook_settings where course_id=2')).rows.length,0);
  assert.equal((await db.query('update gradebook_marks set score=10 where student_id=$1 returning *',[alice])).rows.length,0);
  assert.equal((await db.query('delete from gradebook_marks where student_id=$1 returning *',[alice])).rows.length,0);
  await assert.rejects(db.query('insert into gradebook_marks(course_id,item_id,student_id,submitted) values (1,$1,$2,true)',[id('no mark yet'),alice]),/row-level security/i);
  assert.equal((await db.query('update gradebook_settings set expected_sessions=99 returning *')).rows.length,0);
  assert.equal((await db.query('update gradebook_items set title=\'changed\' returning *')).rows.length,0);

  await asUser(bob);
  const bobRows=(await db.query('select student_id,score from gradebook_marks where course_id=1')).rows;
  assert.equal(bobRows.length,1);assert.equal(bobRows[0].student_id,bob);assert.equal(Number(bobRows[0].score),9);
  assert.equal((await db.query('select * from gradebook_marks where student_id=$1',[alice])).rows.length,0);
  await asUser(pending);
  assert.equal((await db.query('select * from gradebook_marks')).rows.length,0);
  assert.equal((await db.query('select * from gradebook_items')).rows.length,0);
  assert.equal((await db.query('select * from gradebook_settings')).rows.length,0);

  await db.exec('reset role');
  await db.query("update enrollments set status='rejected' where student_id=$1 and course_id=1",[alice]);
  await asUser(alice);
  assert.equal((await db.query('select * from gradebook_marks')).rows.length,0,'revoking approval removes access');
  assert.equal((await db.query('select * from gradebook_items')).rows.length,0);
  await asUser('', 'anon');
  await assert.rejects(db.query('select * from gradebook_marks'),/permission denied/i);
  await asUser(teacher);
  assert.equal((await db.query('select * from gradebook_marks')).rows.length,3,'student policies do not alter teacher access');
 }finally{await db.close();}
});
