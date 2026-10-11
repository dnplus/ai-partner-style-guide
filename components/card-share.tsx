'use client';
import {useEffect,useRef,useState} from 'react';
import {X,Download,Share2,Copy} from 'lucide-react';
import {useLocale} from './locale-provider.tsx';
import {makeCardFile,saveCardFile,shareText,exportFormats,type ExportFormat} from '../lib/export-card.ts';
import type {CardObservation} from '../lib/assessment.ts';
import type {ArtStyle,Family} from '../lib/catalog.ts';
export function CardShare({card,style,family,nicknameOnly,home}:{card:CardObservation;style:ArtStyle;family:Family;nicknameOnly:boolean;home:string}){
 const {t,locale}=useLocale(),dialog=useRef<HTMLDialogElement>(null),busy=useRef(false);
 const [open,setOpen]=useState(false),[format,setFormat]=useState<ExportFormat>('feed'),[prepared,setPrepared]=useState<{key:string;file:File}|null>(null),[notice,setNotice]=useState(''),[sharing,setSharing]=useState(false),[brief,setBrief]=useState(true);
 const text=shareText(card,nicknameOnly,home,locale,brief);
 const key=JSON.stringify([card,style,family,nicknameOnly,home,locale,format]),file=prepared?.key===key?prepared.file:null;
 useEffect(()=>{
  if(!open)return;let active=true;void makeCardFile(card,style,family,nicknameOnly,home,locale,format).then(r=>{if(active)setPrepared({key,file:r.file});}).catch(()=>{if(active)setNotice('圖片匯出失敗');});return ()=>{active=false;};
 },[open,format,card,style,family,nicknameOnly,home,locale,key]);
 function close(){dialog.current?.close();setOpen(false);}
 async function copy(){try{await navigator.clipboard.writeText(text);setNotice('分享文字與首頁連結已複製。');}catch{setNotice('無法自動複製，請選取下方文字。');}}
 async function share(){
  if(!file||busy.current)return;busy.current=true;setSharing(true);setNotice('');
  try{
   if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:t('你的 Agent MBTI'),text});setNotice('已交給系統分享選單。');}
   else{saveCardFile(file);try{await navigator.clipboard.writeText(text);setNotice('圖片已下載，分享文字與首頁連結已複製。');}catch{setNotice('圖片已下載，請複製下方文字與首頁連結。');}}
  }catch(error){if(error instanceof DOMException&&error.name==='AbortError')setNotice('已取消分享。');else{saveCardFile(file);setNotice('系統分享未完成，已改為下載圖片。');}}
  finally{busy.current=false;setSharing(false);}
 }
 return <><button className="secondary-action" onClick={()=>{setNotice('');setOpen(true);dialog.current?.showModal();}}><Share2 size={18}/>{t('分享卡片')}</button><dialog ref={dialog} className="share-dialog" onClose={()=>setOpen(false)} aria-labelledby="share-title"><button className="icon-button dialog-close" aria-label={t('關閉分享')} onClick={close}><X size={22}/></button><h2 id="share-title">{t('挑個尺寸，分享這一面。')}</h2><div className="format-options" aria-label={t('分享尺寸')}>{Object.entries(exportFormats).filter(([key])=>key!=='card').map(([key,f])=><button key={key} aria-pressed={format===key} onClick={()=>{setNotice('');setFormat(key as ExportFormat);}}><span className={'format-icon '+key}/><b>{t(f.label)}</b><small>{f.width} × {f.height}</small></button>)}</div><label className="check-field"><input type="checkbox" checked={brief} onChange={e=>setBrief(e.target.checked)} disabled={nicknameOnly}/>{t('附上簡短解讀')}</label><textarea className="share-text" aria-label={t('分享文字')} value={text} readOnly onFocus={e=>e.currentTarget.select()}/><div className="share-actions"><button className="primary" onClick={share} disabled={!file||sharing}>{!file?t('製作圖片中…'):t('分享這個尺寸')}<Share2 size={18}/></button><button className="quiet-button" onClick={()=>{if(file)saveCardFile(file);}} disabled={!file||sharing}><Download size={16}/>{t('下載這個尺寸')}</button><button className="quiet-button" onClick={copy}><Copy size={15}/>{t('複製文字與連結')}</button></div>{notice&&<p role="status">{t(notice)}</p>}</dialog></>;
}
