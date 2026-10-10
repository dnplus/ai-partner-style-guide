import sharp from 'sharp';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const original=JSON.parse(await readFile(new URL('art-source/manifest.json',root),'utf8'));
const delivery=structuredClone(original),queue=[...delivery.slots],files=[];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function worker(){
 while(queue.length){
  const slot=queue.shift();if(slot.status!=='ready')continue;
  const sourcePath='art-source/'+slot.src.slice('/art/'.length),source=await readFile(new URL(sourcePath,root));
  if(sha(source)!==slot.sha256)throw new Error('Original artwork hash changed: '+sourcePath);
  const output=await sharp(source).webp({quality:98,alphaQuality:100,effort:4,smartSubsample:true}).toBuffer();
  const a=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(a.info.width!==b.info.width||a.info.height!==b.info.height)throw new Error('Artwork dimensions changed');
  let total=0,weight=0;
  for(let i=0;i<a.data.length;i+=4){if(a.data[i+3]!==b.data[i+3])throw new Error('Artwork alpha changed');const alpha=a.data[i+3]/255;for(let j=0;j<3;j++)total+=Math.abs(a.data[i+j]-b.data[i+j])*alpha;weight+=3*alpha;}
  const sourceHash=slot.sha256;slot.src=slot.src.replace(/\.png$/,'.webp');slot.sha256=sha(output);
  const destination=new URL('public'+slot.src,root);await mkdir(new URL('.',destination),{recursive:true});await writeFile(destination,output);
  files.push({slot:slot.family+':'+slot.type+':'+slot.style,sourcePath,sourceSha256:sourceHash,deliveryPath:slot.src,deliverySha256:slot.sha256,width:a.info.width,height:a.info.height,sourceBytes:source.length,deliveryBytes:output.length,alphaIdentical:true,meanAbsoluteVisibleChannelError:Math.round(total/weight*1000)/1000});
  if(files.length%24===0)console.log(JSON.stringify({encoded:files.length,total:192}));
 }
}
await Promise.all([worker(),worker(),worker(),worker()]);
files.sort((a,b)=>a.slot.localeCompare(b.slot));
const report={format:'webp',quality:98,alphaQuality:100,effort:4,smartSubsample:true,losslessColor:false,dimensionsUnchanged:true,alphaIdentical:true,sourceBytes:files.reduce((n,f)=>n+f.sourceBytes,0),deliveryBytes:files.reduce((n,f)=>n+f.deliveryBytes,0),files};
await writeFile(new URL('lib/art-manifest.json',root),JSON.stringify(delivery,null,2)+'\n');
await mkdir(new URL('evidence/published/',root),{recursive:true});await writeFile(new URL('evidence/published/art-encoding.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({files:files.length,sourceBytes:report.sourceBytes,deliveryBytes:report.deliveryBytes,maxMeanChannelError:Math.max(...files.map(f=>f.meanAbsoluteVisibleChannelError))}));
