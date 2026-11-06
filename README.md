# Naruvi

Truthful, tailored, verified job applications — locally. Naruvi turns job postings
and verified profile facts into tailored CVs and cover letters, with application
tracking in one local workspace. An OpenAI-compatible model is optional.

## Local development

Requires Node.js 24 and Docker Compose.

```bash
npm ci
npm run browser:install
cp .env.example .env.local
npm run settings:key
npm run db:up
npm run db:migrate
npm run dev
```

Open [Naruvi](http://localhost:3000). Run `npm run worker` in another terminal
for background jobs. Configure optional model access in **Settings → Language model**.

URL imports try structured job-board APIs and direct HTTP first. If the extracted
posting is incomplete or needs JavaScript, Naruvi retries it in headless Chromium
and keeps the better result. Browser rendering has time, request, and size limits;
private addresses are blocked for pages and subresources. Login walls and CAPTCHAs
may still require pasting the job description. Chromium runs in a temporary session
without your browser's cookies and only makes GET requests.

On Linux, if Chromium reports missing system libraries, install them with
`npx playwright install --with-deps chromium` (see the
[Playwright browser setup](https://playwright.dev/docs/browsers)). Docker images
include Chromium and its system dependencies.

## Run with Docker

```bash
npm run settings:key -- .env
docker compose --profile full up --build -d
```

This starts PostgreSQL, runs migrations, and starts the app and worker. Database
and uploaded assets are stored in named volumes.

## Model credentials

Set the API base URL, model name and API key in **Settings → Language model**,
save, then test the connection. Saved changes apply to the next model call without
restarting. Leaving the key blank keeps it; removal is an explicit action.

API keys are encrypted with AES-256-GCM before being written to the existing
`settings` table. Only the server decrypts them, immediately before a model call.
The UI receives key status only; JSON exports omit the model credential setting,
including its ciphertext. No database migration is needed.

`SETTINGS_ENCRYPTION_KEY` must contain 32 random bytes as 64 hex characters.
`npm run settings:key` creates it in `.env.local` without printing it or replacing
an existing key; use `npm run settings:key -- .env` for Docker Compose. Restart
once after adding this environment secret. The app and any workers must use the
same value. Back it up separately from the database: if it is lost or changed,
restore the original or replace the saved API key in Settings. This protects a
database-only leak; the running server still needs access to the decryption key.

Existing `LLM_API_KEY` environment values remain a fallback until you first save
model settings, which moves the key into encrypted storage. You can then remove
`LLM_API_KEY` from your environment. `LLM_BASE_URL` and `LLM_MODEL` are initial
defaults; saved settings take precedence. Local Ollama endpoints can run without
an API key. Model reviews send relevant requirements and verified facts to the
configured provider.

All model calls use Vercel AI SDK (`ai`) with its OpenAI-compatible provider.
The shared runtime reads encrypted settings at call time, requests JSON output,
validates each workflow's Zod schema, enforces a timeout, and retries a transient
failure once. It calls your configured endpoint directly; it does not require
Vercel hosting or an AI Gateway account.

**Runs** now shows each workflow and its steps, including separate running,
succeeded or failed AI requests with model, token counts, request attempts and
latency. Document fallback messages explain why output was rejected or why a
request failed. Prompts, provider response bodies and API keys are not shown in
the run history. Refresh the page to see current steps.

DeepSeek's JSON editing tasks use non-thinking mode by default so the bounded
output budget is available for the document. Future workflows can explicitly
request low/high reasoning through the shared runtime. Failed structured-output
requests retain available token counts and finish reason, including output-limit
failures.

### AI requirement filtering

Analysis classifies posting items before matching them to your profile. With a
configured model, AI distinguishes candidate qualifications and duties from
interview stages, application instructions, benefits and company background.
The classifier sees the posting only, so it cannot hide a genuine requirement
because your profile does not meet it. A separate AI pass can still review
uncertain evidence matches afterward.

Excluded lines are listed under **Excluded posting details** with their reasons.
They do not count toward skill gaps, fit scores, or keyword coverage. Actual HR,
sales and recruitment duties remain eligible requirements. If AI is unavailable
or returns invalid output, rules provide a fallback and the analysis shows which
items were reviewed. Re-run existing analyses to apply the filter.

### AI-assisted documents

With a configured model, generating a CV also tailors the selection and wording
of existing verified bullets to the job. Cover-letter generation drafts an
opening, evidence highlights, a source-linked company motivation when evidence
is available, and a closing. Prompts use relevant verified evidence, job text and
cached company research; contact details and photos are not included.

Each AI rewrite retains its original wording and fact links. The editors show
comparisons and allow editing; CV bullets can be restored to their original
wording. AI drafts require your review before the quality checks mark them ready.
Review matters: identifier, number and skill checks cannot establish every
sentence's meaning or the truth of personal motivation. Regenerating preserves
motivation you already wrote or reviewed. Missing evidence leaves the original
placeholder; a failed/invalid model response keeps the standard grounded draft.

Existing document versions are unchanged. Use **Regenerate** on a CV or **Redraft**
on a letter to create an AI-assisted revision; prior revisions remain restorable.

### Integrations

Everything lives on the **Integrations** page and runs on your machine.

- **Email**: connect any mailbox over IMAP/SMTP with an app password (presets for Gmail, Outlook, iCloud, Fastmail, Yahoo, Proton Bridge), or sign in with Google or Microsoft through an app you register once. Naruvi checks it every 5 minutes, keeps only emails about your applications, classifies replies (rejection, interview, offer, request for information) and suggests the change; nothing moves without your click. Send applications, follow-ups and thank-you notes with your CV and letter attached. Optional per-application reply addresses (`you+nrv-…@` or your own domain via Cloudflare Email Routing) make every reply match.
- **Job alerts**: postings in LinkedIn, Indeed, Welcome to the Jungle, Glassdoor and similar alert emails become job leads on the Jobs page.
- **Calendar**: a private iCalendar link of your next steps.
- **Notifications**: push to your phone or desktop through ntfy (ntfy.sh or self-hosted).
- **Browser extension**: `extension/` sends the posting you're viewing (including pages behind a login) to Naruvi. See `extension/README.md`.
- **API and MCP**: `/api/v1` with API keys (see `docs/API.md`), and `mcp/naruvi-mcp.mjs` (`npm run mcp`) for Claude and other MCP clients.
- **Spreadsheets**: export all applications as CSV.

Background tasks start with the app; set `NARUVI_BACKGROUND=off` to disable them and `NARUVI_URL` for links in notifications.

### Existing installations

Naruvi was previously called CareerBuddy. The new Compose project and database
defaults are `naruvi`. Existing databases and uploaded assets are not renamed or
moved automatically. To reuse the previous volumes and database credentials,
create a `.env` file for Docker Compose with your existing values:

```dotenv
COMPOSE_PROJECT_NAME=careerbuddy
POSTGRES_USER=careerbuddy
POSTGRES_PASSWORD=careerbuddy
POSTGRES_DB=careerbuddy
```

These are the previous defaults; use your actual project name and credentials
if you customized them. Keep your existing `DATABASE_URL` in `.env.local` for
local development. Do not remove existing volumes. The UI, PDFs, and new JSON
exports use the Naruvi name regardless of the database's internal name.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:browser
npm run test:settings
npm run build
```

See [the architecture](docs/ARCHITECTURE.md) and
[document generation decisions](docs/adr/0001-cv-rendering-and-generation.md)
for implementation details.

`test:settings` uses a disposable PostgreSQL schema and a local fixture model
endpoint to verify encrypted storage and live configuration changes. It does not
write the app's actual model settings.
