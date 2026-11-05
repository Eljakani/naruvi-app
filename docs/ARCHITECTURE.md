# Naruvi — Architecture

Naruvi turns a job posting into a truthful, tailored, verified application
(CV + optional cover letter), running locally with `docker compose up`.

It is the clean-room successor of the "CV Studio" DSH plugin. The lessons from
that plugin are baked into the design from day one instead of patched in.

## 1. Principles

0. **For anyone, in any field.** Naruvi is open-source software for every
   job seeker — nurses, buyers, teachers, engineers, drivers — not a tool tuned
   to one profile. No logic may assume a field, a language pair or a CV
   template. Field knowledge lives in data (skill vocabulary packs) and is
   always backed by field-agnostic fallbacks (term detection, lexical match).

1. **Workflows first, agents where they earn it.** The application lifecycle is a
   deterministic state machine. LLM calls happen only inside bounded steps with
   typed inputs/outputs. No open-ended "agent loop" owns the user's documents.
2. **Grounded by construction.** The profile is a store of *facts* with ids and
   evidence. Every generated claim must cite fact ids; a deterministic verifier
   rejects uncited claims, invented numbers and do-not-claim violations.
3. **Evaluator–optimizer with hard gates.** A candidate document is kept only if it
   passes deterministic checks (compile, page budget, language, contact, no
   placeholders) *and* scores better than the current revision. Otherwise it is
   discarded — but still stored for inspection.
4. **Immutable revisions.** Documents are append-only revisions. "Undo" is a
   pointer move. Nothing the AI does is destructive.
5. **Durable, idempotent jobs.** Long work (fetch, analyze, generate, compile,
   check) runs in a Postgres-backed queue with retries, per-application locks and
   idempotency keys. Closing the browser never leaves half-written state.
6. **Untrusted input stays data.** Job pages, company sites and research sources
   are untrusted: fenced in prompts, never given tool authority, and never
   allowed to change instructions (prompt-injection defense).
7. **Observable by default.** Every run records steps, prompts (by version),
   model, tokens, latency, cost, tool calls and the decision taken.
8. **Typed contracts everywhere.** Zod schemas define API payloads, LLM structured
   outputs and tool I/O; TypeScript types are inferred from them.
9. **Evals are part of the codebase.** Golden fixtures (postings → expected
   parse, profiles → expected claims) run in CI; prompts are versioned and a
   prompt change must not regress evals.
10. **Least privilege + budgets.** Each step gets only the tools it needs, a token
    budget and a timeout. LaTeX compiles in an isolated, network-less container.

## 2. Services (docker compose)

| Service   | Role |
|-----------|------|
| `db`      | PostgreSQL 17 + pgvector. Single source of truth (data, queue, traces). |
| `migrate` | One-shot: applies Drizzle migrations, then exits. |
| `app`     | Next.js (App Router) UI + route handlers / server actions. |
| `worker`  | Queue consumer (pg-boss) running workflow steps. |

Local dev runs `db` in Docker and `app`/`worker` on the host with hot reload.

## 3. Domain model

```
Profile ── Entry (key, kind, status, display per language, tags, skills,
           │        evidence, doNotClaim, confidential)
           ├─ Fact      (one atomic, citable truth)
           └─ Phrasing  (approved wording per language, role bullet|label,
                         linked fact ids → grounding check)

Company (name, website, logo, verified sources)
Job     (source url, board, parsed fields, raw text, language, parse confidence)
Application (job, company, status, language, cover-letter decision)
  ├─ Document (kind: cv | cover-letter, language)
  │    └─ Revision (latex, rendered pdf, quality report, cited fact ids, parent, origin run)
  ├─ Analysis (requirements, keywords, fit, selected fact ids)
  └─ Research (sources with urls, claims flagged to-verify)

Run (workflow, status, input hash) ── Step (name, status, model, prompt version,
                                         tokens, cost, latency, output, error)
```

## 4. Application lifecycle (state machine)

```
draft → parsed → analyzed → (researched) → generated → compiled → checked
      → ready (score ≥ 90, zero hard errors) → submitted → interviewing → offer | rejected
```

Every transition is a workflow step; illegal transitions are rejected server-side.

## 5. The guarded generation step

