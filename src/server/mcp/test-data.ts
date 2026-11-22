/** Invented data for MCP tests: a fake Naruvi that records calls, so tests see what each tool asked for. */
import type { NaruviData } from "./server"

export const APP = "2b7e1c44-9a51-4c1e-8f43-6f2d1e0a7b10"
export const JOB = "c3f0a9d2-17b4-4b6e-9e21-0d8a5c4f2e33"

export function fake() {
  const calls: [string, unknown[]][] = []
  const record = (name: string, value: Record<string, unknown> = { ok: true }) => async (...args: unknown[]) => {
    calls.push([name, args])
    return value
  }
  const data: NaruviData = {
    attention: record("attention", { replies: [], todo: [], upcoming: [] }),
    listApplications: record("listApplications", { applications: [] }),
    recentApplications: async () => [{ id: APP, title: "Platform Engineer", company: "Northwind Labs", language: "en" }],
    getApplication: record("getApplication"),
    fitAnalysis: record("fitAnalysis", { fit: 72, requirements: [{ text: "Terraform", status: "met", evidence: [{ statement: "Wrote Terraform modules." }] }] }),
    searchJobs: record("searchJobs"),
    getJob: record("getJob"),
    profile: record("profile", { name: "Alex Example" }),
    entries: record("entries", { entries: [] }),
    entry: record("entry"),
    documents: record("documents"),
    cv: record("cv", { exists: true, text: "# Alex Example" }),
    letter: record("letter"),
    cvStyle: record("cvStyle", { template: "atlas" }),
    contacts: record("contacts"),
    updateApplication: record("updateApplication"),
    setNotes: record("setNotes"),
    runFitAnalysis: record("runFitAnalysis"),
    generateCv: record("generateCv"),
    reviseCv: record("reviseCv"),
    generateLetter: record("generateLetter"),
    draftEmail: record("draftEmail", { sent: false, subject: "Following up", body: "Hello" }),
    saveJobLead: record("saveJobLead"),
    addJob: record("addJob"),
  }
  return { data, calls }
}
