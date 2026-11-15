# Changelog

Each release is a signed Git tag `vX.Y.Z` with a GitHub release of the same name.
Update an installation from a terminal with `naruvi update`.

## Unreleased

### Added
- CV import reads Word (.docx) and OpenDocument (.odt) files, including tables, text boxes, headers and the addresses behind linked words. Before, a Word file was mistaken for a LinkedIn export and refused.
- Talks, conferences, meetups and hackathons have their own kind of profile entry (**Events & talks**), with the event, your part in it, the organiser, the place and the date.
- After a CV is read you can look up its organisations, certifications, events and skills online (Wikidata, Wikipedia and the organisation's own site for its logo). Only their names are sent. What is found is shown apart from what your CV says, with its source, and each item can be turned off before saving or removed later from the entry. It describes the organisation, certification or event, never you; your own wording is kept unless you choose the suggested name.
- Without a language model, a CV is still read, by its layout and section titles; those entries are saved as "needs review".
- The review screen lists the lines of your CV that ended up in no entry, so a missed job or diploma is visible.
- `npm run profile:eval` scores the import against a set of invented CVs (PDF and Word, one and two columns, English, French, Spanish, German and Arabic).
- Before a CV is written you can choose its length (auto, 1 or 2 pages), how much detail it gives, and what it should stress. What you ask for is followed only where your verified facts support it.
- Each tailored CV shows how it positions you for the job: the angle it takes, the selling points it leads with, the must-haves your profile can't prove, and which of the job's keywords it shows or leaves out. None of this is printed.
- **Suggest designs for this job** in the Look tab proposes three designs chosen for the role, each rendered with your CV, fitted to its page count and checked before you see it. Without a language model they are chosen by rule.
- **Fit to # pages** tightens or opens up text size, line height, margins and gaps within readable limits, so a CV fits its page count without cutting a line.
- Every design says how applicant tracking systems read it (ATS-safe, ATS-friendly, or check reading order, with the reason) and how dense it is. The design gallery can be filtered by kind (ATS-safe, formal, tech, creative, compact, two columns, academic).
- New design options: contact beside the name, a line under the header, dates in a left rail, employer or job title first, date pills, skill pills or columns, and which sections go in the side column. Six new built-in designs: Chrono, Summit, Mosaic, Quartz, Beacon and Folio.

### Changed
- CV import no longer completes what the CV doesn't say: a link is kept only when the file has it (the address behind "LinkedIn" is read from the file instead of being guessed from your name), a language level only when the CV states one, and a month only when the CV names it ("été 2024" stays 2024). A job is marked full-time, remote or similar only when the CV says so, and an imported language is matched to an existing one by its name, not its level.
- PDF text is rebuilt from the position of each line: two-column CVs are read column by column, right-to-left pages in the right order, and repeated page headers and footers are dropped.
- Dates are read in Spanish, German, Italian, Portuguese, Dutch and Arabic as well as English and French, including "seit 04/2021", "depuis septembre 2022" and "2017-10 → 2019-09". Language levels are read from the CV's wording ("courant", "verhandlungssicher", "Muttersprache", "TOEIC 945").
- A long CV is read section by section; a part the model fails on is reported instead of failing the whole import.
- The summary paragraph of a CV fills your profile summary instead of becoming an entry.
- A file that can't be read says why: a scan, a password-protected PDF, an old .doc, a picture, a damaged file.
- The dashboard is simpler: the pipeline shows how many applications are ready to send, and the stat tiles are gone.
- The assistant panel and its approval cards are fully translated (French, Arabic) instead of showing English labels.

### Fixed
- A CV or cover letter is written in one language only. Before, an entry with no approved bullets printed its facts as they were typed, so facts typed in French appeared in French inside an English CV. Facts are now printed in the document's language (their translation), entries are translated before a CV is generated, and titles, skill group names and spoken languages are never borrowed from another language. What has no text in the document's language is left out and listed under Checks, and a new check, "One language throughout", fails when any line reads as another language.
- Fit check: questions in a posting are no longer counted as requirements. One that titles a section ("What do you bring?", "What will you do?", "What you'll get in return?") now sorts the lines under it into requirements, duties or benefits; before, the question could be kept and the real requirements dropped.
- Fit check: accommodation and equal-opportunity notes ("Do you have specific needs or require adjustments during the recruitment process?") are never listed as missing from your profile.
- Fit check: headings decorated with emoji ("🎯 Your profile", "Nice to have ✨") are read as headings, and the same emoji starting each line ("✅ Python") reads as a bullet.
- Fit check: short requirement lines written without bullets, one per line or with blank lines between, are kept as requirements.
- Fit check: German, Spanish, Italian, Portuguese and Dutch postings have their profile, duties, nice-to-have and benefits sections recognized.
- Fit check: vague lines inside a requirements list ("Passionate and curious", "Team player", "etc.") are set aside as too vague to check, and the AI filter can't bring them back.
- Fit check: in a profile section written as prose, "You enjoy…" / "Vous savez…" sentences are picked up as requirements.
- `curl … | bash` no longer stops silently partway through (after installing Docker, or right after "Reach the address"): the installer is read whole before it runs, so commands that read their input can't swallow the rest of it.
- When the HTTPS certificate can't be issued, the installer and `naruvi doctor` show Let's Encrypt's own reason. A timeout while the server answers on port 80 itself is reported as a firewall in front of the server (provider, university or lab network), with what to open, or a tunnel when you can't.

## 0.5.0 — 2026-11-14

### Added
- Pages that run an AI step say so before you click when no language model is connected, with a link to connect one.
- The fit check compares the level a job asks for with the experience your profile shows, not only the skills.
- A fit check that is running or failed stays visible on the application page, with a way to retry and to open its trace.
- The setup guide checks the decision model's key with one question before saving it; an OpenRouter key saved for the language model can be reused.
- `naruvi doctor` checks settings, services, database migrations, the address and DNS, and says what to fix.
- An installation that was interrupted or failed is picked up where it stopped when you run the installer again, with the same secrets.

### Changed
- Applications board: on phones the stages stack and empty ones are hidden; on desktop empty stages take a narrow lane, so the board no longer scrolls sideways.
- Integrations that are off fold to one line with a **Set up** button.
- Lists share one toolbar layout: search first, actions at the end (Applications, Contacts).
- Without search goals, job rows only flag a clear location mismatch; an unsure check becomes a hint to set goals.
- The application page drops empty boxes ("At a glance" before a summary, "not run" on the fit tab); document hints wrap instead of being cut.
- On phones, job rows keep their status, and small controls (tags, goal links, salary links, the bell) get a finger-sized tap area.

### Fixed
- Pages no longer re-render from scratch at phone width (a hydration mismatch in the sidebar).
- Requirement extraction no longer counts list lines such as "Notre stack technique comprend :" or "Informations complémentaires :" as requirements, nor the lines under them.
- Job-alert digests and newsletters that name a company you applied to are no longer matched to that application.
- Reinstalling after deleting the installation folder no longer generates new secrets for the old database (which then refused to start): the installer stops and says how to keep or delete that data.
- Hosted installs stop before changing anything when port 80 or 443 is taken, instead of failing later with a Docker error.
- `naruvi start`, `update`, `restore` and the installer confirm that every database migration is applied before reporting success. A failed migration now shows the database's own error; before, it failed without a reason.
- A missing or malformed `SETTINGS_ENCRYPTION_KEY`, `POSTGRES_PASSWORD` or `NARUVI_URL` in `.env` is explained with the fix. `naruvi setup-link` says when Naruvi is stopped or an owner already exists.
- The installer tells "the app is down" apart from "the address is not reachable yet" (DNS, firewall), and names what uses a busy port when the system can tell.

## 0.4.2 — 2026-11-13

### Added
- Hosted installs offer to open ports 80 and 443 when the server's firewall (ufw or firewalld) is on. The installer asks for sudo right after you choose Hosted instead of midway; `--yes --firewall` does the same without questions.

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
