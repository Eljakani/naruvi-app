# Changelog

Each release is a signed Git tag `vX.Y.Z` with a GitHub release of the same name.
Update an installation from a terminal with `naruvi update`.

## Unreleased

## 0.4.1 — 2026-11-12

### Fixed
- When the installer has just added you to the `docker` group, it now downloads the published image instead of building for half an hour. `naruvi` commands also work before you log in again.
- A failed image download now shows Docker's reason instead of claiming there is no image for this machine.

## 0.4.0 — 2026-11-12

### Added
- The browser extension can be downloaded from your Naruvi (Integrations → API & browser extension), already set to your address, and is attached to every GitHub release.
- One-click connection: the extension's **Connect** button opens Naruvi, you approve, and it picks up its own key. No key to copy. Its settings open by themselves after installing.
- The release workflow now publishes the GitHub release itself, once the signed image is ready.

## 0.3.0 — 2026-11-12

### Changed
- Installing and updating download a ready-made image of the release instead of building it on your machine: a minute or two instead of up to half an hour. The image is signed by the release workflow and checked before use; `--build` still builds from source.
- The installer installs the latest release by default instead of `main`.
- The app image is smaller: it no longer carries development tools or the build cache.

### Added
- `naruvi use-images` moves an installation that builds from source to the published, signed image.

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
