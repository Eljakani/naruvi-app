import "./naruvi.css";

import { useSendFollowUpMessage } from "skybridge/web";
import { useToolInfo } from "../helpers.js";
import type { ApplicationSummary } from "../types.js";

/** Board columns, in the order an application moves through them. */
const COLUMNS: { title: string; statuses: string[] }[] = [
  { title: "Preparing", statuses: ["draft", "parsed", "analyzed", "generated", "ready"] },
  { title: "Applied", statuses: ["submitted"] },
  { title: "Interviewing", statuses: ["interviewing"] },
  { title: "Closed", statuses: ["offer", "rejected", "withdrawn"] },
];

function fitClass(fit: number | null) {
  if (fit === null) return "judgement";
  return fit >= 75 ? "met" : fit >= 50 ? "partial" : "gap";
}

function due(date: string | null) {
  if (!date) return "";
  return new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Card({ application }: { application: ApplicationSummary }) {
  const send = useSendFollowUpMessage();
  const open = () => void send(`Show the fit analysis for my application "${application.title}"${application.company ? ` at ${application.company}` : ""} (id ${application.id}).`);
  return (
    <button type="button" className="card" onClick={open} title="Ask for the fit analysis">
      <span className="row spread">
        <strong>{application.title}</strong>
        <span className={`pill ${fitClass(application.fit)}`}>{application.fit === null ? "No fit" : <span className="score">{application.fit}</span>}</span>
      </span>
      <span className="muted">{[application.company, application.location].filter(Boolean).join(" · ") || "No company"}</span>
      {application.nextStep ? <span>Next: {application.nextStep}{application.nextStepDue ? ` · ${due(application.nextStepDue)}` : ""}</span> : null}
    </button>
  );
}

export default function Applications() {
  const { isPending, output } = useToolInfo<"naruvi_show_applications">();
  if (isPending) return <div className="frame"><p className="muted">Loading applications…</p></div>;
  const applications = (output as { applications?: ApplicationSummary[] }).applications ?? [];
  if (!applications.length) return <div className="frame"><div className="empty">No applications match.</div></div>;
  const columns = COLUMNS.map((column) => ({ ...column, items: applications.filter((item) => column.statuses.includes(item.status)) })).filter((column) => column.items.length);
  return (
    <div className="frame" data-llm={`Board of ${applications.length} application(s). Clicking a card asks for its fit analysis.`}>
      <div className="row spread">
        <p className="title">Applications</p>
        <span className="muted">{applications.length} shown</span>
      </div>
      <div className="columns">
        {columns.map((column) => (
          <section key={column.title} className="column" aria-label={column.title}>
            <h3>{column.title} · {column.items.length}</h3>
            {column.items.map((application) => <Card key={application.id} application={application} />)}
          </section>
        ))}
      </div>
    </div>
  );
}
