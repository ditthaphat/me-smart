const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lab = fs.readFileSync(path.join(__dirname,'../src/app/learning-applications/page.tsx'),'utf8');
const home = fs.readFileSync(path.join(__dirname,'../src/app/page.tsx'),'utf8');

test('Fluid Mechanics lab is restricted to approved enrollment in course 4112203',()=>{
  assert.match(lab,/\.eq\('code','4112203'\)/);
  assert.match(lab,/\.eq\('student_id',data\.user\.id\)/);
  assert.match(lab,/\.eq\('status','approved'\)/);
  assert.match(lab,/\.in\('course_id',courseIds\)/);
  assert.match(lab,/if \(profile\.role === 'teacher'\)/);
  assert.match(lab,/if \(profile\.role !== 'student'\)/);
  assert.match(lab,/setAuth\(!enrollmentError && \(enrollment\?\.length \?\? 0\)>0 \? 'allowed':'denied'\)/);
});
test('Student navigation only exposes Fluid Mechanics entry in approved 4112203 course card',()=>{
  assert.match(home,/profile\.role === 'student' && c\.status === 'approved'/);
  assert.match(home,/c\.code === "4112203" && <Link href="\/learning-applications"/);
});
test('Couette-Poiseuille reference cases: pure Couette, pure Poiseuille, reverse pressure',()=>{
  const u=(y,U,h,mu,dp,L)=>U*y/h + dp*y*(h-y)/(2*mu*L);
  const q=(U,h,mu,dp,L)=>U*h/2 + dp*h**3/(12*mu*L);
  assert.equal(u(0,0.4,0.001,0.1,0,0.1),0);
  assert.equal(u(0.0005,0.4,0.001,0.1,0,0.1),0.2);
  assert.ok(Math.abs(q(0.4,0.001,0.1,0,0.1)-0.0002)<1e-14);
  assert.ok(Math.abs(u(0.0005,0,0.001,0.1,100,0.1)-0.00125)<1e-12);
  assert.ok(u(0.0005,0,0.001,0.1,-100,0.1)<0);
});
