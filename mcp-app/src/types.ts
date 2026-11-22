/** What the views receive. These mirror the structured results of Naruvi's own MCP tools. */

export type ApplicationSummary = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  status: string;
  stage: string;
  fit: number | null;
  nextStep: string | null;
  nextStepDue: string | null;
  archived: boolean;
  updatedAt: string;
};

export type Evidence = { factId: string; statement: string; entry: { id: string; title: string; kind: string } };

export type RequirementFit = {
  id: string;
  text: string;
  kind: "must" | "nice" | "responsibility";
  section: string | null;
  status: "met" | "partial" | "gap" | "judgement";
  strength: string;
  covered: string[];
  missing: string[];
  note: string | null;
  evidence: Evidence[];
};

export type FitAnalysis = {
  analyzed: boolean;
  note?: string;
  applicationId?: string;
  title?: string;
  company?: string | null;
  fit?: number | null;
  counts?: { proven: number; partial: number; missing: number; yourCall: number };
  mustHaveGaps?: string[];
  recommendedEntries?: { id: string; title: string; kind: string; requirementsBacked: number }[];
  requirements?: RequirementFit[];
};

export type CvResult = {
  exists: boolean;
  note?: string;
  applicationId?: string;
  language: string;
  role?: string;
  company?: string | null;
  pages?: number | null;
  quality?: { score: number; ready: boolean } | null;
  strategy?: { angle: string; strengths: { text: string }[]; gaps: string[] } | null;
  text?: string;
};
