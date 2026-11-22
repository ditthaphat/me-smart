const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lab = fs.readFileSync(path.join(__dirname,'../src/app/learning-applications/page.tsx'),'utf8');
const labDetail = fs.readFileSync(path.join(__dirname,'../src/app/learning-applications/fluid-mechanics/couette-poiseuille/page.tsx'),'utf8');
const pressureLab = fs.readFileSync(path.join(__dirname,'../src/app/learning-applications/fluid-mechanics/pressure-manometry/page.tsx'),'utf8');
const home = fs.readFileSync(path.join(__dirname,'../src/app/page.tsx'),'utf8');

test('Hub and both labs gate students to approved 4112203',()=>{
  for(const source of [lab,labDetail,pressureLab]){
    assert.match(source,/\.rpc\('my_courses'\)/);
    assert.match(source,/4112203/);
    assert.match(source,/approved/);
    assert.match(source,/role === 'teacher'|role==='teacher'/);
  }
});
test('Approved course card links to learning hub',()=>{
 assert.match(home,/c\.code === "4112203" && <Link href="\/learning-applications"/);
});
test('Learning Hub lists both active labs and tracks aggregate visits',()=>{
 assert.match(lab,/Engineering Learning Hub/);
 assert.match(lab,/hydrostatic-forces/);
 assert.match(lab,/pressure-manometry/);
 assert.match(lab,/learning_app_visit_stats/);
 assert.match(lab,/ครั้งที่เปิดใช้งานรวม/);
 assert.match(labDetail,/record_learning_app_visit/);
 assert.match(pressureLab,/record_learning_app_visit/);
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
