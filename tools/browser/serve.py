#!/usr/bin/env python3
"""Local isolated-origin server for the upstream browser runtime."""
import argparse,http.server,pathlib,shutil
root=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=5190);p.add_argument('--fixtures',type=pathlib.Path,help='Local generated test assets; never distributed with the engine');a=p.parse_args()
output=root/'build/browser/runtime/platforms/browser'
shutil.copyfile(root/'platforms/browser/index.html',output/'index.html')
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(output),**kwargs)
 def translate_path(self,path):
  if a.fixtures and path.startswith('/fixtures/'):
   original=self.directory
   try:
    self.directory=str(a.fixtures.resolve());return super().translate_path(path[len('/fixtures'):])
   finally:self.directory=original
  return super().translate_path(path)
 def end_headers(self):
  self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');super().end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1',a.port),Handler).serve_forever()
