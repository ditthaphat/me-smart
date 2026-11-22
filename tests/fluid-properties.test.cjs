const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const data=fs.readFileSync(path.join(__dirname,'../src/lib/fluid-property-data.ts'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'../src/app/learning-applications/fluid-mechanics/fluid-properties/page.tsx'),'utf8');
const hub=fs.readFileSync(path.join(__dirname,'../src/app/learning-applications/page.tsx'),'utf8');
test('source-traceable A3 A7 A9 A10 rows exist',()=>{for(const id of ['A–3','A–7','A–9','A–10'])assert.ok(data.includes(id));assert.match(data,/t:25,rho:997,mu:\.891e-3/);assert.match(data,/t:25,rho:1\.184,mu:1\.849e-5/);});
test('interpolation bounds and no extrapolation',()=>{assert.match(data,/temperature<rows\[0\]\.t\|\|temperature>rows\[rows.length-1\]\.t/);assert.match(data,/fraction=\(temperature-lower\.t\)\/\(upper\.t-lower\.t\)/);});
test('calculator has course gate, visit logging, and hub navigation',()=>{assert.match(page,/my_courses/);assert.match(page,/approved/);assert.match(page,/record_learning_app_visit/);assert.match(hub,/fluid-mechanics\/fluid-properties/);});
