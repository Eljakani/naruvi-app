# ADR 0001 — CV rendering and generation

Date: 2026-11-05 · Status: accepted

## Context

Naruvi is open source and must work for anyone after `docker compose up`,
in any field and language, with or without an LLM key. The predecessor (CV
Studio) generated LaTeX with an LLM and compiled it in a TeX Live container.

## Decision

1. **Documents are structured data, not markup.** A CV is a typed JSON model
   (header, sections, items, bullets) stored on immutable revisions. Every
   bullet carries the phrasing/fact ids that ground it.
2. **Rendering uses `@react-pdf/renderer`** (pure JS): no TeX Live, no headless
   browser. Output is real, selectable text (ATS-readable). Templates are
   React components; LaTeX/DOCX export can be added as extra renderers.
3. **Generation is deterministic first.** The composer selects verified
   entries (ranked by the fit analysis) and the user's approved phrasings in
   the target language, ordered by relevance to the job. No LLM is needed.
   A model may later reorder or tighten wording, but only within the same
   facts, and its output passes the same grounding and quality checks.
4. **Quality gate is deterministic**: grounding, page budget (measured on the
   rendered PDF), language consistency, contact details, must-have coverage,
   bullet length, empty sections.

## Consequences

- Zero extra services; generation works offline and is fully reproducible.
- Template variety is limited to what react-pdf can lay out (sufficient for
  clean, ATS-friendly CVs).
- Quality of wording depends on the user's approved phrasings — which is the
  point: the user stays the author of every claim.

## Update 2026-11-05 — templates and fonts

- Three templates (classic, modern, serif), all single-column real text; modern
  takes an accent color. Users switch freely; design changes save a revision.
- Fonts: per-script Noto families (Latin, Latin Ext, Cyrillic, Greek, Arabic,
  Hebrew, Devanagari, Thai) are bundled via @fontsource; CJK (SC/JP/KR, static
  Regular/Bold from notofonts/noto-cjk) download on first use into the asset
  volume. Each document gets a font stack from the scripts it contains; the
  document language's script goes first. Missing fonts fail the quality gate.
- Hyphenation is disabled (react-pdf only knows English rules).
- **Known limitation:** react-pdf's Arabic shaping can drop a letter at the
  start of some runs. Right-to-left layout works; Arabic text needs a check
  before sending until react-pdf improves or an alternative renderer is added.
