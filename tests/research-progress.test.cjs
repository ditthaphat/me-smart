const assert=require('node:assert/strict');const fs=require('node:fs');const test=require('node:test');const ts=require('typescript');
require.extensions['.ts']=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,filename);
const {weightedProgress,bangkokToday}=require('../src/lib/research-progress.ts');
test('weighted progress is based on actual tasks and treats no tasks as unknown',()=>{
 assert.equal(weightedProgress([]),null);
 assert.equal(weightedProgress([{progress:100,weight:1},{progress:0,weight:1}]),50);
 assert.equal(weightedProgress([{progress:100,weight:3},{progress:0,weight:1}]),75);
 assert.equal(weightedProgress([{progress:60,weight:'1'},{progress:0,weight:'2'}]),20);
 assert.equal(weightedProgress([{progress:0,weight:1}]),0);
});
test('deadline calendar uses Thailand time',()=>{
 assert.equal(bangkokToday(new Date('2026-11-15T16:59:59Z')),'2026-11-15');
 assert.equal(bangkokToday(new Date('2026-11-15T17:00:00Z')),'2026-11-16');
});
