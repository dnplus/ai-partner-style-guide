import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {validateArtManifest} from "../lib/art-catalog.ts";

const allowPending=process.argv.includes("--allow-pending");
const data=validateArtManifest(JSON.parse(await readFile(new URL("../lib/art-manifest.json",import.meta.url),"utf8")));
const hashes=new Set(),pixels=new Set(),verified=[],errors=[];
for(const s of data.slots){
  if(s.status!=="ready")continue;
  try{
    const path=new URL("../public"+s.src,import.meta.url);
    const bytes=await readFile(path),sha=createHash("sha256").update(bytes).digest("hex");
    const {data:raw,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const pixelHash=createHash("sha256").update(String(info.width)+"x"+info.height+":").update(raw).digest("hex");
    if(sha!==s.sha256)throw new Error("File differs from confirmed hash");
    if(hashes.has(sha)||pixels.has(pixelHash))throw new Error("Repeated image or decoded pixels");
    if(info.width<512||info.height<512)throw new Error("Artwork is below minimum resolution");
    hashes.add(sha);pixels.add(pixelHash);
    verified.push({slot:s.family+":"+s.type+":"+s.style,src:s.src,sha256:sha,pixelHash,width:info.width,height:info.height});
  }catch(e){errors.push({slot:s.family+":"+s.type+":"+s.style,error:e.message});}
}
const pending=data.slots.filter(s=>s.status==="pending").map(s=>s.family+":"+s.type+":"+s.style);
if(!allowPending&&pending.length)errors.push({error:"Incomplete artwork matrix",pending:pending.length});
const report={expected:192,verified:verified.length,uniqueHashes:hashes.size,uniquePixels:pixels.size,complete:verified.length===192&&errors.length===0,pending,errors,files:verified};
const output=new URL("../"+(process.env.ART_VERIFY_OUTPUT??"evidence/art-192/verification.json"),import.meta.url);
await mkdir(new URL(".",output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({expected:192,verified:verified.length,uniqueHashes:hashes.size,uniquePixels:pixels.size,complete:report.complete,pending:pending.length,errors}));
if(errors.length)process.exitCode=1;
