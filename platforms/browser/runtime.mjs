import {migrateLegacySaves} from './save-migration.mjs';
import {createDiscCache} from './disc-cache.mjs';
/** OpenSmash launcher protocol; upstream owns game logic, GX, and mixing. */
const prefix=location.pathname.startsWith('/melee/')?'/melee':'';
const base=prefix+'/engine/';
const report=(type,data={},transfer=[])=>parent.postMessage({type,...data},location.origin,transfer);
const fail=error=>report('error',{message:error?.stack||String(error)});
let resolveRuntime;
const runtimeReady=new Promise(resolve=>resolveRuntime=resolve);
let directSurface=false;
let options,selection,ready=false,presentPending=false,playable=false,introReported=false;
let started=0,lastTime=0,lastFrame=0,lastStamp=0,presented=0,combatFrames=0;
let audioFrames=0,audioPeak=0,audioOverruns=0,phase=0,previous=[0,0];
let preparationSamples=[],preparationPhase=null,preparationGeneration=0,preparationGpuReady=false,preparationGpuPending=false,frameTimes=[],combatWindow,intervalCombat=true,lastCombat=false;
const pads=Array.from({length:4},()=>({buttons:0,until:new Uint32Array(16),values:null}));
function applyPad(port,frame){
 const pad=pads[port];if(!pad.values)return;
 const [,,sticks,triggers,connected]=pad.values;let buttons=pad.buttons;
 for(let bit=0;bit<16;bit++)if(frame<pad.until[bit])buttons|=1<<bit;
 Module._direct_set_pad(port,buttons,(sticks&255)-128,((sticks>>>8)&255)-128,((sticks>>>16)&255)-128,(sticks>>>24)-128,triggers&255,(triggers>>>8)&255,connected);
}
function setPad(values){
 if(!ready&&!selection)return;
 const [port,buttons]=values;if(port<0||port>3)return;
 const pad=pads[port],frame=Module._direct_frame_count();
 for(let bit=0;bit<16;bit++)if((buttons&(1<<bit))&&!(pad.buttons&(1<<bit)))pad.until[bit]=frame+2;
 pad.buttons=buttons;pad.values=values;applyPad(port,frame);
}
function mix(samples,rate){
 audioFrames+=samples.length/2;for(const sample of samples)audioPeak=Math.max(audioPeak,Math.abs(sample));
 if(!options.audio)return;
 const indices=new Int32Array(options.audio,0,4),ring=new Float32Array(options.audio,16),cap=ring.length/2;
 let write=Atomics.load(indices,0),read=Atomics.load(indices,1);
 for(let i=0;i<samples.length;i+=2){
  while(phase<1){const next=(write+1)%cap;if(next!==read){ring[write*2]=previous[0]+(samples[i]-previous[0])*phase;ring[write*2+1]=previous[1]+(samples[i+1]-previous[1])*phase;write=next;}else audioOverruns++;phase+=rate/48000;}
  phase-=1;previous[0]=samples[i];previous[1]=samples[i+1];
 }
 Atomics.store(indices,0,write);
}
function audioRequested(){
 if(!started)return false;
 if(!options.audio)return audioFrames<(performance.now()-started)*32;
 const indices=new Int32Array(options.audio,0,4),capacity=(options.audio.byteLength-16)/8;
 return (Atomics.load(indices,0)-Atomics.load(indices,1)+capacity)%capacity<8192;
}
function present(){
 if(presentPending||!selection)return;
 const intro=Module._opensmash_intro_state(),preparation=Module._opensmash_preparation_state();
 // Keep the match hidden from its first frame through the resume draw.
 // State 1 includes the VS sequence, which must remain visible while playing.
 const preparing=intro===1||(preparation!==4&&intro!==2);
 if(directSurface)Module.canvas.style.visibility=preparing?'hidden':'visible';
 if(preparing)return;
 const completed=()=>{
  const scene=Module._direct_scene(),kind=Module._direct_scene_kind(),mode=selection.launch.mode;
  const reached=mode===0?kind===2&&Module._opensmash_preparation_state()===4&&combatFrames>1&&![1,2].includes(Module._opensmash_intro_state()):mode===1?(scene>>>8)===1:mode===3?(scene>>>8)===3:true;
  if(reached&&!playable){playable=true;report('playable');report('startup-performance',{clickToMatchMs:Date.now()-(selection.requestedAt||Date.now())});}
 };
 if(directSurface){presented++;report('frame',{direct:true});completed();return;}
 presentPending=true;
 createImageBitmap(Module.canvas).then(bitmap=>{
  presented++;report('frame',{bitmap},[bitmap]);completed();
 }).catch(fail).finally(()=>presentPending=false);
}
function onFrame(frame){
 if(!selection)return;
 for(let port=0;port<4;port++)applyPad(port,frame);
 const now=performance.now(),scene=Module._direct_scene(),kind=Module._direct_scene_kind();
 const intro=Module._opensmash_intro_state();
 if(lastStamp&&now-lastStamp>33.34)report('frame-stall',{frame,scene,intro,preparation:Module._opensmash_preparation_state(),durationMs:now-lastStamp,phases:Module.framePhases||{}});
 Module.framePhases={};
 const combat=kind===2&&Module._opensmash_preparation_state()===4&&intro!==1&&intro!==2;
 const preparingPhase=intro===1?'intro':Module._opensmash_preparation_state()===2?'match':null;
 if(lastStamp)frameTimes.push(now-lastStamp);
 // A new scene needs its own stable window. VS timings say nothing about
 // the match's shaders, uploads, or first-use WASM compilation.
 if(preparingPhase!==preparationPhase){
  preparationSamples=[];preparationPhase=preparingPhase;preparationGeneration++;preparationGpuReady=false;preparationGpuPending=false;
  if(preparingPhase==='match')report('status',{message:'Preparing match graphics…'});
 }
 else if(preparingPhase&&lastStamp){preparationSamples.push(now-lastStamp);if(preparationSamples.length>30)preparationSamples.shift();}
 if(preparationSamples.length===30&&preparationSamples.every(ms=>ms<25)&&!Module.browserPipelinePending){
  if(Module.browserGpuQueue&&!preparationGpuReady){
   if(!preparationGpuPending){
    preparationGpuPending=true;
    const generation=preparationGeneration;
    const timer=setTimeout(()=>Module.onUploadWait?.(),1500);
    Module.browserGpuQueue.onSubmittedWorkDone().then(()=>{
     if(preparationGeneration===generation){preparationGpuReady=true;preparationGpuPending=false;}
    }).catch(fail).finally(()=>clearTimeout(timer));
   }
  }else{
   if(intro===1)Module._opensmash_finish_intro_preparation();
   if(Module._opensmash_preparation_state()===2)Module._opensmash_finish_preparation();
  }
 }
 if(intro===1)introReported=false;
 if(intro===2&&!introReported){introReported=true;report('intro');}
 if(lastCombat&&!combat)Module.FS.syncfs(false,()=>{});lastCombat=combat;
 intervalCombat&&=combat;if(combat)combatFrames++;
 if(!combat)combatWindow=null;
 else if(!combatWindow){const ix=options.audio?new Int32Array(options.audio,0,4):null;combatWindow={time:now,frame,presented,samples:[],underruns:ix?Atomics.load(ix,2):0,rendered:ix?Atomics.load(ix,3):0,overruns:audioOverruns};}
 else {
  combatWindow.samples.push(now-lastStamp);
  if(now-combatWindow.time>=30000){const w=combatWindow,dt=now-w.time,ordered=w.samples.sort((a,b)=>a-b);report('combat-performance',{profile:'upstream',durationMs:dt,frames:frame-w.frame,combatFrames,fps:(frame-w.frame)*1000/dt,presentedBitmapFps:(presented-w.presented)*1000/dt,p95:ordered[Math.floor(ordered.length*.95)],p99:ordered[Math.floor(ordered.length*.99)],maxFrameMs:ordered.at(-1),over33ms:ordered.filter(n=>n>33.34).length,audioPeak,audioUnderrunSamples:(options.audio?Atomics.load(new Int32Array(options.audio,0,4),2):0)-w.underruns,audioRenderedSamples:(options.audio?Atomics.load(new Int32Array(options.audio,0,4),3):0)-w.rendered,audioOverrunSamples:audioOverruns-w.overruns,targetFps:60});combatWindow=null;}
 }
 lastStamp=now;
 if(now-lastTime>=1000){const fps=(frame-lastFrame)*1000/(now-lastTime);report('progress',{frame,scene,sceneKind:kind,fps,audioFrames,audioPeak,audioIndices:options.audio?Array.from(new Int32Array(options.audio,0,4)):null});report('metrics',{frames:frame,combatFrames,fps,frameTimes,completeCombatInterval:intervalCombat});lastFrame=frame;lastTime=now;frameTimes=[];intervalCombat=true;}
 present();
}
window.Module={onUploadWait:()=>{if(!playable)report('status',{message:'Compiling graphics for your GPU…'});},onGraphicsPreparation:(done,total)=>report('status',{message:done===total?'Compiling graphics for your GPU…':`Preparing graphics… ${Math.floor(done*100/total)}%`}),canvas:document.querySelector('#canvas'),onFrame,onAudio:mix,audioRequested,
 print:text=>report('log',{text,message:text}),printErr:text=>report('log',{text,message:text}),
 onRuntimeInitialized:()=>resolveRuntime(),onAbort:fail};
