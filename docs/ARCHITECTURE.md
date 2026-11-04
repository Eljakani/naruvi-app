# CareerBuddy — Architecture

CareerBuddy turns a job posting into a truthful, tailored, verified application
(CV + optional cover letter), running locally with `docker compose up`.

It is the clean-room successor of the "CV Studio" DSH plugin. The lessons from
that plugin are baked into the design from day one instead of patched in.

## 1. Principles

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
| `latex`   | TeX Live compile service, no network, read-only source mounts. |

Local dev runs `db` in Docker and `app`/`worker` on the host with hot reload.

## 3. Domain model

```
Profile ─┬─ Fact (id, kind, text, evidence, tags, doNotClaim, lang variants)
         └─ Asset (logo, photo)

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

1. Foundation: compose, db, schema, env, app shell. ← **current**
2. Profile: facts store + editor + import.
3. Jobs: universal link parser + company/logo resolver + golden evals.
4. Analysis: requirements/keywords/fit with cited facts.
5. Generation + LaTeX service + quality gate + revisions.
6. Research, cover letters, multi-language.
7. Tracking board, traces UI, eval dashboard.
