#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
extern void browser_memory_disc(void*,size_t);
extern void browser_memory_native(void*,size_t);
extern unsigned browser_presentation_read(uintptr_t,unsigned);
extern void browser_presentation_write(uintptr_t,unsigned,unsigned);
int main(void){
 unsigned char a[32]={0};uintptr_t p=(uintptr_t)a;
 browser_memory_disc(a,sizeof(a));browser_presentation_write(p,0x12345678,4);
 assert(a[0]==0x12&&a[3]==0x78);assert(browser_presentation_read(p,4)==0x12345678);
 browser_memory_native(a+8,8);browser_presentation_write(p+8,0x12345678,4);
 assert(a[8]==0x78&&a[11]==0x12);
 browser_presentation_write(p+4,0xaabb,2);assert(a[4]==0xaa&&a[5]==0xbb);
 browser_presentation_write(p+16,0xaabb,2);assert(a[16]==0xaa&&a[17]==0xbb);
 browser_memory_disc(a+8,8);assert(browser_presentation_read(p+8,4)==0x78563412);
 browser_memory_native(a,sizeof(a));assert(browser_presentation_read(p,4)==0x78563412);
 for(unsigned i=0;i<1000;i++){browser_memory_disc(a,32);browser_memory_native(a+4,24);browser_memory_disc(a+8,8);browser_memory_native(a,32);}
 puts("Archive byte-order tracking survives allocation reuse and split ranges");
}
