import {InfoShell,Cta} from '../components/info-shell.tsx';
import {translator} from '../lib/i18n.ts';

// A mistyped or expired link still lands somewhere that invites the visitor to take the test.
export const metadata={title:'找不到這一頁｜你的 AI 夥伴風格指南',robots:{index:false,follow:true}};
export default function NotFound(){
 const t=translator('zh-TW');
 return <InfoShell locale="zh-TW" path="/">
  <h1>{t('找不到這一頁')}</h1>
  <p className="info-lead">{t('連結可能打錯了，或是已經撤回。')}</p>
  <Cta locale="zh-TW"/>
 </InfoShell>;
}
