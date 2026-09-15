/** Validate menus, results, rematches, and memory-card persistence using a local disc. */
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const iso=process.env.MELEE_ISO;if(!iso)throw Error('MELEE_ISO is required');
const output=path.resolve(process.env.TEST_OUTPUT||'build/browser/flows');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-audio-output']});
const results=[];
async function press(page,buttons){
 await page.evaluate(buttons=>Module._direct_set_pad(0,buttons,0,0,0,0,0,0,1),buttons);
 let until=await page.evaluate(()=>Module._direct_frame_count()+4);
 await page.waitForFunction(until=>Module._direct_frame_count()>=until,until);
 await page.evaluate(()=>Module._direct_set_pad(0,0,0,0,0,0,0,0,1));
 until=await page.evaluate(()=>Module._direct_frame_count()+4);
 await page.waitForFunction(until=>Module._direct_frame_count()>=until,until);
}
async function open(page,launch,fixture,legacy){
 await page.addInitScript(launch=>window.directLaunch=launch,launch);
 await page.goto((process.env.MELEE_TEST_URL||'http://127.0.0.1:5190/')+'?mode=vs'+(fixture?'&fixture='+fixture:''));
 await page.locator('#disc').setInputFiles(iso);
 await page.waitForFunction(()=>!document.querySelector('#start').disabled);
 await page.evaluate(async legacy=>{
  Module.ENV.OPENSMASH_TESTING='1';Module.ENV.MELEE_SEED='3';
  Module.FS.mkdirTree('/saves');Module.FS.mount(Module.FS.filesystems.IDBFS,{autoPersist:true},'/saves');
  await new Promise((resolve,reject)=>Module.FS.syncfs(true,e=>e?reject(e):resolve()));
  if(legacy){Module.FS.writeFile('/saves/SuperSmashBros0110290334.sav',new Uint8Array(legacy));const {migrateLegacySaves}=await import('./save-migration.mjs');window.migrated=migrateLegacySaves(Module.FS);}
  Module._direct_set_pad(0,0,0,0,0,0,0,0,1);
  window.audioStats={frames:0,peak:0,start:performance.now()};
  Module.onAudio=s=>{audioStats.frames+=s.length/2;for(const v of s)audioStats.peak=Math.max(audioStats.peak,Math.abs(v));};
  Module.audioRequested=()=>audioStats.frames<(performance.now()-audioStats.start)*32;
 },legacy||null);
 await page.locator('#start').click();
}
async function state(page){return page.evaluate(()=>({scene:Module._direct_scene(),kind:Module._direct_scene_kind(),stage:Module._direct_stage(),intro:Module._opensmash_intro_state(),frame:Module._direct_frame_count(),input:Module._direct_input_snapshot?Array.from(HEAPF32.slice(Module._direct_input_snapshot()/4,Module._direct_input_snapshot()/4+12)):[],cursor:Module._direct_css_snapshot?Array.from(HEAPF32.slice(Module._direct_css_snapshot()/4,Module._direct_css_snapshot()/4+4)):[]}));}
const cases=[{name:'custom-results',mode:0,fixture:'four-fixture'},{name:'custom-css-pages',mode:2,fixture:'four-fixture'},{name:'classic',mode:3},{name:'adventure',mode:5},{name:'all-star',mode:6},{name:'vs-menu',mode:1},{name:'full-boot',mode:4}];
if(process.env.LEGACY_SAVE)cases.push({name:'legacy-save',mode:4,legacy:Array.from(await readFile(process.env.LEGACY_SAVE))});
try{for(const test of cases.filter(c=>!process.env.MELEE_CASES||process.env.MELEE_CASES.split(',').includes(c.name))){
 const context=await browser.newContext({viewport:{width:1000,height:950}}),page=await context.newPage(),errors=[],logs=[];
 page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>logs.push(m.text()));
 let result={name:test.name};
 try{
  await open(page,[test.mode,31,9,1,8,8,258,65800,131336],test.fixture,test.legacy);
  if(test.mode===0){
   await page.waitForFunction(()=>Module._direct_scene_kind()===2&&Module._opensmash_intro_state()===3,null,{timeout:120000});
   await page.waitForTimeout(3000);
   result.knockouts=await page.evaluate(()=>({queued:[1,2,3].map(p=>Module._direct_debug_knockout(p)),testing:Module.ENV.OPENSMASH_TESTING,preparation:Module._opensmash_preparation_state(),snapshot:Array.from(HEAPF32.slice(Module._direct_snapshot()/4,Module._direct_snapshot()/4+48))}));
   if(result.knockouts.queued.some(x=>x!==1))throw Error('Knockouts were not queued: '+JSON.stringify(result.knockouts));
   await page.waitForFunction(()=>Module._direct_scene_kind()===5,null,{timeout:45000});
   await page.waitForTimeout(4000);
   if(!logs.some(l=>l.includes('results identity port=')))throw Error('Custom results identity was not applied.');
   await page.screenshot({path:path.join(output,'custom-results.png')});
   for(let i=0;i<30&&(await state(page)).kind!==8;i++){await press(page,0x1000);await press(page,0x100);}
   if((await state(page)).kind!==8)throw Error('Results did not return to character select.');
   await page.screenshot({path:path.join(output,'return-css.png')});
   await page.waitForTimeout(4000);
   await page.waitForFunction(n=>Module._direct_frame_count()>=n,await page.evaluate(()=>Module._direct_frame_count()+120));
   await press(page,0x1000);
   await page.waitForFunction(()=>Module._direct_scene_kind()===9,null,{timeout:45000});
   await page.waitForTimeout(4000);
   await page.evaluate(()=>Module._direct_set_pad(0,0,0,60,0,0,0,0,1));
   await page.waitForFunction(n=>Module._direct_frame_count()>=n,await page.evaluate(()=>Module._direct_frame_count()+15));
   for(let i=0;i<60&&(await state(page)).kind!==2;i++)await press(page,0x100);
   if((await state(page)).kind!==2)throw Error('Character select did not start a rematch.');
   await page.waitForFunction(()=>{const p=Module._direct_snapshot()/4;return [0,12,24,36].every(i=>HEAPF32[p+i]===1)&&Module._opensmash_intro_state()===3;},null,{timeout:120000});
   await page.waitForTimeout(4000);
  }else if(test.mode===2){
   await page.waitForFunction(()=>Module._direct_scene_kind()===8,null,{timeout:120000});
   await page.waitForTimeout(4000);
   await page.waitForFunction(n=>Module._direct_frame_count()>=n,await page.evaluate(()=>Module._direct_frame_count()+120));
   await page.evaluate(()=>Module._direct_set_pad(0,0,127,127,0,0,0,0,1));
   await page.waitForFunction(until=>Module._direct_frame_count()>=until,await page.evaluate(()=>Module._direct_frame_count()+180));
   await page.evaluate(()=>Module._direct_set_pad(0,0,0,-40,0,0,0,0,1));
   await page.waitForFunction(()=>HEAPF32[Module._direct_css_snapshot()/4+1]<5,null,{polling:'raf'});
   await page.evaluate(()=>Module._direct_set_pad(0,0,0,0,0,0,0,0,1));
   await press(page,0x100);
   if(!logs.some(l=>l.includes('CSS page=')))throw Error('Controller input did not change the custom roster page.');
  }else if([3,5,6].includes(test.mode)){
   await page.waitForFunction(()=>Module._direct_scene_kind()===8,null,{timeout:120000});
   await page.screenshot({path:path.join(output,test.name+'-css.png')});
   await press(page,0x1000);
   for(let i=0;i<90&&(await state(page)).kind!==2;i++){await press(page,0x100);await press(page,0x1000);}
   if((await state(page)).kind!==2)throw Error('One-player mode did not reach gameplay.');
   await page.waitForTimeout(10000);
   if(test.mode===6){
    await page.evaluate(()=>[1,2,3].map(p=>Module._direct_debug_knockout(p)));
    await page.waitForTimeout(5000);
    for(let i=0;i<150&&(await state(page)).stage!==0x42;i++){await press(page,0x1000);}
    if((await state(page)).stage!==0x42)throw Error('All-Star did not enter the rest area after a victory.');
    await page.waitForTimeout(1000);
    await page.screenshot({path:path.join(output,'all-star-rest-area.png')});
   }
  }else{
   await page.waitForFunction(()=>Module._direct_frame_count()>300,null,{timeout:120000});
   result.bootState=await state(page);
   if(test.mode===4&&(result.bootState.scene>>>8)===40)throw Error('Boot remained at the memory-card prompt.');
   if(test.mode===4){for(let i=0;i<40&&((await state(page)).scene>>>8)!==1;i++)await press(page,0x1000);if(((await state(page)).scene>>>8)!==1)throw Error('Original title did not reach the main menu.');}
  }
  result.state=await state(page);
  await page.evaluate(()=>new Promise((resolve,reject)=>Module.FS.syncfs(false,e=>e?reject(e):resolve())));
  result.saves=await page.evaluate(()=>{
   const names=[];function visit(p){for(const n of Module.FS.readdir(p)){if(n==='.'||n==='..')continue;const f=p+'/'+n;if(Module.FS.isDir(Module.FS.stat(f).mode))visit(f);else names.push({path:f,bytes:Module.FS.stat(f).size});}}visit('/saves');return names;
  });
  if(!result.saves.some(s=>s.path.endsWith('.gci')&&s.bytes>8192))throw Error('No game save was written.');
  result.persisted=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('/saves');request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{const db=request.result;const all=db.transaction('FILE_DATA').objectStore('FILE_DATA').getAll();all.onerror=()=>reject(all.error);all.onsuccess=()=>{resolve(all.result.some(r=>r.contents?.length>8192));db.close();};};
  }));
  if(!result.persisted)throw Error('Memory-card bytes did not reach IndexedDB.');
  if(test.legacy){result.migrated=await page.evaluate(()=>window.migrated);if(result.migrated.length!==1)throw Error('Legacy save not imported.');}
  if(errors.length)throw Error(errors.join('\n'));
  result.status='passed';
 }catch(e){result.status='failed';result.error=e.stack;result.state=await state(page).catch(()=>null);
  if(process.env.TRACE_FAILURE){const cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await page.waitForTimeout(2000);const {profile}=await cdp.send('Profiler.stop');await writeFile(path.join(output,test.name+'-profile.json'),JSON.stringify(profile));}
 }
 await page.screenshot({path:path.join(output,test.name+'.png'),timeout:5000}).catch(()=>{});
 await writeFile(path.join(output,test.name+'.log'),logs.join('\n'));
 await context.close();results.push(result);console.log(result.name,result.status,result.error||'');
 await writeFile(path.join(output,'report.json'),JSON.stringify(results,null,2)+'\n');
}}finally{await browser.close();}
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
