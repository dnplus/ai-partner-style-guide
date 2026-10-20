import {z} from "zod";
import manifest from "./art-manifest.json" with {type:"json"};
import {typeCodes,type TypeCode} from "./contract.ts";
import type {Family,ArtStyle} from "./catalog.ts";

export const artFamilies=["codex","claude","gemini","grok","deepseek","glm"] as const;
export const artStyles=["regular","chibi"] as const;
const slotSchema=z.object({
  family:z.enum(artFamilies),type:z.enum(typeCodes),style:z.enum(artStyles),status:z.enum(["ready","pending"]),
  src:z.string().nullable(),sha256:z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  theme:z.string().min(1),motif:z.string().min(1),description:z.string().min(1),
}).strict();
export type ArtSlot=z.infer<typeof slotSchema>;
export function validateArtManifest(input:unknown,requireComplete=false) {
  const parsed=z.object({version:z.literal(1),target:z.literal(192),slots:z.array(slotSchema).length(192)}).strict().parse(input);
  const keys=new Set<string>(),sources=new Set<string>(),hashes=new Set<string>();
  for(const s of parsed.slots){
    const key=s.family+":"+s.type+":"+s.style;
    if(keys.has(key))throw new Error("Duplicate art slot: "+key);keys.add(key);
    if(s.status==="ready"){
      if(s.src!=="/art/mbti/"+s.family+"/"+s.type.toLowerCase()+"-"+s.style+".webp"||!s.sha256)throw new Error("Invalid ready art: "+key);
      if(sources.has(s.src)||hashes.has(s.sha256))throw new Error("Repeated fallback artwork: "+key);
      sources.add(s.src);hashes.add(s.sha256);
    }else if(s.src!==null||s.sha256!==null)throw new Error("Pending slot must not contain fallback art: "+key);
  }
  if(requireComplete&&sources.size!==192)throw new Error("Art incomplete: "+sources.size+"/192 unique illustrations");
  return parsed;
}
export const artSlots=validateArtManifest(manifest).slots;
export const artCounts={ready:artSlots.filter(s=>s.status==="ready").length,total:192,complete:artSlots.every(s=>s.status==="ready")};
export function artSlot(family:Family,type:TypeCode|null,style:ArtStyle){
  return type ? artSlots.find(s=>s.family===family&&s.type===type&&s.style===style)??null : null;
}
// Pages show art at card size, so they load a build-time copy: "view" is 640px wide, "thumb" 240px.
// The downloadable PNG keeps using the original.
export const displayArt=(src:string|null,size:"view"|"thumb"="view")=>src?.replace("/art/mbti/","/art/"+size+"/")??null;
export function artFor(family:Family,type:TypeCode|null,style:ArtStyle){
  const slot=artSlot(family,type,style);return slot?.status==="ready" ? slot.src : null;
}
