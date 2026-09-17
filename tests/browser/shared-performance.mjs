/** Headed performance regression through the unified shell and its real audio path.
 * MELEE_ISO=... PLAYWRIGHT_MODULE=... MELEE_SHARED_URL=http://127.0.0.1:5298/melee
 * node tests/browser/shared-performance.mjs
 */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const iso=process.env.MELEE_ISO;if(!iso)throw Error('MELEE_ISO is required');
const targetWindows=Number(process.env.MELEE_WINDOWS||3);assert.ok(Number.isInteger(targetWindows)&&targetWindows>0);
const output=path.resolve(process.env.TEST_OUTPUT||'build/shared-performance');await mkdir(output,{recursive:true});
const url=new URL(process.env.MELEE_SHARED_URL||'http://127.0.0.1:5298/melee');url.searchParams.set('benchmark','1');
const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:['--mute-audio']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),events=[],errors=[],externalErrors=[];
page.on('pageerror',e=>(e.stack?.includes('https://www.youtube-nocookie.com/')?externalErrors:errors).push(e.stack));
await page.exposeFunction('recordMeleePerf',data=>{events.push({...data,observedAt:Date.now()});if(['combat-performance','startup-performance','error'].includes(data.type))console.log(JSON.stringify(data));});
await page.addInitScript(()=>{
 sessionStorage.setItem('opensmash-advanced-options',JSON.stringify({selectionMode:'full-roster',ports:['keyboard','cpu','cpu','cpu']}));
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||!e.data?.type||['frame','metrics','pad'].includes(e.data.type))return;
  window.recordMeleePerf(e.data);
 });
});
try{
 await page.goto(url.href);await page.bringToFront();
 await page.waitForFunction(()=>window.openSmashReactBridge?.experience==='melee');
 await page.locator('body').click({position:{x:10,y:10}});
 // Use the shell's real disc selection and launch bridge, including persistence,
 // character fitting, controller assignments, overlays, and the warmed iframe.
 await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='perf-disc';input.onchange=()=>window.openSmashReactBridge.validateRom(input.files[0]);document.body.append(input);});
 await page.locator('#perf-disc').setInputFiles(iso);
 await page.waitForFunction(()=>window.openSmashReactBridge.isAuthorized(),null,{timeout:180000});
 await page.evaluate(()=>window.openSmashReactBridge.launch({type:'character',slug:'donaldtrump',picks:['abrahamlincoln','barackobama','jesuschrist']}));
 const deadline=Date.now()+180000;let watched=false,playable=false;
 while(Date.now()<deadline){
  await page.waitForTimeout(500);
  const alerts=await page.locator('.game-message[role=alert]').allTextContents();assert.equal(alerts.length,0,alerts.join('\n'));
  assert.equal(errors.length,0,errors.join('\n'));
  assert.ok(!events.some(e=>e.type==='error'),JSON.stringify(events.filter(e=>e.type==='error')));
  const frame=page.frames().find(f=>f.url().includes('/upstream/runtime.html'));
  if(frame&&!watched){
   watched=await frame.evaluate(()=>{
    const canvas=document.querySelector('canvas');if(!window.Module?._opensmash_preparation_state)return false;
    let previous='';new MutationObserver(()=>{
     const visibility=canvas.style.visibility;if(visibility===previous)return;previous=visibility;
     parent.postMessage({type:'presentation-state',visibility,intro:Module._opensmash_intro_state(),preparation:Module._opensmash_preparation_state()},location.origin);
    }).observe(canvas,{attributes:true,attributeFilter:['style']});return true;
   });
  }
  if(events.some(e=>e.type==='playable')&&!playable){playable=true;await page.screenshot({path:path.join(output,'match-start.png')});}
  if(events.filter(e=>e.type==='combat-performance').length>=targetWindows)break;
 }
 const windows=events.filter(e=>e.type==='combat-performance');assert.equal(windows.length,targetWindows,'Complete combat windows are required');
 const launch=events.find(e=>e.type==='session')?.launch;assert.equal(launch?.packedPorts.filter(p=>(p>>>8&255)!==3).length,4);
 const reveals=events.filter(e=>e.type==='presentation-state'&&e.visibility==='visible'&&e.intro===3);
 assert.ok(reveals.length,'Match reveal was observed');assert.ok(reveals.every(e=>e.preparation===4),'No match frame may appear before preparation ends');
 const stalls=events.filter(e=>e.type==='frame-stall'&&e.preparation===4&&e.intro===3);
 const playableIndex=events.findIndex(e=>e.type==='playable');
 const summary={url:url.href,launch,windows,firstProgress:events.slice(playableIndex).filter(e=>e.type==='progress').slice(0,6),worstStalls:stalls.sort((a,b)=>b.durationMs-a.durationMs).slice(0,10),presentation:events.filter(e=>e.type==='presentation-state'),errors,externalErrors};
 await writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
 await page.screenshot({path:path.join(output,'match-end.png')});
 // Tail latency and actual audio consumption are gates, not just average FPS.
 for(const w of windows){assert.ok(w.fps>=58.5,`Low FPS: ${w.fps}`);assert.ok(w.p99<33.34,`p99: ${w.p99}`);assert.ok(w.maxFrameMs<100,`Stall: ${w.maxFrameMs}ms`);assert.equal(w.audioUnderrunSamples,0);assert.ok(w.audioRenderedSamples>w.durationMs*48*.95,'Audio must really be consumed');}
 console.log('Unified-shell four-player performance passed');
}finally{await writeFile(path.join(output,'events.json'),JSON.stringify(events,null,2));await browser.close();}
