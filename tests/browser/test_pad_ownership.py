"""Compile the real PADRead ownership gate with a simulated SDL backend."""
import os
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


def function(source, signature):
    start = source.index(signature)
    opening = source.index('{', start)
    depth = 1
    end = opening + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]


class PadOwnershipTest(unittest.TestCase):
    def test_browser_exclusive_and_native_additive(self):
        source = (ROOT / 'extern/aurora/lib/dolphin/pad/pad.cpp').read_text()
        header = (ROOT / 'extern/aurora/include/dolphin/pad.h').read_text()
        status = header[header.index('typedef struct PADStatus {'):header.index('} PADStatus;') + len('} PADStatus;')]
        # Preserve the actual gate's location before SDL controller polling.
        read = function(source, 'u32 PADRead(')
        prefix = read[:read.index('    auto controller =')]
        helpers = '\n'.join(function(source, name) for name in [
            'static void neutralize_status(', 'static int dominant_axis_value(',
            'static void merge_virtual_status(', 'void PADSetVirtualStatus(',
            'void PADClearVirtualStatus(', 'void PADClearAllVirtualStatus('])
        program = r'''
#include <algorithm>
#include <array>
#include <cassert>
#include <cstdint>
#include <cstdlib>
#include <cstring>
using s8=int8_t; using u8=uint8_t; using u16=uint16_t; using u32=uint32_t;
constexpr unsigned PAD_CHANMAX=4, PAD_CHAN0_BIT=0x80000000;
constexpr int PAD_ERR_NONE=0;
''' + status + r'''
std::array<PADStatus,4> g_virtualPadStatus{}, physical{};
std::array<bool,4> g_virtualPadActive{};
bool g_initialized=true,g_suppressHeldOnRead=false,g_blockPAD=false;
struct {void fatal(const char*){assert(false);}} Log;
const bool* SDL_GetKeyboardState(int*){static bool keys[1]{};return keys;}
bool device_rumble_available_for_port(unsigned){return false;}
unsigned physicalReads=0;
''' + helpers + '\n' + prefix + r'''
    // Stand in for SDL polling; ownership must skip this entire backend.
    ++physicalReads;
    status[i]=physical[i];
    if(g_blockPAD)neutralize_status(status[i]);
    else if(g_virtualPadActive[i])merge_virtual_status(status[i],g_virtualPadStatus[i]);
  }
  return rumbleSupport;
}
int main(){
  PADStatus out[4]{};
  for(unsigned button : {0x100u,0x200u}) {
    PADClearAllVirtualStatus();
    physical[0]={};physical[0].button=button;
    physical[0].stickX=100;physical[0].triggerLeft=255;
    PADStatus launcher{};launcher.button=button==0x100?0x200:0x100;
    launcher.stickX=-40;launcher.triggerLeft=30;
    PADSetVirtualStatus(0,&launcher);physicalReads=0;PADRead(out);
#ifdef __EMSCRIPTEN__
    assert(out[0].button==launcher.button); // swapped A/B never becomes A+B
    assert(out[0].stickX==-40&&out[0].triggerLeft==30);
    assert(physicalReads==3); // other ports still use SDL
#else
    assert(out[0].button==0x300); // native keyboard overlay stays additive
    assert(out[0].stickX==100&&out[0].triggerLeft==255);
    assert(physicalReads==4);
#endif
    launcher={};PADSetVirtualStatus(0,&launcher);PADRead(out);
#ifdef __EMSCRIPTEN__
    assert(out[0].button==0&&out[0].stickX==0&&out[0].triggerLeft==0);
#endif
    launcher.err=-1;PADSetVirtualStatus(0,&launcher);PADRead(out);
#ifdef __EMSCRIPTEN__
    assert(out[0].err==-1&&out[0].button==0);
#else
    assert(g_virtualPadStatus[0].err==0);
#endif
    launcher={};launcher.button=0x200;launcher.extButton=1;launcher.stickX=50;
    PADSetVirtualStatus(0,&launcher);g_blockPAD=true;PADRead(out);
    assert(out[0].button==0&&out[0].stickX==0);
#ifdef __EMSCRIPTEN__
    assert(out[0].extButton==0);
#endif
    g_blockPAD=false;PADRead(out);
#ifdef __EMSCRIPTEN__
    assert(out[0].button==0x200);
#endif
    PADClearVirtualStatus(0);PADRead(out);assert(out[0].button==button);
  }
}
'''
        with tempfile.TemporaryDirectory() as directory:
            cpp = pathlib.Path(directory) / 'pad.cpp'
            cpp.write_text(program)
            for browser in (False, True):
                with self.subTest(browser=browser):
                    binary = pathlib.Path(directory) / ('browser' if browser else 'native')
                    command = [os.environ.get('CXX', 'clang++'), '-std=c++17', '-DTARGET_PC']
                    if browser:
                        command.append('-D__EMSCRIPTEN__')
                    subprocess.run(command + [str(cpp), '-o', str(binary)], check=True)
                    subprocess.run([str(binary)], check=True)


if __name__ == '__main__':
    unittest.main()