```
lock(application, document)
→ select facts (analysis + user picks)
→ generate (structured output: latex + cited fact ids)
→ validate (schema, latex structure, unsafe primitives, identity preserved)
→ verify claims (every bullet cites facts; numbers appear in cited facts)
→ compile (latex service) → auto-repair once on error
→ quality gate (deterministic) → compare with current revision
→ keep (new revision becomes current) | discard (stored, not current)
→ unlock
```

## 6. Repository layout

```
src/
  app/                 Next.js routes (UI + API route handlers)
  components/          shadcn blocks/components and app components
  server/
    db/                Drizzle schema, client, migrations
    domain/            pure domain logic (state machine, scoring) — no I/O
    workflows/         workflow definitions (steps, guards)
    agents/            LLM steps: prompts (versioned), schemas, tools
    integrations/      job boards, company resolver, latex client, LLM provider
  lib/                 shared utils, env (validated with zod)
worker/                queue consumer entrypoint
evals/                 golden fixtures + eval runner
docs/                  architecture and decisions (ADRs)
```

## 7. Build order (step by step)

1. Foundation: compose, db, schema, env, app shell. ✅
2. Profile: entries/facts/phrasings, grounding checks, editor, my-cv import. ✅
3. Jobs: universal link parser ✅ + company/logo resolver + golden evals.
4. Analysis: requirements, evidence matching, fit, optional model review. ✅
5. Generation ← **next**: requirements/keywords/fit with cited facts.
   Generation + LaTeX service + quality gate + revisions.
6. Cover letters, templates & fonts, company research ✅
7. Tracking board, traces UI, eval dashboard ← **next**

## 8. Grounding rules (implemented in `src/server/domain/grounding.ts`)

- A *bullet* phrasing is grounded when it links ≥1 fact and every number it
  states (money, %, counts; not years or "1st") appears in a linked fact.
- *Labels* (section/cluster names) are not claims and need no facts.
- Import links phrasings automatically (shared numbers or vocabulary); a
  translation with no shared words inherits the links of its sibling in the
  other language (same group, same position) and is re-verified on numbers.
- The same checks will gate generated text in step 5.

## 9. Job ingestion (implemented in `src/server/jobs/`)

```
link ─▶ ATS APIs (Greenhouse, Lever, Ashby, SmartRecruiters, LinkedIn guest) + public page
     ─▶ parse each (vendored parser, zod-validated) ─▶ pick best (pure `select.ts`)
     ─▶ if incomplete/blocked: render once in headless Chromium, wait for job data,
        parse the rendered DOM, keep the better result (`url-source.ts`)
     ─▶ company site: structured data, links, recruiter e-mail domain, text; weak
        candidates verified by fetching the homepage; job-board hosts never accepted
     ─▶ logo: posting header logo, then site icons (touch icon, JSON-LD, header img,
        og:image last); each downloaded image is cropped to its content and scored
        on squareness × source × resolution; best one stored
     ─▶ draft (nothing saved) ─▶ user reviews/edits ─▶ save (idempotent on canonical URL)
```

- All network access goes through `safeFetch` (public addresses only, re-checked on every redirect, size-capped, timed out).
- The browser reader (`browser.ts`) uses temporary Playwright contexts. All page, script, API, and frame requests are fulfilled through `safeFetch`; service workers, WebSockets, downloads, non-GET requests, and heavy image/media/font resources are blocked. Rendering is limited to 25 seconds after launch, 100 requests, 3 MB per response/DOM, 24 MB of accepted response bodies, and two active browsers per process. Delayed job data is polled for up to eight seconds. It does not use the user's browser session or solve login/CAPTCHA walls.
- `npm run browser:install` installs Chromium locally; Docker includes Chromium and its system libraries. `npm run test:browser` checks delayed JavaScript/JSON extraction and private-address/write-request blocking in real Chromium using a fixture transport.
- Every preview is traced (`runs` / `run_steps`): source used, confidence, site decision, logo source.
- Golden evals: `evals/jobs/fixtures/*` hold captured raw responses; `npm run evals` checks company, role, language, location, description length and website offline. Capture new ones with `npm run jobs:capture -- <name> <url>` and review the expected values by hand.

## 10. Fit analysis (implemented in `src/server/analysis/`)

