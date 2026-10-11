import {env} from 'cloudflare:workers';
import {TeamApp} from '../../components/team-app.tsx';
export const dynamic='force-dynamic';
export default function TeamPage(){return <TeamApp turnstileSiteKey={env.TURNSTILE_SITE_KEY}/>;}
