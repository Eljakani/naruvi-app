# Naruvi (browser extension)

Save job postings and people to your own Naruvi without leaving the page.

- **Read a posting in place.** Open the extension on a job posting and it reads it straight away: role, company, location, work mode, contract, salary and the company logo, plus a check against jobs you already saved. You review the fields in the popup and click **Save & track**; nothing opens in a new tab.
- **Works behind logins.** It sends the page as you see it (visible text and a slimmed copy with JSON-LD and meta tags), so LinkedIn and other signed-in boards are read from your view, not a login wall.
- **Keeps going when you close it.** Reading runs in the background; the toolbar icon shows `…` while it works and `1` when the draft is ready.
- **People.** On a LinkedIn profile, save the person as a contact (editable name, headline, company).
- **Today.** Replies, follow-ups and upcoming steps from your Naruvi, and a quick search through your saved jobs.
- **Right-click** a page to read it, or a link to keep it as a job lead. **Shortcuts:** <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> opens Naruvi, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> reads the page in the background.
- **Optional:** mark the icon when the page you're on is already saved (asks for the `tabs` permission; only job boards and LinkedIn profiles are checked).

English and French, light and dark, following your browser.

## Privacy

Pages are read only when you ask (click, shortcut or right-click), except the optional "already saved" check, which sends the page address. Naruvi receives the link, the visible text and a slimmed copy of the page: scripts (other than JSON-LD), styles, form fields and their values are removed, and cookies are never read. Everything goes to your own Naruvi only.

## Install (Chrome, Edge, Brave, Arc)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `extension` folder.
3. The settings page opens from the gear icon: enter your Naruvi address (default `http://localhost:3000`) and an API key from **Integrations → API & browser extension**.

## Install (Firefox 128+)

1. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** and pick `manifest.json`.
2. Open the add-on's preferences and enter the address and API key.

## API used

`GET /api/v1/me`, `POST /api/v1/jobs/preview` (draft, inline logo, duplicates; saves nothing), `POST /api/v1/jobs` (save and track), `GET /api/v1/lookup?url=`, `POST /api/v1/contacts`, `POST /api/v1/captures` (job lead), `GET /api/v1/attention`, `GET /api/v1/jobs?q=`.

No build step: plain ES modules. `popup.html?tab=<id>` opens the popup as a page for a given tab, for debugging.