```
job text ─▶ posting-item candidates (sections: must / responsibilities / nice; years)
         ─▶ AI requirement filter (posting only, no candidate profile): retain
            qualifications/duties; exclude hiring steps, benefits, application
            instructions and company background; rules-only fallback
         ─▶ skills: vocabulary packs (tech, business, care, education, trades,
            languages…) + term detection for unknown tools/acronyms
verified facts only ─▶ match each requirement:
   proven    every named skill appears in a fact statement (named products must
             be named; coursework only proves knowledge/certification asks)
   partly    some skills, entry tags only, coursework, or related skills
   not in profile   nothing backs it → listed under "Don't claim these"
   your call        soft skills / unprovable context → shown, never scored
─▶ optional model evidence review (configured model in Settings): uncertain items only, candidate
   facts by alias, invented ids dropped, "proven" requires a surviving fact
─▶ fit score (must 1 · responsibilities 0.6 · nice 0.4), entries to lead with,
   key skills ✓/✗, cover-letter decision; stored on the application, traced.
```

Extending to a new field: add a pack to `src/server/analysis/keywords.ts`
(canonical key → EN/FR patterns) and, if useful, `RELATED` links. Tests in
`src/server/domain/__tests__/analysis.test.ts` include non-tech cases.

`filter.ts` reviews up to 120 posting items in batches of 24 before any matching
or scoring. Decisions use original IDs and exact category enums. Positive
classifications retain the original text/keywords/years and can correct the
requirement kind; negative classifications are stored with category, source and
reason. Unknown IDs and conflicting duplicate decisions are ignored; missing,
failed or unreviewed decisions keep the baseline extraction. The AI can recover
genuine duties from an overly broad section heuristic. Obvious French interview
labels and skipped sections are handled offline too, and fallback never
reintroduces explicitly excluded process/benefit lines. Keyword coverage uses
only retained requirements. Stored analyses optionally include `requirementFilter`
metadata, rendered as an inspectable excluded-details list. The shared AI SDK
runtime includes the caller's generated JSON Schema in its system instructions
as well as validating the returned JSON locally.

## 11. CV generation (implemented in `src/server/documents/`, see ADR 0001)

```
application (analysis) + verified profile
  ─▶ compose (pure): verified entries only; approved, grounded phrasings in the
     target language (facts as fallback only in the profile's own language);
     bullets ranked by evidence for proven requirements, then job keywords;
     entries newest first (dates parsed in EN/FR/ES/DE); extra bullets kept
     but excluded so the user can swap them in; no language mixing
  ─▶ render (React-PDF, classic single-column template, real text)
  ─▶ quality gate (pure): grounded bullets, contact, headline, page budget
     measured on the PDF, experience present, must-have evidence shown,
     missing translations, bullet length/density
  ─▶ immutable revision (content JSON, pages, quality, cited fact ids);
     edits = new revision; restore = move the pointer
```

## 12. Cover letters (`src/server/documents/letter.ts`)

Three kinds of content, never mixed: **evidence** (the user's approved,
fact-backed bullets for proven requirements, cited), **template** wording in
en/fr/es/de that names the company/role and claims nothing, and a
**placeholder** for what only the candidate can say (why this company). The
letter gate refuses "ready" while the placeholder remains, and checks company
named, grounded highlights, length and one page. Same revisions/versions and
PDF route as the CV.

## 13. Company research (`src/server/research/`)

No LLM, nothing invented, every item sourced. Reads up to 6 pages of the
company's own site (home → linked about/mission/values/careers pages →
conventional paths), same registrable domain only, robots.txt respected
(wildcards supported), SSRF-safe fetches; 403/429 blocks are reported, not
retried. Extraction is deterministic (meta, JSON-LD Organization, mission and
"we/our" scale/founded sentences, values lists) plus the posting's own
"About" section (recruiting sentences excluded). Facts are cached on the
company for 7 days; prompts and sentence starters are generated per document
language at display time and are questions for the candidate — never prose.

## 14. Model credentials (`src/server/settings/llm.ts`)

