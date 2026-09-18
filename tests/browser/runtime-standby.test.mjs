import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('standby defers native initialization until Play and installs assets before main',async()=>{
 const events=[],writes=[],parent={postMessage:data=>events.push(data)};
 let receive,started=0,configured=false;
 const context=vm.createContext({location:{pathname:'/',origin:'http://localhost'},parent,
  document:{querySelector:()=>({style:{}}),createElement:()=>({}),head:{append(){}}},
  performance,console,setTimeout,clearTimeout,Uint8Array,Uint32Array,Int32Array,Float32Array,Atomics,
  navigator:{userAgent:'test',hardwareConcurrency:4},
  fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(64)}),
  migrateLegacySaves:()=>[],createDiscCache:()=>({read(){}}),checkGraphics:async()=>{},
 });
 context.window=context;context.addEventListener=(_type,callback)=>{receive=callback;};
 const source=readFileSync(new URL('../../platforms/browser/runtime.mjs',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'')
  .replace("await import(base+'verify-disc.mjs')",'({verifyDisc:async()=>{}})')
  .replace("await import(base+'local-files.mjs')","({COSTUME_SLOTS:['PlMrNr.dat']})");
 vm.runInContext(source,context);
 const module=context.Module;
 Object.assign(module,{ENV:{},FS:{mkdirTree(){},mount(){},filesystems:{IDBFS:{}},syncfs(_read,done){done();},writeFile(path){writes.push(path);}},
  callMain(){started++;assert.equal(module.ENV.MELEE_SEED,'7');assert.ok(module.readDisc);assert.ok(writes.includes('/initial_pipeline_cache.db'));
   assert.ok(configured);assert.ok(writes.includes('/mod/PlMrNr.dat'));},
  _direct_configure(){configured=true;return true;},
 });
 module.onRuntimeInitialized();
 const send=data=>receive({source:parent,origin:'http://localhost',data});
 await send({type:'start',warm:true,iso:{},args:['--seed','7']});
 assert.equal(started,0);assert.equal(configured,false);
 assert.equal(events.filter(e=>e.type==='ready-for-selection').length,1);
 await send({type:'select',launch:{mode:0,stage:1,level:9,stocks:4,minutes:8,packedPorts:[0,0,0,0]},costumes:[{filename:'PlMrNr.dat',blob:{arrayBuffer:async()=>new ArrayBuffer(64)}}]});
 assert.equal(started,1);
 assert.equal(events.filter(e=>e.type==='error').length,0);
 await send({type:'select'});assert.equal(events.filter(e=>e.type==='error').length,1);
});
