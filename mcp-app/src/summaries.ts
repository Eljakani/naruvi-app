import type { ApplicationSummary, CvResult, FitAnalysis } from "./types.js";

/** Short text the model reads next to each view, so it can talk about what the user sees. */

export function applicationsText(applications: ApplicationSummary[]) {
  if (!applications.length) return "No applications match.";
  const lines = applications.map((item) => `- ${item.title}${item.company ? ` at ${item.company}` : ""} (id ${item.id}): ${item.stage}${item.fit === null ? "" : `, fit ${item.fit}`}${item.nextStep ? `, next: ${item.nextStep}` : ""}`);
  return [`Showing ${applications.length} application(s) as a board.`, ...lines].join("\n");
}

export function fitText(fit: FitAnalysis) {
  if (!fit.analyzed) return fit.note ?? "No fit analysis yet.";
  const counts = fit.counts;
  const head = `Fit for ${fit.title}${fit.company ? ` at ${fit.company}` : ""}: ${fit.fit ?? "not scored"}${counts ? ` (${counts.proven} proven, ${counts.partial} partial, ${counts.missing} missing, ${counts.yourCall} for the user to judge)` : ""}.`;
  const gaps = fit.mustHaveGaps?.length ? `Must-have gaps: ${fit.mustHaveGaps.join("; ")}.` : "No must-have gaps.";
  return `${head}\n${gaps}\nThe view lists each requirement with its evidence.`;
}

export function cvSummary(cv: CvResult) {
  if (!cv.exists) return cv.note ?? "No CV yet.";
  return `Showing the ${cv.language} CV for ${cv.role}${cv.company ? ` at ${cv.company}` : ""}${cv.pages ? `, ${cv.pages} page(s)` : ""}${cv.quality ? `, quality ${cv.quality.score}` : ""}.\n\n${cv.text ?? ""}`;
}

/** The small Markdown subset Naruvi's CV text uses: #, ##, ### headings, bold, and "- " bullets. */
export type CvBlock =
  | { type: "name"; text: string }
  | { type: "section"; text: string }
  | { type: "item"; text: string }
  | { type: "bullet"; text: string }
  | { type: "text"; text: string };

export function cvBlocks(markdown: string): CvBlock[] {
  return markdown.split("\n").flatMap((line): CvBlock[] => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("### ")) return [{ type: "item", text: trimmed.slice(4) }];
    if (trimmed.startsWith("## ")) return [{ type: "section", text: trimmed.slice(3) }];
    if (trimmed.startsWith("# ")) return [{ type: "name", text: trimmed.slice(2) }];
    if (trimmed.startsWith("- ")) return [{ type: "bullet", text: trimmed.slice(2) }];
    return [{ type: "text", text: trimmed }];
  });
}

/** Splits "**bold** rest" into parts, so views render emphasis without HTML injection. */
export function boldParts(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) => (part.startsWith("**") && part.endsWith("**") ? { bold: true, text: part.slice(2, -2) } : { bold: false, text: part }));
}
