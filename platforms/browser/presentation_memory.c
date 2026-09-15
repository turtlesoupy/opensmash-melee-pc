/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Endian boundary for the existing OpenSmash presentation adapter. */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef struct { uintptr_t start,end; } Range;
static Range *ranges;
static size_t count,capacity;
static void reserve(size_t n){if(n>capacity){capacity=n*2+32;ranges=realloc(ranges,capacity*sizeof(*ranges));if(!ranges)abort();}}
void browser_memory_native(void *data,size_t size){
 uintptr_t start=(uintptr_t)data,end=start+size;
 if(end<start)abort();
 for(size_t i=0;i<count;){Range r=ranges[i];if(end<=r.start||start>=r.end){i++;continue;}
  if(start<=r.start&&end>=r.end){memmove(ranges+i,ranges+i+1,(count-i-1)*sizeof(*ranges));count--;continue;}
  if(start>r.start&&end<r.end){reserve(count+1);memmove(ranges+i+2,ranges+i+1,(count-i-1)*sizeof(*ranges));ranges[i]=(Range){r.start,start};ranges[i+1]=(Range){end,r.end};count++;i+=2;continue;}
  if(start<=r.start)ranges[i].start=end;else ranges[i].end=start;i++;
 }
}
void browser_memory_disc(void *data,size_t size){
 uintptr_t start=(uintptr_t)data,end=start+size;
 browser_memory_native(data,size);reserve(count+1);
 size_t i=0;while(i<count&&ranges[i].start<start)i++;
 memmove(ranges+i+1,ranges+i,(count-i)*sizeof(*ranges));ranges[i]=(Range){start,end};count++;
}
static int disc(uintptr_t p,unsigned size){size_t a=0,b=count;while(a<b){size_t m=(a+b)/2;if(ranges[m].start<=p)a=m+1;else b=m;}return a&&p>=ranges[a-1].start&&p+size<=ranges[a-1].end;}
unsigned browser_presentation_read(uintptr_t p,unsigned size){unsigned v=0;if(size!=1&&size!=2&&size!=4)abort();memcpy(&v,(void*)p,size);if(disc(p,size)){if(size==4)v=__builtin_bswap32(v);else if(size==2)v=__builtin_bswap16(v);}return v;}
void browser_presentation_write(uintptr_t p,unsigned v,unsigned size){if(size!=1&&size!=2&&size!=4)abort();if(disc(p,size)){if(size==4)v=__builtin_bswap32(v);else if(size==2)v=__builtin_bswap16(v);}memcpy((void*)p,&v,size);}
