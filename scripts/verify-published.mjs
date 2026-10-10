import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';

const origin='https://agent-mbti-cards.dnplus.chatgpt.site';
const evidence=new URL('../evidence/published/',import.meta.url);
const checks=[];
const request=(path,init={})=>fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(30000),...init});
const check=(step,actual,expected)=>{checks.push({step,actual,expected,passed:actual===expected});assert.equal(actual,expected,step);};
const headers={'Content-Type':'application/json',Origin:origin};
const spoof={'oai-authenticated-user-id':'remote-boundary-fixture','oai-authenticated-user-email':'remote-boundary@example.test'};
await mkdir(evidence,{recursive:true});
let failure=null;
try{
 const home=await request('/');check('anonymous homepage',home.status,200);const html=await home.text();check('native sign-in anchor',html.includes('/signin-with-chatgpt?return_to='),true);
 for(const [label,h] of [['anonymous',{}],['untrusted identity headers',spoof]]){
  const account=await request('/api/account',{headers:h});check(label+' account status',account.status,200);check(label+' account remains anonymous',(await account.json()).authenticated,false);
 }
 const absent=randomUUID();
 for(const [step,path,method,body] of [
  ['anonymous creation','/api/sessions','POST',{protocolVersion:'2.0',nickname:'Rejected remote fixture',marketingOptIn:false}],
  ['anonymous result read','/api/sessions/'+absent,'GET',null],
  ['anonymous result delete','/api/sessions/'+absent,'DELETE',null],
  ['anonymous recall','/api/remembered','GET',null],
  ['anonymous remember','/api/remembered','POST',{}],
  ['anonymous clear','/api/remembered','DELETE',null],
  ['anonymous account mutation','/api/account','PUT',{marketingOptIn:false}],
 ])check(step,(await request(path,{method,headers,...(body?{body:JSON.stringify(body)}:{})})).status,401);
 check('spoofed identity cannot create',(await request('/api/sessions',{method:'POST',headers:{...headers,...spoof},body:JSON.stringify({protocolVersion:'2.0',nickname:'Rejected spoof fixture',marketingOptIn:false})})).status,401);
 for(const [step,path,h] of [
  ['callback without capability','/api/collect/'+absent,{}],
  ['callback with invalid capability','/api/collect/'+absent,{Authorization:'Bearer '+'0'.repeat(64)}],
  ['progress with invalid capability','/api/collect/'+absent+'/status',{Authorization:'Bearer '+'0'.repeat(64)}],
 ])check(step,(await request(path,{method:'POST',headers:{'Content-Type':'application/json',...h},body:'{}'})).status,404);
 for(const path of ['/collector/SKILL.md','/collector/collect.py','/collector-schema.json','/art/mbti/codex/istj-chibi.webp']){
  const asset=await request(path);check('public asset '+path,asset.status,200);
  if(path.endsWith('.webp')){
   const actual=createHash('sha256').update(Buffer.from(await asset.arrayBuffer())).digest('hex');
   const expected=createHash('sha256').update(await readFile(new URL('../public'+path,import.meta.url))).digest('hex');
   check('published artwork SHA256 matches verified source',actual,expected);
  }
 }
}catch(error){failure={name:error.name,message:error.message};process.exitCode=1;}
await writeFile(new URL('anonymous-boundary.json',evidence),JSON.stringify({origin,checkedAt:new Date().toISOString(),scope:'Actual public Sites dispatch; no browser cookies, bypass key or native identity',checks,failure},null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,passed:checks.filter(c=>c.passed).length,failure}));
