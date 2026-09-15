/** Real-disc browser validation. MELEE_ISO and PLAYWRIGHT_MODULE are required. */
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const iso=process.env.MELEE_ISO;
if(!iso)throw Error('Set MELEE_ISO to your GALE01 revision 2 disc.');
const output=path.resolve(process.env.TEST_OUTPUT||'build/browser/e2e');
await mkdir(output,{recursive:true});
const group=process.argv[2]||'smoke';
const customNames=['captain-falcon','donkey-kong','fox','game-watch','kirby','bowser','link','luigi','mario','marth','mewtwo','ness','peach','pikachu','popo','jigglypuff','samus','yoshi','zelda','sheik','falco','young-link','dr-mario','roy','pichu','ganondorf'];
const tests=group==='custom'?customNames.map((name,fighter)=>({name:`custom-${name}`,ports:[256+fighter,257,768,768],stage:31,fixture:`custom-target-${name}-fixture` })):group==='roster'?Array.from({length:26},(_,fighter)=>({name:`fighter-${fighter}`,ports:[256+fighter,257,768,768],stage:31})):group==='stages'?Array.from({length:31},(_,i)=>i+2).filter(n=>![21,26].includes(n)).map(stage=>({name:`stage-${stage}`,ports:[257,258,768,768],stage})):[{name:'two-player',ports:[257,258,768,768],stage:31},{name:'four-player',ports:[257,258,259,260],stage:31}];
const results=[];
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 for(const test of tests.filter(t=>!process.env.MELEE_CASES||process.env.MELEE_CASES.split(',').includes(t.name))){
  const page=await browser.newPage({viewport:{width:1000,height:950}}),errors=[],logs=[];
  let rejectFatal;const fatal=new Promise((_,reject)=>rejectFatal=reject);fatal.catch(()=>{});
  page.on('pageerror',e=>{errors.push(e.stack);console.error(test.name,e.stack);rejectFatal(e);});
  page.on('console',m=>{logs.push(m.text());if(/panic|fatal|abort\(/i.test(m.text()))errors.push(m.text());});
  let result={...test};
  try{
   await page.addInitScript(launch=>{window.directLaunch=launch;},[0,test.stage,9,4,8,...test.ports]);
   await page.goto((process.env.MELEE_TEST_URL||'http://127.0.0.1:5190/')+'?mode=vs'+(test.fixture?'&fixture='+encodeURIComponent(test.fixture):''));
   await page.locator('#disc').setInputFiles(iso);
   await page.waitForFunction(()=>!document.querySelector('#start').disabled);
   await page.evaluate(()=>{Module._direct_set_pad(0,0,0,0,0,0,0,0,1);window.audioStats={frames:0,peak:0,start:performance.now()};Module.onAudio=samples=>{audioStats.frames+=samples.length/2;for(const s of samples)audioStats.peak=Math.max(audioStats.peak,Math.abs(s));};Module.audioRequested=()=>audioStats.frames<(performance.now()-audioStats.start)*32;});
   const start=Date.now();await page.locator('#start').click();
   await Promise.race([fatal,page.waitForFunction(()=>Module._direct_scene_kind()===2&&![1,2].includes(Module._opensmash_intro_state())&&frameSamples.length>=180,null,{timeout:120000})]);
   result.startupMs=Date.now()-start;
   await page.evaluate(()=>{window.frameSamples=[];});
   await page.waitForTimeout(group==='smoke'?30000:3000);
   Object.assign(result,await page.evaluate(()=>{
    const samples=frameSamples.map(x=>x.dt),ordered=[...samples].sort((a,b)=>a-b),duration=samples.reduce((a,b)=>a+b,0);
    const offset=Module._direct_snapshot()/4;
    return {audio:window.audioStats,frames:samples.length,durationMs:duration,fps:samples.length*1000/duration,p95:ordered[Math.floor(ordered.length*.95)],p99:ordered[Math.floor(ordered.length*.99)],maxFrameMs:ordered.at(-1),scene:Module._direct_scene(),sceneKind:Module._direct_scene_kind(),snapshot:Array.from(HEAPF32.slice(offset,offset+48))};
   }));
   if(result.sceneKind!==2||result.frames<30)throw Error('Match did not continue advancing.');
   for(let i=0;i<test.ports.length;i++)if((test.ports[i]>>>8)!==3&&!result.snapshot[i*12])throw Error(`Player ${i} missing.`);
   if(test.fixture&&!logs.some(l=>l.includes('direct skinning vertices=')))throw Error('Custom skinning was not used.');
   const oracle=logs.flatMap(l=>{const m=l.match(/max_matrix_error=([\d.e+-]+)/);return m?[Number(m[1])]:[];});if(oracle.some(n=>n>.002))throw Error('Custom skinning differs from the reference matrices.');
   result.skinningOracle=oracle;
   if(errors.length)throw Error(errors.join('\n'));
   result.status='passed';
  }catch(error){result.status='failed';result.error=error.stack;}
  result.errors=errors;
  await page.screenshot({path:path.join(output,test.name+'.png'),timeout:5000}).catch(()=>{});
  await page.close();results.push(result);
  await writeFile(path.join(output,group+'.json'),JSON.stringify({group,results},null,2)+'\n');
  console.log(test.name,result.status,result.fps?.toFixed(2),result.error||'');
 }
}finally{await browser.close();}
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
