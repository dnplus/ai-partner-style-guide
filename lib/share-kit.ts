import {translator,type Locale} from './i18n.ts';
import {personaFor} from './catalog.ts';
import {measuredCode} from './card-composition.ts';
import {rarityLabel} from './rarity.ts';
import type {CardObservation} from './assessment.ts';

// A short post for any network; the link itself unfolds into the server-drawn card.
// The type describes how the person leads the agent, so the post says what the agent saw in them.
export function postText(card:CardObservation,url:string,locale:Locale,nicknameOnly:boolean){
 const t=translator(locale);
 return nicknameOnly
  ?t('我的 Agent「{nickname}」幫我畫了一張角色卡。你和 Agent 是哪一種夥伴風格？ {url} #AIPartnerStyle',{nickname:card.nickname,url})
  :t('我的 Agent「{nickname}」說我是 {code} {persona}（{rarity}）。你和 Agent 是哪一種夥伴風格？ {url} #AIPartnerStyle',{nickname:card.nickname,code:measuredCode(card,t),persona:t(personaFor(card.assessment.type).name),rarity:t(rarityLabel(card.usageLevel.value)),url});
}

// What the visitor hands to their own agent: the agent posts with its own tools, and only after the visitor approves the final text.
export function agentSharePrompt(card:CardObservation,url:string,locale:Locale,nicknameOnly:boolean){
 const t=translator(locale);
 return [t('請幫我把這張 AI 夥伴風格角色卡分享到社群，先問我要發到哪個平台。'),t('卡片連結：{url}（貼上後會顯示卡片圖，收到的人也能點開驗證）',{url}),t('建議文案：{post}',{post:postText(card,url,locale,nicknameOnly)}),t('可以依平台調整語氣和長度（X 不超過 280 字元），但不要改動類型、稀有度和連結。發文前先把最終內容給我確認，得到同意才送出。不要讀取或上傳我電腦裡的其他檔案。')].join('\n');
}

// A README badge that links back to the card; the via tag tells a badge click apart from a pasted link.
export const badgeMarkdown=(url:string)=>`[![AI Partner Style](${url}/badge.svg)](${url}?via=badge)`;

// The post for a two-person comparison; the link unfolds into both cards.
export function comparePost(theirs:string,kind:string,same:number,known:number,url:string,locale:Locale){
 const t=translator(locale);
 return t('我和「{nickname}」帶 Agent 是{kind}，{same} / {known} 軸相同。你們呢？ {url} #AIPartnerStyle',{nickname:theirs,kind:t(kind),same,known,url});
}
