"use client";
import {useEffect, useState} from "react";
import {useLocale} from "./locale-provider.tsx";
import {artFor, displayArt, families, personas, type Family} from "../lib/catalog.ts";
import {typeCodes, type TypeCode} from "../lib/contract.ts";

// While the agent works, a card keeps turning over and lands on a different character and type each time.
// The face is swapped while the back is showing, so the change is never seen mid-turn.
type Face = {family: Family; type: TypeCode};
const pick = (previous?: Face): Face => {
  let next: Face;
  do next = {family: families[Math.floor(Math.random() * families.length)].id, type: typeCodes[Math.floor(Math.random() * typeCodes.length)]};
  while (previous && next.family === previous.family && next.type === previous.type);
  return next;
};
const preload = (face: Face) => { const src = displayArt(artFor(face.family, face.type, "chibi")); if (src) new Image().src = src; };

export function CardShuffle() {
  const {t} = useLocale();
  // The first face is fixed so the server and the first client render agree; shuffling starts after mount.
  const [face, setFace] = useState<Face>({family: "codex", type: "INTJ"});
  const [next, setNext] = useState<Face | null>(null);
  // Random faces only exist on the client, so the first one is chosen after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const first = pick(); preload(first); setNext(first); }, []);
  function turned() {
    if (!next) return;
    setFace(next);
    const after = pick(next); preload(after); setNext(after);
  }
  const art = displayArt(artFor(face.family, face.type, "chibi"));
  return <div className="card-shuffle" aria-hidden="true">
    <div className="card-shuffle-inner" onAnimationIteration={turned}>
      <div className="card-shuffle-face">{art && <img src={art} alt="" draggable={false}/>}<span className="card-shuffle-code">{face.type}</span><span className="card-shuffle-name">{t(personas[face.type].name)}</span></div>
      <div className="card-shuffle-back"><span>✧</span></div>
    </div>
  </div>;
}
