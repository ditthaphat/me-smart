const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');

require.extensions['.ts']=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,filename);
const {compareStudentNumbers,sortStudentsByNumber}=require('../src/lib/student-sort.ts');

test('student numbers sort numerically regardless of registration order without changing the source',()=>{
  const rows=[
    {id:'first',number:'686040300125'},
    {id:'second',number:'675040300425'},
    {id:'third',number:'66504030041-0'},
  ];
  const sorted=sortStudentsByNumber(rows,row=>row.number,row=>row.id);
  assert.deepEqual(sorted.map(row=>row.id),['third','second','first']);
  assert.deepEqual(rows.map(row=>row.id),['first','second','third']);
  assert.equal(rows[2].number,'66504030041-0');
});

test('sort handles long identifiers, separators, non-numeric test IDs and missing values',()=>{
  const nums=['TEST001',null,'9007199254740993','10','9007199254740992','2','  ','1-1'];
  const result=sortStudentsByNumber(nums,x=>x,x=>x??'');
  assert.deepEqual(result,['2','10','1-1','9007199254740992','9007199254740993','TEST001',null,'  ']);
  const forward=compareStudentNumbers(' 0012-3 ','123');
  const backward=compareStudentNumbers('123',' 0012-3 ');
  assert.ok(forward===0 || forward===-backward);
  assert.ok(compareStudentNumbers('100000000000000000000','99999999999999999999')>0);
});
