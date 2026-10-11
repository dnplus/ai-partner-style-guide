import {env} from 'cloudflare:workers';
import {PersonaApp} from '../components/persona-app.tsx';
export const dynamic='force-dynamic';
export default function Home(){return <PersonaApp turnstileSiteKey={env.TURNSTILE_SITE_KEY}/>;}
