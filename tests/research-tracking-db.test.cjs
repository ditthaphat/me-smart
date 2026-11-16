const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');

test('research data is owned by the teacher, validated, and deletes only within the project',async()=>{
 const db=new PGlite();
 const teacher='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',student='10000000-0000-4000-8000-000000000003';
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to anon,authenticated;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public.profiles(id uuid primary key,role text not null);
   create table public.attendance_records(id bigint primary key,description text);
   insert into public.profiles values('${teacher}','teacher'),('${other}','teacher'),('${student}','student');
   insert into public.attendance_records values(1,'existing attendance');grant select on public.profiles to authenticated;`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/research-tracking.sql'),'utf8'));
  async function asUser(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
  await asUser(teacher);
  const project=(await db.query("insert into research_projects(title,project_stage,article_due_date) values('กลุ่มทดสอบ','defended','2027-02-28') returning id")).rows[0].id;
  const keep=(await db.query("insert into research_projects(title) values('อีกโครงงาน') returning id")).rows[0].id;
  const task=(await db.query("insert into research_tasks(project_id,category,title,progress,weight) values($1,'article','บทนำ',50,2) returning id",[project])).rows[0].id;
  await db.query("insert into research_tasks(project_id,category,title) values($1,'research','งานอื่น')",[keep]);
  await assert.rejects(db.query("insert into research_tasks(project_id,category,title,progress) values($1,'article','ผิด',101)",[project]),/check constraint/);
  await assert.rejects(db.query("insert into research_tasks(project_id,category,title,weight) values($1,'article','ผิด',0)",[project]),/check constraint/);
  await assert.rejects(db.query("insert into research_tasks(project_id,category,title,start_date,due_date) values($1,'article','ผิด','2027-02-28','2027-02-01')",[project]),/check constraint/);
  await assert.rejects(db.query("update research_projects set owner_id=$1 where id=$2",[other,project]),/row-level security/);
  await asUser(other);
  assert.equal((await db.query('select * from research_projects')).rows.length,0);
  assert.equal((await db.query('select * from research_tasks')).rows.length,0);
  assert.equal((await db.query('update research_tasks set progress=100 where id=$1 returning id',[task])).rows.length,0);
  assert.equal((await db.query('delete from research_projects where id=$1 returning id',[project])).rows.length,0);
  await assert.rejects(db.query("insert into research_tasks(project_id,category,title) values($1,'article','ข้ามเจ้าของ')",[project]),/foreign key constraint/);
  const otherProject=(await db.query("insert into research_projects(title) values('ของอาจารย์อีกท่าน') returning id")).rows[0].id;
  await asUser(student);
  assert.equal((await db.query('select * from research_projects')).rows.length,0);
  assert.equal((await db.query('select * from research_tasks')).rows.length,0);
  await assert.rejects(db.query("insert into research_projects(title) values('ไม่อนุญาต')"),/row-level security/);
  await asUser(teacher);
  assert.equal((await db.query('delete from research_projects where id=$1 returning id',[project])).rows.length,1);
  assert.equal((await db.query('select * from research_tasks where project_id=$1',[project])).rows.length,0);
  assert.equal((await db.query('select * from research_tasks where project_id=$1',[keep])).rows.length,1);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from public.attendance_records')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from research_projects where id=$1',[otherProject])).rows[0].n,1);
  assert.equal((await db.query("select has_table_privilege('anon','public.research_projects','select') as allowed")).rows[0].allowed,false);
 } finally { await db.close(); }
});
