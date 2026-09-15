#!/usr/bin/env python3
"""Build the checked-in DISC_STRUCT compiler with LLVM development libraries."""
import os,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parents[2]
llvm=pathlib.Path(os.environ.get('LLVM_ROOT','/opt/homebrew/opt/llvm@22'))
output=root/'build/browser/disc_lower';output.parent.mkdir(parents=True,exist_ok=True)
subprocess.run([str(llvm/'bin/clang++'),'-std=c++20','-O1',str(root/'tools/browser/disc_lower.cpp'),'-I'+str(llvm/'include'),'-L'+str(llvm/'lib'),'-Wl,-rpath,'+str(llvm/'lib'),'-lclang-cpp','-lLLVM','-o',str(output)],check=True)
print(output)
