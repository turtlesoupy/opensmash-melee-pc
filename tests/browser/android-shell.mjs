/** Full website E2E on an explicitly selected, USB-connected Android phone.
 * First select/verify a disc through the website's native file picker.
 * ADB_SERIAL=... PLAYWRIGHT_MODULE=... node tests/browser/android-shell.mjs
 * The full shell must be open at MELEE_SHARED_URL (default localhost:5299/melee).
 */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const serial=process.env.ADB_SERIAL;if(!serial)throw Error('Set ADB_SERIAL explicitly.');
const output=process.env.TEST_OUTPUT||'build/saga/full-shell',target=process.env.MELEE_SHARED_URL||'http://localhost:5299/melee';
const windows=Number(process.env.MELEE_WINDOWS||3),width=Number(process.env.MELEE_WIDTH||640);
await mkdir(output,{recursive:true});
const browser=await chromium.connectOverCDP(process.env.CDP_URL||'http://localhost:9224');
try{
 const page=browser.contexts()[0].pages().find(p=>p.url().startsWith(target));assert.ok(page,'Open the full website shell first.');
 const errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.waitForFunction(()=>window.openSmashReactBridge?.isAuthorized(),null,{timeout:120000});
 await page.waitForFunction(()=>!document.body.classList.contains('is-advanced-open'));
 await page.evaluate(()=>{if(window.androidShellListener)removeEventListener('message',androidShellListener);window.androidShellEvents=[];window.androidShellListener=e=>{if(e.origin===location.origin&&e.data?.type&&!['frame','metrics','pad','progress'].includes(e.data.type))androidShellEvents.push(e.data);};addEventListener('message',androidShellListener);});
 await page.evaluate(()=>openSmashReactBridge.launch({type:'character',slug:'donaldtrump',picks:['abrahamlincoln','barackobama','jesuschrist']}));
 await page.waitForFunction(()=>androidShellEvents.some(e=>e.type==='playable')||androidShellEvents.some(e=>e.type==='error'),null,{timeout:180000});
 assert.equal(await page.evaluate(()=>androidShellEvents.filter(e=>e.type==='error').length),0);
 const frame=page.frames().find(f=>f.url().includes('/upstream/runtime.html'));assert.ok(frame);
 const initial=await frame.evaluate(()=>({size:[Module.canvas.width,Module.canvas.height],heap:HEAPU8.length,scene:Module._direct_scene_kind(),prep:Module._opensmash_preparation_state()}));
 assert.deepEqual(initial.size,[width,width*3/4]);assert.equal(initial.scene,2);assert.equal(initial.prep,4);
 console.log('Full website match ready',initial);
 if(process.env.MELEE_TOUCH!=='0'){
  await frame.evaluate(()=>{window.touchEvidence=[];const original=Module._direct_set_pad;Module._direct_set_pad=(...args)=>{if(args[0]===0){touchEvidence.push(args);if(touchEvidence.length>600)touchEvidence.shift();}return original(...args);};});
  const cdp=await page.context().newCDPSession(page);
  async function touch(selector,dx=.5,hold=250){const r=await page.locator(selector).boundingBox();assert.ok(r);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*dx,y:r.y+r.height*.5}]});await page.waitForTimeout(hold);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150);}
  await touch('.melee-touch-deck .touch-main',.85,500);await touch('.melee-touch-deck .touch-x');await touch('.melee-touch-deck .touch-a');
  const evidence=await frame.evaluate(()=>touchEvidence);
  assert.ok(evidence.some(a=>a[2]>40),'Analog movement reached engine');assert.ok(evidence.some(a=>a[1]&0x400),'Jump reached engine');assert.ok(evidence.some(a=>a[1]&0x100),'Attack reached engine');assert.deepEqual(evidence.at(-1).slice(1,4),[0,0,0],'Released input is neutral');
  await writeFile(output+'/touch.json',JSON.stringify(evidence));
 }
 await page.waitForFunction(n=>androidShellEvents.filter(e=>e.type==='combat-performance').length>=n,windows,{timeout:windows*30000+60000});
 const result=await page.evaluate(()=>({windows:androidShellEvents.filter(e=>e.type==='combat-performance'),session:androidShellEvents.find(e=>e.type==='session'),errors:androidShellEvents.filter(e=>e.type==='error'),fits:window.meleeNativeFits,settings:JSON.parse(localStorage.getItem('melee-launch-v1')||'{}')}));
 result.runtime=await frame.evaluate(()=>({size:[Module.canvas.width,Module.canvas.height],heap:HEAPU8.length,snapshot:Array.from(HEAPF32.slice(Module._direct_snapshot()/4,Module._direct_snapshot()/4+48))}));
 result.pageErrors=errors;result.thermal=execFileSync('adb',['-s',serial,'shell','dumpsys','thermalservice'],{encoding:'utf8'});
 await writeFile(output+'/result.json',JSON.stringify(result,null,2));
 await writeFile(output+'/device.png',execFileSync('adb',['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024}));
 assert.equal(errors.length,0);assert.equal(result.errors.length,0);assert.equal(result.runtime.heap,initial.heap,'WASM heap did not grow during combat');
 assert.equal(result.session.launch.packedPorts.filter(p=>(p>>>8&255)!==3).length,4);
 for(const w of result.windows){assert.ok(w.fps>=30,`FPS ${w.fps}`);assert.ok(w.audioRenderedSamples>w.durationMs*48*.95,'Audio consumer advanced');}
 console.log(JSON.stringify(result.windows));
 await page.evaluate(()=>removeEventListener('message',androidShellListener));
}finally{await browser.close();}
