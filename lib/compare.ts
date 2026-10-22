import {axisDefinitions} from './workstyle.ts';
import type {Assessment} from './contract.ts';

// Two people's cards side by side: which axes they share and what that means when they lead agents together.
export type AxisMatch={axis:string;name:string;mine:string;theirs:string;status:'same'|'diff'|'unknown';line:string};
export type Comparison={axes:AxisMatch[];same:number;known:number;kind:string};

const sameLines:Record<string,string>={
 E:'你們都邊聊邊想，一起帶 Agent 很熱鬧，記得留一個人看全局。',
 I:'你們都想好再說，開場就交代完整，先對齊目標就很順。',
 S:'你們都給具體做法，交接時連檔案和指令都講得清清楚楚。',
 N:'你們都給方向不給路線，Agent 發揮空間大，記得一起定好驗收。',
 T:'你們都看證據驗收，測試和數字就是共同語言。',
 F:'你們都看感受驗收，對品味和使用者體驗很有共識。',
 J:'你們都會把做法留下來，很快就能累積一套共用的技能和腳本。',
 P:'你們都愛邊試邊調，點子很多，記得挑一個留下來。',
};
const diffLines:Record<string,string>={
 EI:'一個想好再說、一個邊聊邊想：讓想好的人寫需求，邊聊的人盯中間結果。',
 SN:'一個給做法、一個給方向：給方向的人說要去哪，給做法的人補上怎麼走。',
 TF:'一個看證據、一個看感受：合起來剛好是「能用」加上「好用」。',
 JP:'一個留下流程、一個邊試邊調：試出來的做法，交給另一位整理成資產。',
};
export const UNKNOWN_LINE='這一軸還看不出來，多帶幾次 Agent 就會清楚。';
export const compareKinds=['分身搭檔','默契搭檔','互補搭檔','反差搭檔','還在認識的搭檔'] as const;

export function compareAssessments(mine:Assessment,theirs:Assessment):Comparison{
 const axes=axisDefinitions.map((def,i):AxisMatch=>{
  const a=mine.axes[i].value,b=theirs.axes[i].value;
  const status=a==='?'||b==='?'?'unknown':a===b?'same':'diff';
  return {axis:def.id,name:def.name,mine:a,theirs:b,status,line:status==='same'?sameLines[a]:status==='diff'?diffLines[def.id]:UNKNOWN_LINE};
 });
 const known=axes.filter(a=>a.status!=='unknown').length,same=axes.filter(a=>a.status==='same').length;
 const kind=known<2?compareKinds[4]:same===known?compareKinds[0]:same===0?compareKinds[3]:same===known-1?compareKinds[1]:compareKinds[2];
 return {axes,same,known,kind};
}
export const comparable=(a:Assessment)=>a.axes.some(axis=>axis.value!=='?');
