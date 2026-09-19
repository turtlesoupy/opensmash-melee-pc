#include "pc/compat.h"
#include <dolphin/gx.h>
#include <string.h>
#include <dolphin/vi.h>
#include <melee/gm/gm_1A3F.h>
#include <melee/gm/gm_1601.h>
#include <melee/gm/gmvsmelee.h>
#include <melee/gm/gmvsmode.h>
#include <melee/gm/gmmain_lib.h>
#include <melee/gm/types.h>
#include <melee/mn/types.h>
#include <melee/ft/types.h>
#include <melee/ft/ft_0D31.h>
#include <melee/pl/player.h>
#include <melee/lb/lbdvd.h>
#include <sysdolphin/baselib/gobj.h>
#include <emscripten.h>
static int requested,routed,configured,mode,stage,level,stocks,minutes,launched;
static unsigned ports[4],sheik_pending;
EMSCRIPTEN_KEEPALIVE int direct_configure(int m,int st,int lv,int sk,int min,unsigned p0,unsigned p1,unsigned p2,unsigned p3){
 unsigned p[4]={p0,p1,p2,p3};if(m<0||m>6||st<2||st>32||st==21||st==26||lv<1||lv>9||sk<1||sk>99||min<0||min>99)return 0;
 int active=0;for(int i=0;i<4;i++){unsigned role=(p[i]>>8)&255;if((p[i]&255)>25||(role!=0&&role!=1&&role!=3)||(p[i]>>16)>5)return 0;if(role!=3)active++;}
 if(m==0&&active<2)return 0;
 for(int i=0;i<4;i++)if((p[i]&255)==19&&((p[i]>>8)&255)!=3)sheik_pending|=1u<<i;
 mode=m;stage=st;level=lv;stocks=sk;minutes=min;memcpy(ports,p,sizeof(p));requested=1;
 extern void direct_prepare_init(int);direct_prepare_init(m);return 1;
}

extern unsigned direct_present_hook(unsigned,unsigned,unsigned);
int direct_route(int original){direct_present_hook(19,0,0);if(!requested||routed||mode==4)return original;routed=1;return mode==1?GM_MENU:mode==3?GM_CLASSIC:mode==5?GM_ADVENTURE:mode==6?GM_ALLSTAR:GM_VS;}
void direct_mode_loaded(int kind){
 if(!requested||configured||mode==4)return;
 *gmMainLib_GetUnlockedCharactersBitmaskPtr()=0x7ff;gmMainLib_804D3EE0->thing.save_data.x186A=0x7ff;
 if ((kind == GM_CLASSIC && mode == 3) ||
     (kind == GM_ADVENTURE && mode == 5) ||
     (kind == GM_ALLSTAR && mode == 6)) {
   struct gmm_x0_528_t* prefs = kind == GM_CLASSIC ? gmMainLib_8015CDC8() :
       kind == GM_ADVENTURE ? gmMainLib_8015CDD4() : gmMainLib_8015CDE0();
   prefs->c_kind = (ports[0] & 255) == 19 ? 18 : ports[0] & 255;
   prefs->stocks = stocks;
   prefs->color = ports[0] >> 16;
   prefs->cpu_level = (level - 1) / 2;
   configured = 1;
   return;
 }
 if(kind!=GM_VS)return;
 VsModeData* vs=gmVsMelee_GetVsData();gm_SetupRulesDefaults(&vs->start.rules);vs->start.rules.stkind=stage;
 GameRules* rules=gmMainLib_GetGameRules();rules->mode=1;rules->stock_count=stocks;rules->stock_time_limit=minutes;
 for(int i=0;i<GM_MAX_PLAYERS;i++){gm_SetupPlayerDefaults(&vs->start.players[i]);PlayerInitData* p=&vs->start.players[i];p->slot=i;p->slot_type=i<4?(ports[i]>>8)&255:3;if(i<4){p->ckind=(ports[i]&255)==19?18:ports[i]&255;p->color=ports[i]>>16;p->cpu_level=level;p->stocks=stocks;}}
 configured=1;
}
EMSCRIPTEN_KEEPALIVE unsigned direct_frame_count(void){return VIGetRetraceCount();}
EMSCRIPTEN_KEEPALIVE unsigned direct_scene(void){return gm_GetCurrentGameMode()*256+gm_GetCurrentSceneIndex();}
unsigned direct_scene_kind_value;
EMSCRIPTEN_KEEPALIVE unsigned direct_scene_kind(void){return direct_scene_kind_value;}
static float snapshot[4*12];
EMSCRIPTEN_KEEPALIVE float* direct_snapshot(void){
 memset(snapshot,0,sizeof(snapshot));if(direct_scene_kind_value!=2)return snapshot;for(int i=0;i<4;i++){HSD_GObj* obj=Player_GetEntity(i);if(!obj||!obj->user_data)continue;Fighter* fp=obj->user_data;float* p=snapshot+i*12;p[0]=1;p[1]=fp->kind;p[2]=fp->motion_id;p[3]=fp->cur_pos.x;p[4]=fp->cur_pos.y;p[5]=fp->self_vel.x;p[6]=fp->self_vel.y;p[7]=fp->facing_dir;p[8]=fp->dmg.x1830_percent;p[9]=Player_GetStocks(i);p[10]=fp->cur_anim_frame;}
 return snapshot;
}

