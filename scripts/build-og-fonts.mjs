// Fetch subset fonts for the social preview's fixed strings from Google Fonts (OFL) and record what each covers.
// Run after changing persona, level or preview copy: node scripts/build-og-fonts.mjs
import {writeFile,mkdir} from 'node:fs/promises';
import {ogFontText,ogFontFile} from '../lib/og-text.ts';

const root=new URL('../',import.meta.url),coverage={};
await mkdir(new URL('public/og/fonts/',root),{recursive:true});
for(const [family,text] of Object.entries(ogFontText())){
 const css=await (await fetch('https://fonts.googleapis.com/css2?family='+encodeURIComponent(family)+':wght@700&text='+encodeURIComponent(text))).text();
 const url=css.match(/src: url\(([^)]+)\) format\('(truetype|opentype)'\)/)?.[1];
 if(!url)throw new Error('No TrueType subset for '+family);
 const bytes=new Uint8Array(await (await fetch(url)).arrayBuffer());
 await writeFile(new URL('public'+ogFontFile(family),root),bytes);
 coverage[family]=text;
 console.log(family,bytes.length);
}
await writeFile(new URL('lib/og-fonts.json',root),JSON.stringify(coverage,null,1)+'\n');
