// Social preview art: satori cannot decode WebP, so each ready artwork gets a small JPEG on the card's own background.
import sharp from 'sharp';
import {readFile,mkdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('lib/art-manifest.json',root),'utf8'));
const fresh=async(source,target)=>{try{return (await stat(target)).mtimeMs>=(await stat(source)).mtimeMs;}catch{return false;}};
let made=0;
for(const slot of manifest.slots.filter(s=>s.status==='ready')){
 const source=new URL('public'+slot.src,root),target=new URL('public/og/art/'+slot.family+'/'+slot.type.toLowerCase()+'-'+slot.style+'.jpg',root);
 if(await fresh(source,target))continue;
 await mkdir(new URL('.',target),{recursive:true});
 await sharp(fileURLToPath(source)).resize({height:600}).flatten({background:'#1a1422'}).jpeg({quality:80,mozjpeg:true}).toFile(fileURLToPath(target));
 made++;
}
console.log(JSON.stringify({ogArt:made}));
