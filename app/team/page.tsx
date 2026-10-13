import {env} from 'cloudflare:workers';
import {TeamApp} from '../../components/team-app.tsx';
export const dynamic='force-dynamic';
export const metadata={title:'團隊看板｜你的 AI 夥伴風格指南',robots:{index:false,follow:false}};
export default function TeamPage(){return <TeamApp turnstileSiteKey={env.TURNSTILE_SITE_KEY}/>;}
