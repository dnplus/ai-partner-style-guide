import { artFor, artTitle, artCredit, families, personaFor, type ArtStyle, type Family } from "./catalog.ts";
import type { CardObservation } from "./assessment.ts";

export async function downloadCard(report: CardObservation, style: ArtStyle, family: Family, nicknameOnly: boolean) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1620;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("無法建立圖片，請換一個瀏覽器再試。");
  const theme = families.find((f) => f.id === family)!;
  c.fillStyle = "#f5f3fa"; c.fillRect(0, 0, 1080, 1620);
  c.shadowColor = "#2d17504d"; c.shadowBlur = 45; c.shadowOffsetY = 20;
  c.fillStyle = "#131019"; c.beginPath(); c.roundRect(60, 48, 960, 1440, 52); c.fill();
  c.shadowBlur = 0; c.shadowOffsetY = 0;
  const foil = c.createLinearGradient(80, 100, 1000, 1420);
  [[0,"#cfadef"],[0.2,"#7af2e5"],[0.4,"#ffd492"],[0.6,"#be91fc"],[0.8,"#f6b0d4"],[1,"#aff9dd"]].forEach(([p, color]) => foil.addColorStop(Number(p), String(color)));
  c.strokeStyle = foil; c.lineWidth = 8; c.beginPath(); c.roundRect(72, 60, 936, 1416, 43); c.stroke();
  c.lineWidth = 1.5; c.beginPath(); c.roundRect(94, 83, 892, 1371, 26); c.stroke();
  c.save(); c.beginPath(); c.roundRect(96, 86, 888, 1366, 24); c.clip();
  const glow = c.createRadialGradient(540, 660, 50, 540, 660, 670); glow.addColorStop(0,"#573a73");glow.addColorStop(1,"#17121e");c.fillStyle=glow;c.fillRect(96,86,888,1366);
  c.strokeStyle="#c1a5ef35";c.lineWidth=2;c.beginPath();c.ellipse(540,650,330,470,-.3,0,Math.PI*2);c.stroke();
  const art = artFor(family, report.assessment.type, style);
  if(report.assessment.type && !art)throw new Error("這張專屬插畫仍在製作，完成後才能下載。");
  if (art) {
    const img = new Image(); img.src = art;
    await img.decode();
    const scale=Math.min(820/img.naturalWidth,950/img.naturalHeight);
    const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    c.drawImage(img,540-w/2,185+(950-h)/2,w,h);
  } else { c.fillStyle="#d5c1f4";c.font='68px sans-serif';c.textAlign="center";c.fillText("✧",540,610);c.font='48px sans-serif';c.fillText("輪廓還在形成",540,730);c.font='28px sans-serif';c.fillText("保留未知，等待更多線索",540,790);c.textAlign="left"; }
  const shade = c.createLinearGradient(0, 1050, 0, 1450);shade.addColorStop(0,"#15111c00");shade.addColorStop(.55,"#15111ce8");shade.addColorStop(1,"#15111c");c.fillStyle=shade;c.fillRect(96,1000,888,452);
  c.restore();
  c.fillStyle="#ece0ff";c.font='34px Georgia, serif';c.fillText(`✧  ${theme.label.toUpperCase()}`,125,153);
  c.textAlign="right";c.font='25px sans-serif';c.fillText(report.kind === "fixture" ? "示範資料 · 非個人評估" : "你的 Agent MBTI",948,153);c.textAlign="left";
  if (!nicknameOnly) {
    c.fillStyle=foil;c.font=report.assessment.type ? '116px Georgia, serif' : 'bold 76px sans-serif';c.fillText(report.assessment.type ?? "未定型",126,1240);
    c.fillStyle="#f9f3ff";c.font='bold 44px sans-serif';c.fillText(personaFor(report.assessment.type).name,126,1309,690);
  }
  c.fillStyle="#f5ecff";c.font=`${nicknameOnly ? "bold 62px" : "32px"} sans-serif`;c.fillText(report.nickname,126,1380,640);
  c.fillStyle="#c0b6ce";c.font='20px sans-serif';c.fillText("合作風格觀察 · 非官方 MBTI 評量 · 造型與分型無關",126,1425);
  c.fillStyle="#50455f";c.textAlign="center";c.font='20px sans-serif';
  c.fillText(art ? artTitle(family) : "你的 Agent MBTI · 中性觀察卡",540,1532);
  c.font='18px sans-serif';c.fillText(art ? artCredit(family) : "證據不足的方向不補猜，不使用其他分型的插畫",540,1562,960);
  c.fillText(art ? "CC BY-NC-SA 4.0 · 非官方／非商業 · 來源：Apprentice-Geo/AI-Fanworks" : "使用風格觀察 · 非官方／非商業 · 非心理測驗",540,1590);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("圖片匯出失敗")), "image/png"));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");a.href=url;a.download=`agent-mbti-${family}-${style}${nicknameOnly ? "-nickname" : ""}.png`;a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { width: canvas.width, height: canvas.height, bytes: blob.size };
}
