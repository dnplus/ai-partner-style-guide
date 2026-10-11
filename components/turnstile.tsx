'use client';
import {useEffect,useRef} from 'react';

type TurnstileApi={
 render(container:HTMLElement,options:{sitekey:string;action:string;language:string;callback:(token:string)=>void;'expired-callback':()=>void;'error-callback':()=>void}):string;
 remove(widgetId:string):void;
};
declare global{interface Window{turnstile?:TurnstileApi}}

const SCRIPT='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading:Promise<TurnstileApi>|null=null;
function loadTurnstile(){
 if(window.turnstile)return Promise.resolve(window.turnstile);
 loading??=new Promise<TurnstileApi>((resolve,reject)=>{
  const script=document.createElement('script');script.src=SCRIPT;script.async=true;
  script.onload=()=>window.turnstile?resolve(window.turnstile):reject(new Error('Turnstile unavailable'));
  script.onerror=()=>{loading=null;script.remove();reject(new Error('Turnstile unavailable'));};
  document.head.appendChild(script);
 });
 return loading;
}

// Tokens are single-use: remount (change the React key) after every create attempt to get a fresh one.
export function Turnstile({siteKey,action,language,onToken,onError}:{siteKey:string;action:string;language:string;onToken:(token:string)=>void;onError:()=>void}){
 const box=useRef<HTMLDivElement>(null),handlers=useRef({onToken,onError});
 useEffect(()=>{handlers.current={onToken,onError};});
 useEffect(()=>{
  let active=true,widgetId:string|null=null;
  loadTurnstile().then(api=>{
   if(!active||!box.current)return;
   widgetId=api.render(box.current,{sitekey:siteKey,action,language,callback:token=>handlers.current.onToken(token),'expired-callback':()=>handlers.current.onToken(''),'error-callback':()=>{handlers.current.onToken('');handlers.current.onError();}});
  }).catch(()=>{if(active)handlers.current.onError();});
  return ()=>{active=false;if(widgetId)window.turnstile?.remove(widgetId);};
 },[siteKey,action,language]);
 return <div ref={box} className="turnstile-box"/>;
}
