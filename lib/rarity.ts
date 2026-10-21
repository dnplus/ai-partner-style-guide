// Visitors see a card rarity, never a level number. The usage-level evidence still decides it,
// but the card speaks about how deep the partnership with the agent runs, not about a skill grade.
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const rarityOrder: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const rarityFor = (level: number | null): Rarity => level === null || level < 2 ? 'common' : level < 4 ? 'rare' : level < 5 ? 'epic' : 'legendary';
export const rarityNames: Record<Rarity, string> = {common: '普通', rare: '稀有', epic: '史詩', legendary: '傳說'};
export const UNRATED = '待鑑定';
export const rarityLabel = (level: number | null) => level === null ? UNRATED : rarityNames[rarityFor(level)];
// Badges render through GitHub's image proxy, so they use Latin names.
export const rarityLatin = (level: number | null) => level === null ? 'Unrated' : {common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary'}[rarityFor(level)];
export const rarityDescriptions: Record<Rarity | 'unrated', string> = {
  common: '你們剛開始搭檔：結果常直接拿來用，出錯了就換個說法再試。',
  rare: '你們有默契了：結果先確認再用，出錯時能指出哪裡不對，讓它改對。',
  epic: '你們有共用的工具箱：你寫下的技能、規則或腳本，會在別的工作裡被再次拿出來用。',
  legendary: '你們的搭檔會自己運轉：排程、CI 或 hook 讓它在你不在時也持續工作，工具箱也一直在更新。',
  unrated: '紀錄裡還看不出你們怎麼確認與重用，多搭檔幾次就能鑑定。',
};
export const RARITY_LEAD = '稀有度看的是你和 Agent 搭檔得多深：會不會確認結果、有沒有留下能重用的東西、能不能自己運轉。和類型、用量、模型都無關。';
