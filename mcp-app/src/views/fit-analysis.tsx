import "./naruvi.css";

import { useState } from "react";
import { useSendFollowUpMessage } from "skybridge/web";
import { useToolInfo } from "../helpers.js";
import type { FitAnalysis, RequirementFit } from "../types.js";

const LABEL: Record<RequirementFit["status"], string> = { met: "Proven", partial: "Partial", gap: "Missing", judgement: "Your call" };
const KIND: Record<RequirementFit["kind"], string> = { must: "Must-have", nice: "Nice to have", responsibility: "Responsibility" };
const FILTERS = ["all", "met", "partial", "gap", "judgement"] as const;

function Requirement({ requirement }: { requirement: RequirementFit }) {
  return (
    <li>
      <details className="requirement">
        <summary>
          <span className={`pill ${requirement.status}`}>{LABEL[requirement.status]}</span>
          <span>{requirement.text}</span>
        </summary>
        <p className="muted">{KIND[requirement.kind]} · {requirement.strength}</p>
        {requirement.covered.length ? <p>Covered: {requirement.covered.join(", ")}</p> : null}
        {requirement.missing.length ? <p>Missing: {requirement.missing.join(", ")}</p> : null}
        {requirement.note ? <p className="muted">{requirement.note}</p> : null}
        {requirement.evidence.length ? (
          <ul className="evidence">
            {requirement.evidence.map((item) => (
              <li key={item.factId}>{item.statement} <span className="muted">({item.entry.title})</span></li>
            ))}
          </ul>
        ) : null}
      </details>
    </li>
  );
}

export default function FitAnalysisView() {
  const { isPending, output } = useToolInfo<"naruvi_show_fit_analysis">();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const send = useSendFollowUpMessage();
  if (isPending) return <div className="frame"><p className="muted">Reading the fit analysis…</p></div>;
  const fit = output as FitAnalysis;
  if (!fit.analyzed) return <div className="frame"><div className="empty">{fit.note ?? "No fit analysis yet."}</div></div>;
  const requirements = (fit.requirements ?? []).filter((item) => filter === "all" || item.status === filter);
  const counts = fit.counts;
  return (
    <div className="frame" data-llm={`Fit analysis for ${fit.title}, filtered to: ${filter}.`}>
      <div className="row spread">
        <div>
          <p className="title">{fit.title}</p>
          <span className="muted">{fit.company ?? ""}</span>
        </div>
        <span className="score" style={{ fontSize: 22 }}>{fit.fit ?? "–"}</span>
      </div>
      {counts ? (
        <div className="row">
          <span className="pill met">{counts.proven} proven</span>
          <span className="pill partial">{counts.partial} partial</span>
          <span className="pill gap">{counts.missing} missing</span>
          <span className="pill judgement">{counts.yourCall} your call</span>
        </div>
      ) : null}
      {fit.mustHaveGaps?.length ? <p><strong>Must-have gaps:</strong> {fit.mustHaveGaps.join("; ")}</p> : null}
      <div className="filters" role="group" aria-label="Filter requirements">
        {FILTERS.map((value) => (
          <button key={value} type="button" className="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value === "all" ? "All" : LABEL[value]}
          </button>
        ))}
      </div>
      <ul className="list">{requirements.map((requirement) => <Requirement key={requirement.id} requirement={requirement} />)}</ul>
      <div className="row">
        <button type="button" className="button" onClick={() => void send(`Tailor my CV for application ${fit.applicationId}, using this fit analysis.`)}>Tailor my CV</button>
        <button type="button" className="button" onClick={() => void send(`Help me prepare for the interview for application ${fit.applicationId}.`)}>Prepare the interview</button>
      </div>
    </div>
  );
}