Model credentials are managed in Settings. `src/server/settings/llm.ts` returns a
redacted status DTO for the UI and reads the latest configuration for each model
call. The `language-model` settings row stores AES-256-GCM ciphertext with a fresh
nonce and endpoint-bound authentication data. `SETTINGS_ENCRYPTION_KEY` stays in
the server environment; decryption happens only before use. Credential settings
are excluded from JSON exports. API errors expose status codes, not provider
response bodies. Existing environment configuration is used only until settings
are first saved. `npm run settings:key` initializes the environment encryption
secret without printing or replacing it.

## 15. AI-assisted document composition (`src/server/documents/ai-compose.ts`)

The deterministic composers create the baseline first. If a model is configured,
one bounded model call per document proposes CV bullet selection/rewrites or letter
paragraphs and highlight rewrites. CV E/B aliases map only to offered, verified
entries/bullets, and original fact IDs are retained. Local checks reject additions
of numbers, years and recognized skills; CV selection cannot drop previously shown
must-have evidence. Letter F/S/J/H aliases resolve to verified facts, cached
company sources, posting text and approved highlights. Contact fields never enter
the prompt. Model-supplied document identity, styling and arbitrary fact IDs are
never applied. Invalid output/provider failures fall back to the baseline.

Rewrites store original text; letter paragraphs store fact/source citations.
`aiAssistance` metadata stores model, prompt version, change count and review
state. Both quality gates require human review of AI drafts because syntactic
grounding cannot verify semantic entailment or personal motivation. Review is
saved as another immutable revision. Existing manually written/reviewed motivation
is preserved on redraft. AI use/fallback is traced as a generation run step. Old
revisions remain compatible through optional JSON fields; no SQL migration is
required.

## 16. Shared AI runtime and request traces

`src/server/llm/transport.ts` uses Vercel AI SDK `generateText` with `Output.json`
and `@ai-sdk/openai-compatible`. Compatible endpoints receive JSON mode rather
than assuming strict JSON Schema support; each workflow's Zod schema is still
enforced before its output is used. Retry budget is one transient retry under an
overall abort timeout. Redirects are refused so credentials do not follow a
different endpoint. Provider/SDK errors are converted into safe user-facing
messages; provider bodies and request prompts are never copied into traces.

`completionForRun` wraps each model call in an individual step. The tracer writes
`running` before execution, then updates the existing step to `succeeded` or
`failed`; model, prompt version, input/output tokens and latency use the existing
`run_steps` columns. The Runs page reads only operational metadata and provides a
manual refresh. The document's outer AI step records a distinct fallback reason,
so a successful HTTP response rejected by grounding checks is distinguishable
from an API/network failure. No SQL migration or hosted Vercel service is needed.

DeepSeek endpoints receive an explicit thinking toggle: bounded JSON editing
defaults to disabled thinking; `CompletionInput.reasoning` can opt future tasks
into low/high reasoning. A sanitized `AiRequestError` carries only operational
metrics, so incomplete-JSON/output-limit failures still record model, actual
attempts and available token counts in `run_steps` without storing the raw SDK
error or its response body.

## 17. AI at every step

Every workflow has a deterministic baseline and an optional AI pass. The model proposes; local checks decide what is kept. With no model configured, the baseline runs alone.

| Step | AI pass | What is checked locally |
| --- | --- | --- |
| Job import (`jobs/ai-extract.ts`) | Reads role, company, location, contract, salary and language when the rules are unsure | Each value must occur verbatim in the posting; structured board data wins |
| Requirement filtering (`analysis/filter.ts`) | Separates qualifications and duties from hiring-process, benefits and company text | Only supplied item ids; unreviewed items keep the rule result |
| Fit matching (`analysis/refine.ts`) | Second opinion on uncertain matches | Only verified facts can be cited |
| CV tailoring (`documents/ai-compose.ts`) | Picks and tightens bullets for the job | No new numbers or skills; must-have evidence can't be dropped |
| Cover letter (`documents/ai-compose.ts`) | Drafts opening, motivation and closing | Every paragraph cites facts and sources |
| Company research (`research/ai-angles.ts`) | Turns the company's own pages into specific, cited angles | Every angle cites sources; no numbers its sources don't state |
| Profile bullets (`profile/ai-bullets.ts`) | Drafts bullets in each language from an entry's facts | Must cite facts; no numbers or skills beyond them; never saved without the user |

Each AI request is a traced step with model, prompt version and token counts (see Runs).
