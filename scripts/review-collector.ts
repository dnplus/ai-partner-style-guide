import { lstat,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { prepareCollectorReview } from '../lib/collector-review.ts';

async function main(){
  const args=process.argv.slice(2);
  if(args.length!==3 || args[0]!=='--approved-input')throw new Error('用法：node scripts/review-collector.ts --approved-input 已授權的最小摘要.json 預覽輸出.json。此工具不讀原始會話、不使用網路。');
  const source=resolve(args[1]);const destination=resolve(args[2]);
  if(source===destination)throw new Error('預覽輸出不得覆寫來源。');
  if(/(?:^|\/)(?:sessions|auth|secrets|\.ssh|\.aws|\.config|\.codex|\.claude|\.cursor|\.gemini)(?:\/|$)/i.test(source) || /(?:auth|credentials|secrets)\.json$/i.test(source))throw new Error('只接受本人授權匯出的最小摘要，不讀會話或憑證目錄。');
  const stat=await lstat(source);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>24*1024)throw new Error('輸入必須是 24 KiB 內的一般 JSON 檔。');
  const input=JSON.parse(await readFile(source,'utf8'));
  const preview=prepareCollectorReview(input);
  const bytes=JSON.stringify(preview,null,2)+'\n';
  await writeFile(destination,bytes,{encoding:'utf8',mode:0o600,flag:'wx'});
  console.log(JSON.stringify({prepared:true,kind:preview.kind,assessment:preview.assessment,coverage:preview.coverage.scope,uploadApproved:false,networkUsed:false,sha256:createHash('sha256').update(bytes).digest('hex')}));
}
main().catch(()=>{console.error('摘要未完成：請檢查命令、來源授權、欄位與輸出是否已存在。未使用網路，未提交資料。');process.exitCode=1;});
