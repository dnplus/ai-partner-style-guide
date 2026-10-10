import {PersonaApp} from '../components/persona-app.tsx';
import {getChatGPTUser,chatGPTSignInPath,chatGPTSignOutPath} from './chatgpt-auth.ts';
export const dynamic='force-dynamic';
export default async function Home(){const user=await getChatGPTUser();return <PersonaApp authenticated={!!user} signInHref={chatGPTSignInPath('/?start=1')} signOutHref={chatGPTSignOutPath('/')}/>;}
