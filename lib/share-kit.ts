import {translator,type Locale} from './i18n.ts';
import {personaFor} from './catalog.ts';
import {measuredCode} from './card-composition.ts';
import type {CardObservation} from './assessment.ts';

// A short post for any network; the link itself unfolds into the server-drawn card.
export function postText(card:CardObservation,url:string,locale:Locale,nicknameOnly:boolean){
 const t=translator(locale);
 return nicknameOnly
  ?t('我的 Agent「{nickname}」拿到一張角色卡。你的 Agent 會是哪一型？ {url} #AgentMBTI',{nickname:card.nickname,url})
  :t('我的 Agent「{nickname}」是 {code} {persona}，LV {level}。你的 Agent 會是哪一型？ {url} #AgentMBTI',{nickname:card.nickname,code:measuredCode(card,t),persona:t(personaFor(card.assessment.type).name),level:card.usageLevel.value??'?',url});
}

// What the visitor hands to their own agent: the agent posts with its own tools, and only after the visitor approves the final text.
export function agentSharePrompt(card:CardObservation,url:string,locale:Locale,nicknameOnly:boolean){
 const t=translator(locale);
 return [t('請幫我把這張 Agent MBTI 角色卡分享到社群，先問我要發到哪個平台。'),t('卡片連結：{url}（貼上後會顯示卡片圖，收到的人也能點開驗證）',{url}),t('建議文案：{post}',{post:postText(card,url,locale,nicknameOnly)}),t('可以依平台調整語氣和長度（X 不超過 280 字元），但不要改動類型、等級和連結。發文前先把最終內容給我確認，得到同意才送出。不要讀取或上傳我電腦裡的其他檔案。')].join('\n');
}