int direct_skip_css(void){return requested&&mode==0&&configured&&!launched;}
int direct_forced_stage(void){if(direct_skip_css()&&!launched){launched=1;return stage;}return -1;}

void direct_player_init(int port,PlayerInitData* p){if(port>=0&&port<4&&(sheik_pending&(1u<<port))&&p->ckind==18){p->ckind=19;sheik_pending&=~(1u<<port);}}

void direct_menu_enter(void* data){if(requested&&mode==1){direct_mode_loaded(GM_VS);unsigned char* p=data;p[0]=2;p[1]=0;p[2]=1;}}

#include <dolphin/pad.h>
static PADStatus browser_pads[4];
static unsigned browser_pad_mask, browser_knockouts;
EMSCRIPTEN_KEEPALIVE void direct_set_pad(int port,unsigned buttons,int sx,int sy,int cx,int cy,unsigned left,unsigned right,int connected) {
 if(port<0||port>3)return;
 browser_pad_mask|=1u<<port;
 browser_pads[port]=(PADStatus){.button=buttons,.stickX=sx,.stickY=sy,.substickX=cx,.substickY=cy,.triggerLeft=left,.triggerRight=right,.err=connected?PAD_ERR_NONE:PAD_ERR_NO_CONTROLLER};
}
void browser_apply_input(void) {
 for(unsigned i=0;i<4;i++)if(browser_pad_mask&(1u<<i))PADSetVirtualStatus(i,&browser_pads[i]);
 unsigned knockouts = browser_knockouts;browser_knockouts=0;
 for (unsigned i=0;i<4;i++) if (knockouts & (1u<<i)) {
   HSD_GObj* object=Player_GetEntity(i);
   if(object && object->user_data && Player_GetStocks(i)>0){
     Player_SetStocks(i,1);ftCo_800D3BC8(object);
   }
 }
}

/* Real engine transitions for deterministic end-to-end tests. Disabled unless
 * the diagnostic page explicitly opts in before starting the game. */
#include <stdlib.h>
EMSCRIPTEN_KEEPALIVE int direct_debug_knockout(int port) {
    if (!getenv("OPENSMASH_TESTING") || direct_scene_kind_value != 2 ||
        port < 0 || port > 3)
        return 0;
    HSD_GObj* object = Player_GetEntity(port);
    if (!object || !object->user_data)
        return 0;
    browser_knockouts |= 1u << port;
    return 1;
}

#include <melee/gr/ground.h>
#include <melee/gr/types.h>
EMSCRIPTEN_KEEPALIVE int direct_stage(void) { return stage_info.grkind; }

#include <sysdolphin/baselib/controller.h>
EMSCRIPTEN_KEEPALIVE float* direct_input_snapshot(void) {
    static float values[12];
    HSD_PadStatus* master=&HSD_PadMasterStatus[0];
    HSD_PadStatus* copy=&HSD_PadCopyStatus[0];
    float current[]={browser_pads[0].button,browser_pads[0].stickX,browser_pads[0].stickY,
        master->button,master->trigger,master->stickX,master->stickY,
        copy->button,copy->trigger,copy->stickX,copy->stickY,master->err};
    memcpy(values,current,sizeof(values));return values;
}
