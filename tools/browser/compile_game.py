#!/usr/bin/env python3
"""Compile upstream game units through the DISC_STRUCT lowering pass."""
import argparse, concurrent.futures, hashlib, json, os, pathlib, subprocess
from execution_charset import cp932_literals
ROOT=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--jobs',type=int,default=6);p.add_argument('--source',action='append');a=p.parse_args()
llvm=pathlib.Path(os.environ.get('LLVM_ROOT','/opt/homebrew/opt/llvm@22'));sdk=pathlib.Path(os.environ.get('MELEE_EMSDK',str(ROOT/'build/browser/emsdk')))
out=ROOT/'build/browser/game';out.mkdir(parents=True,exist_ok=True)
clang=str(llvm/'bin/clang');lower=os.environ.get('DISC_LOWER',str(ROOT/'build/browser/disc_lower'))
flags=['--target=wasm32-unknown-emscripten','--sysroot='+str(sdk/'upstream/emscripten/cache/sysroot'),'-D__EMSCRIPTEN__','-DTARGET_PC=1','-DMELEE_PC=1','-DOPENSMASH_DISC_LOWERING=1','-Iextern/aurora/include','-Isrc','-Isrc/sdk_include','-include','dolphin/gx.h','-include','src/pc/compat.h','-include','tools/browser/disc_access.h','-Wno-everything','-ferror-limit=5','-pthread']
sources=[ROOT/x for x in a.source] if a.source else sorted(list((ROOT/'src/melee').rglob('*.c'))+list((ROOT/'src/sysdolphin').rglob('*.c'))+[ROOT/'src/pc/vtxarray.c']+[ROOT/'platforms/browser'/n for n in ['launch.c','presentation.c','skinning.c']])
sources=[s for s in sources if s.name!='debugconsole_main.c']
# An upstream sync may remove or rename a translation unit. Never link an old
# object merely because it remains in the build directory.
if not a.source:
 expected={out/s.relative_to(ROOT).with_suffix('.o') for s in sources}
 for stale in out.rglob('*.o'):
  if stale not in expected:stale.unlink()
def build(s):
 rel=str(s.relative_to(ROOT));base=out/rel;base.parent.mkdir(parents=True,exist_ok=True);ii=base.with_suffix('.i');cc=base.with_suffix('.lowered.c');obj=base.with_suffix('.o');log=base.with_suffix('.log')
 key=hashlib.sha256(s.read_bytes()+(ROOT/'tools/browser/disc_lower.cpp').read_bytes()+(ROOT/'tools/browser/disc_access.h').read_bytes()).hexdigest()
 commands=[[clang,*flags,'-E',str(s),'-o',str(ii)],[lower,str(ii),'--target=wasm32-unknown-emscripten'],[str(sdk/'upstream/emscripten/emcc'),'-Wno-everything','-ferror-limit=5','-O2','-pthread','-ffp-contract=off','-fno-fast-math','-fno-builtin-sinf','-fno-builtin-cosf','-fno-builtin-tanf','-fno-builtin-atanf','-ftrivial-auto-var-init=zero','-fno-strict-aliasing','-fwrapv','-c',str(cc),'-o',str(obj)]]
 with log.open('w') as err:
  for i,cmd in enumerate(commands):
   if i==1:
    ii.write_text(cp932_literals(ii.read_text()))
    with cc.open('w') as stdout:r=subprocess.run(cmd,cwd=ROOT,stdout=stdout,stderr=err)
   else:r=subprocess.run(cmd,cwd=ROOT,stdout=err,stderr=err)
   if r.returncode:return {'source':rel,'stage':i,'status':'failed','log':str(log.relative_to(ROOT))}
 return {'source':rel,'status':'passed','key':key}
with concurrent.futures.ThreadPoolExecutor(max_workers=a.jobs) as ex:
 results=[]
 for r in ex.map(build,sources):
  results.append(r)
  if r['status']=='failed':print(r['source'],'FAILED',r['stage'],flush=True)
  elif len(results)%100==0:print(len(results),'units',flush=True)
(out/('report-partial.json' if a.source else 'report.json')).write_text(json.dumps(results,indent=2)+'\n');print(sum(r['status']=='passed' for r in results),'/',len(results),'compiled')
raise SystemExit(any(r['status']=='failed' for r in results))