const script=document.createElement('script');script.src='./melee_browser.js';script.onerror=()=>fail(Error('Build the upstream Melee engine before launching.'));document.head.append(script);
async function select(data){
 if(!ready||selection)throw Error('The upstream engine is not ready for selection.');
 const {COSTUME_SLOTS}=await import(base+'local-files.mjs');
 const css=['MnSlChr.dat','MnSlChr.usd','audio/nr_select.ssm','audio/us/nr_select.ssm'];
 for(const [assets,allowed,max] of [[data.costumes||[],COSTUME_SLOTS,2*1024*1024],[data.cssAssets||[],css,16*1024*1024]]){
  for(const asset of assets){if(!allowed.includes(asset.filename))throw Error('Invalid replacement asset.');const bytes=new Uint8Array(await asset.blob.arrayBuffer());if(bytes.length<32||bytes.length>max)throw Error('Invalid replacement asset size.');const path='/mod/'+asset.filename;Module.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));Module.FS.writeFile(path,bytes);}
 }
 const c=data.launch;if(!c||!Module._direct_configure(c.mode,c.stage,c.level,c.stocks,c.minutes,...c.packedPorts))throw Error('Invalid match configuration.');
 selection=data;ready=false;
 report('session',{backend:'melee-pc-upstream',browser:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,launch:c});report('started');report('status',{message:'Opening Melee…'});
 started=lastTime=performance.now();Module.callMain([]);
}
window.addEventListener('message',async event=>{
 if(event.source!==parent||event.origin!==location.origin)return;
 const data=event.data;
 try{
  if(data.type==='surface'){directSurface=!!data.direct;return;}
  if(data.type==='pad'){setPad(data.values);return;}
  if(data.type==='input'){if(selection)Module._direct_set_pad(...data.values);return;}
  if(data.type==='confirm'){setPad([0,256,0x80808080,0,1]);setPad([0,0,0x80808080,0,1]);return;}
  if(data.type==='select'){await select(data);return;}
  if(data.type!=='start'||options)return;options=data;
  report('status',{message:'Checking your local Melee disc…'});
  const {verifyDisc}=await import(base+'verify-disc.mjs');
  if(!data.discVerified)await verifyDisc(data.iso,bytes=>report('status',{message:'Checking your game… '+Math.floor(bytes/data.iso.size*100)+'%'}));
  report('disc-verified');await runtimeReady;
  const seedBytes=fetch(base+'upstream/initial_pipeline_cache.db').then(async response=>response.ok?new Uint8Array(await response.arrayBuffer()):null).catch(()=>null);
  Module.FS.mkdirTree('/mod');Module.FS.mkdirTree('/saves');Module.FS.mkdirTree('/cache');
  // Persist the pipeline cache once per match (see onFrame), not on every multi-MB write.
  Module.FS.mount(Module.FS.filesystems.IDBFS,{autoPersist:false},'/cache');
  Module.FS.mount(Module.FS.filesystems.IDBFS,{autoPersist:true},'/saves');
  await new Promise((resolve,reject)=>Module.FS.syncfs(true,error=>error?reject(error):resolve()));
  const migrated=migrateLegacySaves(Module.FS);if(migrated.length){await new Promise((resolve,reject)=>Module.FS.syncfs(false,error=>error?reject(error):resolve()));report('log',{text:'Imported existing Melee saves into upstream memory-card format.'});}
  const seed=await seedBytes;if(seed)Module.FS.writeFile('/initial_pipeline_cache.db',seed);
  Module.discFile=data.iso;Module.readDisc=createDiscCache(data.iso).read;Module.ENV.MELEE_SEED='3';
  const args=data.args||[];if(args.includes('--seed'))Module.ENV.MELEE_SEED=args[args.indexOf('--seed')+1];
  // Standby loads the module and files only. Native graphics/cache setup runs
  // after Play, so its synchronous initialization cannot interrupt the roster.
  ready=true;report('ready-for-selection');
  if(!data.warm&&data.launch){const c=Array.isArray(data.launch)?{mode:data.launch[0],stage:data.launch[1],level:data.launch[2],stocks:data.launch[3],minutes:data.launch[4],packedPorts:data.launch.slice(5)}:data.launch;await select({...data,launch:c});}
 }catch(error){fail(error);}
});
report('bridge-ready');
