# Changelog

Each release is a signed Git tag `vX.Y.Z` with a GitHub release of the same name.
Update an installation from a terminal with `naruvi update`.

## Unreleased

## 0.2.0 — 2026-11-12

### Added
- Adding a job to Applications checks your fit right away, in the background. Turn it off under Settings → Applications.
- Profile facts are translated automatically between English and French, and the job fit check matches each fact in both languages, so a French CV counts as evidence for an English posting.
- English, French, and Arabic interface locales, including right-to-left layouts, Arabic assistant replies, and Arabic email templates.
- Cloudflare Workers AI and OpenAI Decisions as decision-model providers.
- Bundled the interface fonts locally and added production builds and installer tests to CI.

### Fixed
- Confirming a CV import no longer shows an error page: an entry that can't be saved is reported and the rest are kept, and an entry whose name the CV doesn't give is saved for review.
- CV import keeps project, certification, school and company names the model put in the wrong field, reads every section of French CVs (education, languages, skills), and no longer rejects a CV with long skill lists.
- Imported skills are recognized regardless of accents, punctuation and spacing ("Node.js", "node js").

## 0.1.0 — 2026-11-09

First public version.

### Added
- Grounded profile: entries, facts and bullets in several languages, guided entry filling and dictation.
- Jobs and applications in one place, with a six-step progress bar and an outcomes funnel on the dashboard.
- Job analysis against your profile and your search goals, with fit filters and company job-board watching.
- Tailored CVs and complete cover letters, editable templates and PDF export.
- Ask Naruvi, an assistant that answers from your data and proposes changes you apply with a click.
- Email: matching mail to applications, AI-drafted replies and interview times in the calendar feed.
- Companies and contacts, with facts from Wikidata and the French registry.
- Dark mode, a first-run setup guide and the `naruvi` command for status, backups and updates.
