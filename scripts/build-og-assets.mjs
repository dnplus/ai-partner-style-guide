// Built from public/art at build time, never committed:
// - social preview art: satori cannot decode WebP, so each ready artwork gets a small JPEG on the card's own background;
// - display art: pages show cards a few hundred pixels wide, so they load a 640px WebP (and lists a 240px one)
//   instead of the 1024×1536 originals, which stay for the downloadable PNG.
import sharp from 'sharp';
import {readFile,mkdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('lib/art-manifest.json',root),'utf8'));
const fresh=async(source,target)=>{try{return (await stat(target)).mtimeMs>=(await stat(source)).mtimeMs;}catch{return false;}};
let made=0,display=0;
const sizes=[['view',640,82],['thumb',240,80]];
for(const slot of manifest.slots.filter(s=>s.status==='ready')){
 const source=new URL('public'+slot.src,root),target=new URL('public/og/art/'+slot.family+'/'+slot.type.toLowerCase()+'-'+slot.style+'.jpg',root);
 if(await fresh(source,target))continue;
 await mkdir(new URL('.',target),{recursive:true});
 await sharp(fileURLToPath(source)).resize({height:600}).flatten({background:'#1a1422'}).jpeg({quality:80,mozjpeg:true}).toFile(fileURLToPath(target));
 made++;
}
for(const slot of manifest.slots.filter(s=>s.status==='ready'))for(const [size,width,quality] of sizes){
 const source=new URL('public'+slot.src,root),target=new URL('public'+slot.src.replace('/art/mbti/','/art/'+size+'/'),root);
 if(await fresh(source,target))continue;
 await mkdir(new URL('.',target),{recursive:true});
 await sharp(fileURLToPath(source)).resize({width}).webp({quality,alphaQuality:90}).toFile(fileURLToPath(target));
 display++;
}
console.log(JSON.stringify({ogArt:made,displayArt:display}));
