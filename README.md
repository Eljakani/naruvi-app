<p align="center">
  <img src="docs/assets/naruvi-banner.png" alt="Naruvi — Your career. Your workspace. A self-hosted, AI-assisted career workspace with Naruvi the otter." width="100%" />
</p>

<p align="center">
  <strong>A calmer way to find your next role.</strong><br />
  Save opportunities, understand your fit, tailor your documents, and keep every conversation in one place.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache_2.0-a95832?style=flat-square" /></a>
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-your_workspace-6c7864?style=flat-square" />
  <img alt="Node.js 24" src="https://img.shields.io/badge/Node.js-24-353535?style=flat-square" />
  <a href="CONTRIBUTING.md"><img alt="Contributions welcome" src="https://img.shields.io/badge/contributions-welcome-a95832?style=flat-square" /></a>
</p>

<p align="center">
  <a href="#what-you-can-do">Features</a> ·
  <a href="#get-started">Get started</a> ·
  <a href="docs/SELF-HOSTING.md">Self-hosting guide</a> ·
  <a href="CONTRIBUTING.md">Contribute</a> ·
  <a href="https://github.com/Eljakani/naruvi/issues">Issues</a>
</p>

## Meet Naruvi

Job searching leaves a trail of tabs, documents, spreadsheets, and emails. Naruvi brings that work together in a workspace you run yourself, with an otter companion to help you take the next step.

Start with your experience and verified facts. Save a role, see where your evidence fits, then prepare a CV, cover letter, or email for review. Track the application through interviews and offers without losing the conversation.

**AI is optional.** Connect your own model when you want help with analysis and writing. You control the drafts, the credentials, and the next action.

> Naruvi is under active development. Back up your database, uploaded assets, and encryption key before upgrading. The default setup is intended for a trusted local environment.

## What you can do

| From opportunity to offer | In your workspace |
| :--- | :--- |
| **Capture opportunities** | Import a job URL, paste a posting, or save a page with the browser extension. Turn job-alert emails into leads. |
| **Check your fit** | Compare requirements with verified profile evidence, inspect gaps, and distinguish real qualifications from benefits or interview instructions. |
| **Tell your story** | Tailor CVs and cover letters from your existing facts. Review AI rewrites, restore earlier wording, and export documents. |
| **Keep applications moving** | Track stages, next steps, interviews, and offers. See what needs attention on the dashboard and export applications as CSV. |
| **Handle the conversation** | Match application emails using company names, domains, roles, recruiters, and thread history. Draft replies and follow-ups in context. |
| **Plan the next step** | Save interview appointments or tentative holds, download `.ics` events, and subscribe to your private calendar feed. |
| **Build relationships** | Manage recruiters and contacts, import CSV/Excel or LinkedIn connections, and start spontaneous applications. |
| **Ask Naruvi** | Work with an assistant that understands your workspace and presents proposed actions for review. |

### Your model, your workflow

- **Bring your model:** native Anthropic support and OpenAI-compatible endpoints, including local Ollama setups.
- **Evidence before eloquence:** verified facts and document checks help keep drafts grounded; you still review every claim.
- **A visible process:** inspect AI workflow status, attempts, latency, and available token usage in Runs.
- **Connect what you use:** IMAP/SMTP, Google or Microsoft OAuth with your registered app, calendar feeds, ntfy, a browser extension, REST API, and MCP.

Mailbox authentication depends on the provider. Some accounts require OAuth or provider-specific app passwords; IMAP/SMTP access must be enabled. See the [integration details](docs/SELF-HOSTING.md#integrations).

## Get started

### Interactive installer

Run `bash install.sh` for a guided install: **Local** (this computer), **Hosted** (your domain with automatic HTTPS) or **Behind your proxy** (Coolify, Traefik, nginx). It ends with a private owner setup link, and the `naruvi` command handles status, logs, backups and updates. Requires Docker Compose, Git, and OpenSSL. See the [installation guide](docs/INSTALLATION.md) for prerequisites and authentication details.

### Docker

Requires **Git, Node.js 24, and Docker Compose**. Node is used to generate the local encryption key; the app runs in containers.

```bash
git clone https://github.com/Eljakani/naruvi.git
cd naruvi
npm ci
npm run settings:key -- .env
docker compose --profile full up --build -d
```

Open **[localhost:3000](http://localhost:3000)** and follow the setup guide. Compose starts PostgreSQL, applies migrations, and launches the app and worker. Data and uploaded assets persist in named volumes.

### Local development

```bash
npm ci
npm run browser:install
cp .env.example .env.local
npm run settings:key
npm run db:up
npm run db:migrate
npm run dev
```

Run `npm run worker` in a second terminal for queued background jobs. Configure your model in **Settings → Language model**.

For browser dependencies, credentials, backups, and existing installations, read the [self-hosting guide](docs/SELF-HOSTING.md).

## Data and control

Your workspace is stored in your own PostgreSQL database and asset storage. Saved model credentials are encrypted with AES-256-GCM; keep `SETTINGS_ENCRYPTION_KEY` backed up separately and shared between the app and worker.

Self-hosting does not make external services offline: configured model providers receive the context needed for the requested workflow, and connected email or notification services receive their relevant data. Local models can reduce dependence on hosted AI services.

The default Compose ports bind to localhost. The app requires an owner account initialized through a private terminal link. Use HTTPS and appropriate network protections for internet access. See [security guidance](SECURITY.md).

## Built with

**Next.js · React · TypeScript · PostgreSQL / pgvector · Drizzle · Vercel AI SDK · pg-boss · Tailwind CSS**

| Documentation | What you’ll find |
| :--- | :--- |
| [Self-hosting](docs/SELF-HOSTING.md) | Installation, model configuration, integrations, and migration notes |
| [Architecture](docs/ARCHITECTURE.md) | Design principles and implementation context |
| [REST API](docs/API.md) | API keys and programmatic access |
| [Browser extension](extension/README.md) | Save postings and contacts from your browser |
| [Document generation](docs/adr/0001-cv-rendering-and-generation.md) | Rendering and generation decisions |
| [Naruvi’s voice](docs/NARUVI-VOICE.md) | The companion’s tone and product identity |

## Make Naruvi better

Bug reports, documentation fixes, accessibility improvements, integration work, and tests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), or [open an issue](https://github.com/Eljakani/naruvi/issues/new/choose) with a focused problem or proposal.

```bash
npm run typecheck
npm run lint
npm test
```

Please use synthetic profiles and sanitized emails in reports and fixtures. Never share real credentials, private CVs, or mailbox exports.

## License and credits

Naruvi is licensed under [Apache License 2.0](LICENSE). Third-party components and assets retain their own licenses, including [Rare UI](licenses/rare-ui.txt) and [provider logos](public/provider-logos/LICENSE.txt).

The Naruvi otter is the project’s visual companion. The README banner uses the app’s **Geist** typeface and existing logo; its background was generated with AI. [Asset notes](docs/assets/README.md).
