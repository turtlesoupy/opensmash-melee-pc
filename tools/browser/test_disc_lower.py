#!/usr/bin/env python3
"""Compare host Clang and WASM lowered results with unmodified GCC semantics."""
import os,pathlib,subprocess,shutil
from execution_charset import cp932_literals
root=pathlib.Path(__file__).resolve().parents[2];out=root/'build/browser/compiler-tests';out.mkdir(parents=True,exist_ok=True)
llvm=pathlib.Path(os.environ.get('LLVM_ROOT','/opt/homebrew/opt/llvm@22'));sdk=pathlib.Path(os.environ.get('MELEE_EMSDK',str(root/'build/browser/emsdk')));lower=os.environ.get('DISC_LOWER',str(root/'build/browser/disc_lower'));gcc=shutil.which('gcc-16')
if not gcc:raise SystemExit('GCC 16 is required for the scalar-storage-order oracle.')
def run(cmd,**kw):return subprocess.run(list(map(str,cmd)),cwd=root,check=True,capture_output=True,**kw).stdout
for src in sorted((root/'tests/browser').glob('disc_*.c')):
 name=src.stem;binary=out/name
 run([gcc,'-w','-fexec-charset=CP932',src,'-o',binary]);expected=run([binary])
 for target in ['host','wasm']:
  flags=[] if target=='host' else ['--target=wasm32-unknown-emscripten','--sysroot='+str(sdk/'upstream/emscripten/cache/sysroot')]
  ii=out/(name+'-'+target+'.i');cc=ii.with_suffix('.c')
  ii.write_bytes(run([llvm/'bin/clang',*flags,'-E','-include','tools/browser/disc_access.h','-DOPENSMASH_DISC_LOWERING',src]))
  ii.write_text(cp932_literals(ii.read_text()))
  cc.write_bytes(run([lower,ii,*(['--target=wasm32-unknown-emscripten'] if target=='wasm' else [])]))
  if target=='host':
   run([llvm/'bin/clang','-O2','-w',cc,'-o',binary]);actual=run([binary])
  else:
   js=out/(name+'.js');run([sdk/'upstream/emscripten/emcc','-O2','-w',cc,'-o',js]);actual=run([sdk/'node/24.19.0_64bit/bin/node',js])
  assert actual==expected,(name,target,expected,actual)
  print(name,target,'matches GCC values and bytes',flush=True)
