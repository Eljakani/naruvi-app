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

## Get it

- **From your Naruvi:** **Integrations → API & browser extension → Download the extension**. That copy includes a `naruvi.json` with your Naruvi's address (no key or other secret).
- **From GitHub:** `naruvi-extension-X.Y.Z.zip` is attached to every [release](https://github.com/Eljakani/naruvi-app/releases/latest).
- **From a checkout:** this `extension` folder.

## Install (Chrome, Edge, Brave, Arc)

1. Unzip, open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `naruvi-extension` folder (or this `extension` folder).

## Install (Firefox 128+)

Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** and pick the zip (or `manifest.json`). Firefox removes temporary add-ons when it restarts.

## Connect

On first install the settings page opens by itself. Enter or check your Naruvi address and click **Connect**:

1. The extension asks once for permission to reach that address (localhost is allowed already).
2. It opens `<your Naruvi>/integrations/extension`. Sign in if asked, then click **Connect**.
3. Naruvi creates a key named "Browser extension" and puts it only in that tab's page. The extension, which opened the tab and is allowed on that address, reads it from there. It then checks it with `GET /api/v1/me`, stores it in `storage.local` and closes the tab.

The key never appears in a URL. Another website can't read it, because it can't read a Naruvi tab. Revoke it anytime under **Integrations → API & browser extension**. You can also paste a key yourself under *Use an API key instead*.

## API used

`GET /api/v1/me`, `POST /api/v1/jobs/preview` (draft, inline logo, duplicates; saves nothing), `POST /api/v1/jobs` (save and track), `GET /api/v1/lookup?url=`, `POST /api/v1/contacts`, `POST /api/v1/captures` (job lead), `GET /api/v1/attention`, `GET /api/v1/jobs?q=`.

No build step: plain ES modules. `popup.html?tab=<id>` opens the popup as a page for a given tab, for debugging.
