import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise the actual browser bridge with a WebGPU buffer model. The headed
// game test covers real driver validation, rendering and submission ordering.
const source=readFileSync(new URL('../../../extern/aurora/lib/gfx/frame.cpp',import.meta.url),'utf8');
function bridge(name){const start=source.indexOf('EM_JS(void, '+name),body=source.indexOf('{',start);return new Function('entries','count',source.slice(body+1,source.indexOf('\n});',body)));}
class Buffer {
 size=128;mapState='unmapped';maps=[];written=[];
 async mapAsync(mode,offset,size){assert.equal(this.mapState,'unmapped');assert.equal(offset,0);assert.ok(size<=this.size);this.mapState='pending';this.maps.push(size);await Promise.resolve();this.mapState='mapped';this.mappedSize=size;}
 getMappedRange(offset,size){assert.equal(this.mapState,'mapped');assert.ok(offset+size<=this.mappedSize);this.range=new ArrayBuffer(size);return this.range;}
 unmap(){assert.equal(this.mapState,'mapped');if(this.range){this.written.push([...new Uint8Array(this.range)]);this.range=null;}this.mapState='unmapped';}
}
test('staging copies used bytes, reuses ready mappings, and grows a pool safely',async()=>{
 const keys=['Module','HEAPU8','HEAPU32','WebGPU','GPUMapMode','Asyncify'];const saved=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 const heap=new ArrayBuffer(2048),bytes=new Uint8Array(heap),words=new Uint32Array(heap),buffers=[new Buffer(),new Buffer()];let suspensions=0;
 Object.assign(globalThis,{Module:{},HEAPU8:bytes,HEAPU32:words,WebGPU:{getJsObject:id=>buffers[id-1]},GPUMapMode:{WRITE:2},Asyncify:{state:0,State:{Rewinding:2},handleAsync:fn=>{suspensions++;return fn();}}});
 try{
  const upload=bridge('browser_upload_pools'),remap=bridge('browser_remap_pools');
  words.set([1,512,8,2,1024,20]);bytes.set([1,2,3,4,5,6,7,8],512);bytes.fill(42,1024,1088);
  await upload(0,2);
  assert.deepEqual(buffers.map(b=>b.maps),[[8],[32]],'unused pool capacity is never mapped');
  assert.deepEqual(buffers[0].written[0],[1,2,3,4,5,6,7,8]);assert.equal(buffers[1].written[0].length,20);
  remap(0,2);await Promise.all([...Module.browserStagingPools.values()].map(p=>p.promise));
  const before=suspensions;assert.equal(upload(0,2),undefined);assert.equal(suspensions,before,'ready mappings do not suspend the game');
  remap(0,2);words[5]=40;await upload(0,2);
  assert.equal(buffers[1].maps.at(-1),64);assert.deepEqual(buffers[1].written.at(-1),Array(40).fill(42));
  assert.ok(buffers.every(b=>b.mapState==='unmapped'),'all uploaded buffers are ready for GPU submission');
  words[5]=20;remap(0,2);await Promise.all([...Module.browserStagingPools.values()].map(p=>p.promise));
  assert.equal(buffers[1].maps.at(-1),64,'a quiet frame must not discard burst capacity');
  words[5]=40;const resumed=suspensions;upload(0,2);assert.equal(suspensions,resumed,'a repeated burst stays synchronous');
 }finally{Object.assign(globalThis,saved);}
});
