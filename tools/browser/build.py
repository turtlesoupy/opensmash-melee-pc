#!/usr/bin/env python3
"""Build the upstream game and Aurora browser runtime using the pinned SDK."""
import argparse,os,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--jobs',type=int,default=6);a=p.parse_args()
sdk=pathlib.Path(os.environ.get('MELEE_EMSDK',str(root/'build/browser/emsdk')))
def run(cmd):subprocess.run(list(map(str,cmd)),cwd=root,check=True)
run([sys.executable,root/'tests/browser/test_execution_charset.py'])
run([sys.executable,root/'tools/browser/build_lower.py'])
run([sys.executable,root/'tools/browser/test_disc_lower.py'])
run([sys.executable,root/'tools/browser/compile_game.py','--jobs',a.jobs])
run([sdk/'upstream/emscripten/emcmake','cmake','-S',root,'-B',root/'build/browser/runtime','-G','Ninja','-DCMAKE_BUILD_TYPE=Release'])
run(['cmake','--build',root/'build/browser/runtime','--target','melee_browser','-j',a.jobs])

run(['node','--test',*sorted((root/'tests/browser').glob('*.test.mjs'))])
llvm=pathlib.Path(os.environ.get('LLVM_ROOT','/opt/homebrew/opt/llvm@22'))
check=root/'build/browser/presentation-memory-test'
run([llvm/'bin/clang','-fsanitize=address,undefined','-g',root/'tests/browser/presentation_memory.c',root/'platforms/browser/presentation_memory.c','-o',check])
run([check])
