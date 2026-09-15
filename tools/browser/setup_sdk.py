#!/usr/bin/env python3
"""Install the exact browser SDK used by the OpenSmash build."""
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SDK = Path(os.environ.get('MELEE_EMSDK', ROOT / 'build/browser/emsdk'))
VERSION = '6.0.9'
if not SDK.exists():
    subprocess.run(['git', 'clone', 'https://github.com/emscripten-core/emsdk.git', str(SDK)], check=True)
for action in ('install', 'activate'):
    subprocess.run([str(SDK / 'emsdk'), action, VERSION], check=True)
