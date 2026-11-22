import "./naruvi.css";

import type { ReactNode } from "react";
import { useToolInfo } from "../helpers.js";
import { boldParts, type CvBlock, cvBlocks } from "../summaries.js";
import type { CvResult } from "../types.js";

function Inline({ text }: { text: string }) {
  return <>{boldParts(text).map((part, index) => (part.bold ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>))}</>;
}

/** Groups consecutive bullets into lists and renders the rest as headings and paragraphs. */
function render(blocks: CvBlock[]) {
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) out.push(<ul key={`ul-${out.length}`}>{bullets.map((text, index) => <li key={index}><Inline text={text} /></li>)}</ul>);
    bullets = [];
  };
  for (const block of blocks) {
    if (block.type === "bullet") { bullets.push(block.text); continue; }
    flush();
    const key = `${block.type}-${out.length}`;
    if (block.type === "name") out.push(<h1 key={key}>{block.text}</h1>);
    else if (block.type === "section") out.push(<h2 key={key}>{block.text}</h2>);
    else if (block.type === "item") out.push(<h3 key={key}>{block.text}</h3>);
    else out.push(<p key={key}><Inline text={block.text} /></p>);
  }
  flush();
  return out;
}

export default function Cv() {
  const { isPending, output } = useToolInfo<"naruvi_show_cv">();
  if (isPending) return <div className="frame"><p className="muted">Opening the CV…</p></div>;
  const cv = output as CvResult;
  if (!cv.exists) return <div className="frame"><div className="empty">{cv.note ?? "No CV yet."}</div></div>;
  return (
    <div className="frame" data-llm={`Showing the ${cv.language} CV for ${cv.role}.`}>
      <div className="row spread">
        <p className="title">{cv.role}{cv.company ? ` · ${cv.company}` : ""}</p>
        <span className="row">
          <span className="pill judgement">{cv.language.toUpperCase()}</span>
          {cv.pages ? <span className="pill judgement">{cv.pages} page{cv.pages > 1 ? "s" : ""}</span> : null}
          {cv.quality ? <span className={`pill ${cv.quality.ready ? "met" : "partial"}`}>Quality {cv.quality.score}</span> : null}
        </span>
      </div>
      {cv.strategy?.angle ? <p className="muted">Angle: {cv.strategy.angle}</p> : null}
      <article className="cv">{render(cvBlocks(cv.text ?? ""))}</article>
    </div>
  );
}
