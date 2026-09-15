/** Preserve legacy direct-C saves while importing their unchanged data into Aurora GCI files. */
export function legacySaveToGci(bytes,firstBlock=5){
 if(!(bytes instanceof Uint8Array)||bytes.length<100)throw Error('Truncated legacy save.');
 const read=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=new TextDecoder();
 if(text.decode(bytes.subarray(0,4))!=='MPCS'||read.getUint32(4,true)!==1)throw Error('Unknown legacy save format.');
 const length=read.getUint32(40,true);
 if(!length||length%8192||length>1019*8192||bytes.length!==100+length)throw Error('Invalid legacy save length.');
 const name=text.decode(bytes.subarray(8,40)).replace(/\0.*$/s,'');
 const game=text.decode(bytes.subarray(48,52)),maker=text.decode(bytes.subarray(52,54));
 if(game!=='GALE'||maker!=='01'||!name||name.includes('/')||name.includes('\\')||name==='.'||name==='..')throw Error('Invalid legacy Melee save identity.');
 const result=new Uint8Array(64+length),write=new DataView(result.buffer);
 result.set(bytes.subarray(48,54),0);result[6]=0xff;result[7]=bytes[54];result.set(bytes.subarray(8,40),8);
 write.setUint32(40,read.getUint32(44,true));write.setUint32(44,read.getUint32(56,true));
 write.setUint16(48,read.getUint16(60,true));write.setUint16(50,read.getUint16(62,true));
 result[52]=4;write.setUint16(54,firstBlock);write.setUint16(56,length/8192);write.setUint16(58,0xffff);write.setUint32(60,read.getUint32(64,true));
 result.set(bytes.subarray(100),64);return {filename:`${maker}-${game}-${name}.gci`,bytes:result,blocks:length/8192};
}
export function migrateLegacySaves(fs){
 const folder='/saves/USA/Card A',migrated=[];let firstBlock=5;
 for(const name of fs.readdir('/saves')){
  if(!name.endsWith('.sav'))continue;
  const save=legacySaveToGci(fs.readFile('/saves/'+name),firstBlock);firstBlock+=save.blocks;
  fs.mkdirTree(folder);const path=folder+'/'+save.filename;
  if(fs.analyzePath(path).exists)continue;
  fs.writeFile(path,save.bytes);migrated.push(save.filename);
 }
 return migrated;
}
