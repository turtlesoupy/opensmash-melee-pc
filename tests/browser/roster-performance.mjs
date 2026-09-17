/** Measure the parent roster while the real engine initializes in its iframe. */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.TEST_OUTPUT||'build/roster-performance';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),events=[],errors=[];
page.on('pageerror',e=>{if(!e.stack?.includes('youtube-nocookie'))errors.push(e.stack);});
await page.exposeFunction('recordRosterEvent',data=>events.push({...data,at:Date.now()}));
await page.addInitScript(()=>{
 window.addEventListener('message',e=>{if(e.origin===location.origin&&['disc-verified','ready-for-selection','error','log'].includes(e.data?.type))window.recordRosterEvent(e.data);});
});
try{
 await page.goto(process.env.MELEE_SHARED_URL||'http://127.0.0.1:5298/melee');await page.bringToFront();
 await page.waitForFunction(()=>window.openSmashReactBridge?.experience==='melee');
 await page.locator('body').click({position:{x:10,y:10}});
 await page.evaluate(()=>{
  window.browseFrames=[];let last=performance.now();
  const tick=now=>{window.browseFrames.push({at:Date.now(),ms:now-last});last=now;requestAnimationFrame(tick);};requestAnimationFrame(tick);
  const input=document.createElement('input');input.type='file';input.id='perf-disc';input.onchange=()=>window.openSmashReactBridge.validateRom(input.files[0]);document.body.append(input);
 });
 const cdp=await page.context().newCDPSession(page);
 if(process.env.PROFILE){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
 await page.locator('#perf-disc').setInputFiles(process.env.MELEE_ISO);
 const deadline=Date.now()+60000;
 while(!events.some(e=>e.type==='ready-for-selection')&&Date.now()<deadline){await page.mouse.wheel(0,120);await page.waitForTimeout(100);}
 assert.ok(events.some(e=>e.type==='ready-for-selection'),'Engine reached standby');
 if(process.env.PROFILE){const {profile}=await cdp.send('Profiler.stop');await writeFile(output+'/cpu.json',JSON.stringify(profile));}
 await page.waitForTimeout(2000);
 const frames=await page.evaluate(()=>window.browseFrames);
 const start=events.find(e=>e.type==='disc-verified').at,end=events.find(e=>e.type==='ready-for-selection').at;
 function stats(list){const a=list.map(f=>f.ms).sort((a,b)=>a-b);return {frames:a.length,p99:a[Math.floor(a.length*.99)]||0,max:a.at(-1)||0,over50:a.filter(x=>x>50).length,over100:a.filter(x=>x>100).length};}
 const result={warmingMs:end-start,warming:stats(frames.filter(f=>f.at>=start&&f.at<=end)),idle:stats(frames.filter(f=>f.at>end+100)),errors};
 console.log(JSON.stringify(result));await writeFile(output+'/summary.json',JSON.stringify(result,null,2));await writeFile(output+'/events.json',JSON.stringify(events,null,2));
 assert.equal(errors.length,0);assert.ok(!events.some(e=>e.type==='error'));
 assert.ok(!events.some(e=>e.type==='log'&&e.text?.includes('Aurora initializing')),'Native graphics must wait for Play');
 if(!process.env.PROFILE)assert.ok(result.warming.max<100,'Background initialization must not stall browsing for 100ms');
}finally{await browser.close();}
