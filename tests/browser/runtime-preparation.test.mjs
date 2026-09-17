import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function runtime(){
 let now=0,intro=2,preparation=1,finished=0;
 const canvas={style:{}},events=[];
 const context=vm.createContext({location:{pathname:'/',origin:'http://localhost'},parent:{postMessage:data=>events.push(data)},document:{querySelector:()=>canvas,createElement:()=>({}),head:{append(){}}},performance:{now:()=>now},console,setTimeout,clearTimeout,Uint32Array,Int32Array,Float32Array,Atomics});
 context.window=context;context.addEventListener=()=>{};
 const source=readFileSync(new URL('../../platforms/browser/runtime.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInContext(source,context);
 Object.assign(context.Module,{_direct_scene:()=>0x202,_direct_scene_kind:()=>2,_opensmash_intro_state:()=>intro,_opensmash_preparation_state:()=>preparation,_opensmash_finish_preparation:()=>{finished++;preparation=3;},_opensmash_finish_intro_preparation:()=>{intro=2;},FS:{syncfs(){}}});
 vm.runInContext('selection={launch:{mode:0}};options={};directSurface=true;',context);
 return {canvas,events,module:context.Module,get finished(){return finished;},state(i,p){intro=i;preparation=p;},frame(dt=1000/60){now+=dt;context.Module.onFrame(Math.round(now));}};
}
test('VS stays visible; first match and resume-pending frames stay hidden',()=>{
 const r=runtime();r.frame();assert.equal(r.canvas.style.visibility,'visible');
 r.state(3,1);r.frame();assert.equal(r.canvas.style.visibility,'hidden');
 r.state(3,2);r.frame();assert.equal(r.canvas.style.visibility,'hidden');
 r.state(3,3);r.frame();assert.equal(r.canvas.style.visibility,'hidden');
 r.state(3,4);r.frame();r.frame();assert.equal(r.canvas.style.visibility,'visible');
 assert.equal(r.events.filter(e=>e.type==='playable').length,1);
});
test('match preparation requires fresh stable frames, not VS samples',()=>{
 const r=runtime();for(let i=0;i<60;i++)r.frame();
 r.state(3,2);r.frame();assert.equal(r.finished,0);
 for(let i=0;i<29;i++)r.frame();assert.equal(r.finished,0);
 r.frame(300);r.frame();assert.equal(r.finished,0);
 for(let i=0;i<29;i++)r.frame();assert.equal(r.finished,1);
 assert.equal(r.canvas.style.visibility,'hidden');
});
test('sustained 30fps does not count as ready for 60fps gameplay',()=>{
 const r=runtime();r.state(3,2);for(let i=0;i<60;i++)r.frame(1000/30);
 assert.equal(r.finished,0);
 for(let i=0;i<30;i++)r.frame();assert.equal(r.finished,1);
});

test('queued uploads must finish on the GPU before preparation releases',async()=>{
 const r=runtime();let resolve,waits=0;
 r.module.browserGpuQueue={onSubmittedWorkDone:()=>{waits++;return new Promise(done=>{resolve=done;});}};
 r.state(3,2);for(let i=0;i<40;i++)r.frame();
 assert.equal(waits,1);assert.equal(r.finished,0);
 resolve();await Promise.resolve();r.frame();assert.equal(r.finished,1);
});
test('GPU completion from an earlier phase cannot release a new preparation',async()=>{
 const r=runtime();const completions=[];
 r.module.browserGpuQueue={onSubmittedWorkDone:()=>new Promise(done=>completions.push(done))};
 r.state(1,1);for(let i=0;i<40;i++)r.frame();
 r.state(3,2);for(let i=0;i<40;i++)r.frame();
 completions[0]();await Promise.resolve();r.frame();assert.equal(r.finished,0);
 completions[1]();await Promise.resolve();r.frame();assert.equal(r.finished,1);
});

test('stable CPU frames cannot release a scene with shaders still compiling',()=>{
 const r=runtime();r.module.browserPipelinePending=2;r.state(3,2);
 for(let i=0;i<60;i++)r.frame();assert.equal(r.finished,0);
 r.module.browserPipelinePending=0;r.frame();assert.equal(r.finished,1);
});
