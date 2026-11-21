import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker,{ validateState } from '../worker/index.js';
import { MemoryBucket } from '../scripts/memory-bucket.mjs';
const env=()=>({BUCKET:new MemoryBucket(),EDITOR_KEY:'test-key'});
const request=(path,options={})=>new Request('https://example.test'+path,options);
const auth={Authorization:'Bearer test-key'};
const valid={boards:{global:{height:720,items:[{id:'test-note',kind:'note',title:'视觉方向',text:'真正的创作参考',note:'00:12 节奏',x:5,y:20,w:60,h:300,z:1,color:'sage',anchor:'2'}]}}};
test('shared state persists, stale or concurrent first saves cannot overwrite it',async()=>{
 const e=env();const first=await worker.fetch(request('/api/board'),e);assert.equal((await first.json()).revision,'seed');
 const put=rev=>worker.fetch(request('/api/board',{method:'PUT',headers:{...auth,'If-Match':rev},body:JSON.stringify(valid)}),e);
 const saved=await put('seed');assert.equal(saved.status,200);const {revision}=await saved.json();
 assert.equal((await put('seed')).status,409);assert.equal((await put('old')).status,409);
 assert.equal((await put(revision)).status,200);
 const result=await (await worker.fetch(request('/api/board'),e)).json();assert.deepEqual(result.state,valid);
});
test('anonymous users cannot publish or upload; unsupported and oversized uploads are rejected',async()=>{
 const e=env();assert.equal((await worker.fetch(request('/api/board',{method:'PUT',body:'{}'}),e)).status,401);
 assert.equal((await worker.fetch(request('/api/upload',{method:'POST',body:'x'}),e)).status,401);
 assert.equal((await worker.fetch(request('/api/upload',{method:'POST',headers:{...auth,'Content-Type':'image/svg+xml','Content-Length':'1'},body:'x'}),e)).status,415);
 assert.equal((await worker.fetch(request('/api/upload',{method:'POST',headers:{...auth,'Content-Type':'video/mp4','Content-Length':String(91*1024*1024)},body:'x'}),e)).status,413);
 assert.equal((await worker.fetch(request('/api/auth',{method:'POST',headers:auth}),e)).status,200);
});
test('uploaded media survives a new request and supports byte-range playback',async()=>{
 const e=env(),bytes=new Uint8Array([0,1,2,3,4,5,6,7]);
 const response=await worker.fetch(request('/api/upload',{method:'POST',headers:{...auth,'Content-Type':'video/mp4','Content-Length':'8'},body:bytes}),e);assert.equal(response.status,201);
 const {key}=await response.json();const media=await worker.fetch(request('/media/'+key,{headers:{Range:'bytes=2-4'}}),e);
 assert.equal(media.status,206);assert.equal(media.headers.get('Content-Range'),'bytes 2-4/8');assert.deepEqual([...new Uint8Array(await media.arrayBuffer())],[2,3,4]);
 const head=await worker.fetch(request('/media/'+key,{method:'HEAD'}),e);assert.equal(head.status,200);assert.equal(head.headers.get('Content-Length'),'8');assert.equal(await head.text(),'');
});
test('state validation rejects active content and invalid chapters and bounds coordinates',()=>{
 assert.throws(()=>validateState({boards:{bad:{items:[]}}}));
 assert.throws(()=>validateState({boards:{global:{items:[{...valid.boards.global.items[0],kind:'link',url:'javascript:alert(1)'}]}}}));
 const state=structuredClone(valid);state.boards.global.items[0].x=999;state.boards.global.items[0].y=-1;
 assert.equal(validateState(state).boards.global.items[0].x,40);assert.equal(validateState(state).boards.global.items[0].y,0);
});
