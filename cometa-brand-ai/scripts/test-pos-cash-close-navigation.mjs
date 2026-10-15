import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync('src/app/brand/[brandSlug]/pos/cash/page.tsx','utf8');
const body=source.match(/onNext=\{\(\) => \{([\s\S]*?)\n        \}\}/)?.[1];assert.ok(body);
function run(step,value){let error=null,next=step;vm.runInNewContext('(()=>{'+body+'})()',{closeStep:step,closeCountedValue:value,setError:e=>error=e,setCloseStep:f=>next=f(step)});return {next,error};}
assert.deepEqual(run(1,null),{next:2,error:null});assert.equal(run(2,null).next,2);assert.ok(run(2,null).error);assert.equal(run(2,-1).next,2);assert.deepEqual(run(2,0),{next:3,error:null});assert.deepEqual(run(2,200),{next:3,error:null});
console.log('PASS cash close navigation: summary permits entry to count; missing/negative count blocks review; zero and positive counts permitted.');
