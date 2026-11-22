# Naruvi MCP server

Naruvi speaks the [Model Context Protocol](https://modelcontextprotocol.io), so an AI client such as Claude Code,
Claude Desktop, Codex, Cursor or VS Code can work with your job search: read your profile, work history and
skills, explain the fit for a job requirement by requirement, tailor a CV, draft an email, and keep applications up to date.

Everything stays on your Naruvi. The client gets only what its tools return, and only with an API key you created.

## Quick start

1. In Naruvi, open **Integrations → API & browser extension** and create a key. It starts with `nrv_` and is shown once.
2. Put it in your shell: `export NARUVI_API_KEY=nrv_…` (or paste it into the client config where noted).
3. Print the setup for your client, or add it to Claude Code directly:

```bash
npm run mcp:setup -- claude-code --install
```

```bash
npm run mcp:setup -- codex
```

`npm run mcp:setup` with no client prints every config below, filled in with your Naruvi URL and this checkout's path.
Options: `--url https://naruvi.example.org`, `--stdio` (use the local script instead of HTTP), `--app` (the visual MCP App).

## Transports

| Transport | Endpoint | Use it for |
|---|---|---|
| Streamable HTTP | `<NARUVI_URL>/api/v1/mcp` | Clients that support remote servers with a header: Claude Code, Codex, Cursor, VS Code |
| stdio | `node mcp/naruvi-mcp.mjs` | Clients that only start local programs (Claude Desktop), or when you prefer it |

Both serve the same tools, resources and prompts: the stdio script only forwards each message to the HTTP endpoint.
It reads `NARUVI_URL`, `NARUVI_API_KEY` and, optionally, `NARUVI_MCP_URL` (another endpoint that takes the same key,
such as the [MCP App](#mcp-app-visual-views)) and `NARUVI_TIMEOUT_MS` (default 10 minutes).
The script needs Node.js 20+ and this checkout's `node_modules` (`npm install`).

The HTTP endpoint is stateless and answers with JSON (no sessions, no server-sent event stream).

## Authentication

- Every request needs `Authorization: Bearer nrv_…`. A missing or revoked key gets HTTP 401.
- Naruvi has one owner, so a key acts for that owner and sees only their data. Revoke a key on the Integrations page to cut access at once.
- The `/api/v1` rate limits apply (120 requests a minute per key). Keys are stored as SHA-256 fingerprints only.
- OAuth is not supported yet, so connectors that require OAuth (claude.ai web, ChatGPT) cannot connect directly. Use a client that accepts a header, or the stdio script.
- Reaching Naruvi from another machine? Serve it over HTTPS (see [SELF-HOSTING.md](SELF-HOSTING.md)); the key travels in a header on every request.

## Clients

Replace `http://localhost:3000` with your Naruvi address and `/path/to/naruvi` with this checkout.

### Claude Code

```bash
claude mcp add --scope user --transport http naruvi http://localhost:3000/api/v1/mcp --header 'Authorization: Bearer ${NARUVI_API_KEY}'
```

Claude Code expands `${NARUVI_API_KEY}` from your environment when it connects. For one project, put the same
server in that project's `.mcp.json`:

```json
{
  "mcpServers": {
    "naruvi": {
      "type": "http",
      "url": "http://localhost:3000/api/v1/mcp",
      "headers": { "Authorization": "Bearer ${NARUVI_API_KEY}" }
    }
  }
}
```

### Claude Desktop

Settings → Developer → **Edit Config**, add to `claude_desktop_config.json`, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "naruvi": {
      "command": "node",
      "args": ["/path/to/naruvi/mcp/naruvi-mcp.mjs"],
      "env": { "NARUVI_URL": "http://localhost:3000", "NARUVI_API_KEY": "nrv_…" }
    }
  }
}
```

### Codex

Add to `~/.codex/config.toml`. Generating a CV can take a few minutes, so raise the tool timeout:

```toml
[mcp_servers.naruvi]
url = "http://localhost:3000/api/v1/mcp"
bearer_token_env_var = "NARUVI_API_KEY"
tool_timeout_sec = 600
```

Or over stdio:

```toml
[mcp_servers.naruvi]
command = "node"
args = ["/path/to/naruvi/mcp/naruvi-mcp.mjs"]
env_vars = ["NARUVI_API_KEY"]
tool_timeout_sec = 600

[mcp_servers.naruvi.env]
NARUVI_URL = "http://localhost:3000"
```

### Cursor

Add to `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "naruvi": {
      "url": "http://localhost:3000/api/v1/mcp",
      "headers": { "Authorization": "Bearer ${env:NARUVI_API_KEY}" }
    }
  }
}
```

### VS Code (Copilot agent mode)

Add to `.vscode/mcp.json`. VS Code asks for the key once and stores it as a secret:

```json
{
  "inputs": [{ "type": "promptString", "id": "naruvi-key", "description": "Naruvi API key (nrv_…)", "password": true }],
  "servers": {
    "naruvi": {
      "type": "http",
      "url": "http://localhost:3000/api/v1/mcp",
      "headers": { "Authorization": "Bearer ${input:naruvi-key}" }
    }
  }
}
```

### Other clients

Any MCP client that supports Streamable HTTP with a custom header can use the endpoint above. A client that only
starts local programs can run `node mcp/naruvi-mcp.mjs` with `NARUVI_URL` and `NARUVI_API_KEY` set.

## What the client can do

The client reads freely. Tools that change data or run Naruvi's AI say so in their description and are marked
`readOnlyHint: false`, so clients ask you before running them. Drafting an email never sends it.

### Tools

| Tool | What it does |
|---|---|
| `naruvi_attention` | New replies, due or overdue next steps, documents ready to send, quiet applications, upcoming steps |
| `naruvi_list_applications` | Applications with stage, fit (0–100) and next step; `show`, `q`, `sort=fit` |
| `naruvi_get_application` | One application: fit summary, next step, notes, stage history and emails |
| `naruvi_get_fit_analysis` | Each requirement with status (`met`, `partial`, `gap`, `judgement`), how strongly it is backed, covered and missing terms, and the evidence: each matching fact and the experience, project or education it comes from. Also must-have gaps, keywords and the entries a CV should lead with. Filter with `status` |
| `naruvi_search_jobs` / `naruvi_get_job` | Saved postings, and one posting's full text |
| `naruvi_get_profile` | Name, contact details, headlines and summaries per language, links, availability, job search goals, entry counts |
| `naruvi_list_profile_entries` | Work history (`kind: experience`), education, projects, skills, certifications, languages, achievements, events: dates, organization, skills, NDA flag, do-not-claim rules and facts |
| `naruvi_get_profile_entry` | One entry in full |
| `naruvi_list_documents` | Generated CVs and cover letters per application and language |
| `naruvi_get_cv` | A CV as Markdown, with its positioning, quality score and keyword coverage |
| `naruvi_get_cover_letter` | A cover letter as plain text |
| `naruvi_get_cv_style` | The template, design, accent and photo setting new documents start from |
| `naruvi_list_contacts` | Recruiters, hiring managers and referrals |
| `naruvi_update_application` ✎ | Stage, next step / follow-up and its due date, archive or restore |
| `naruvi_set_application_notes` ✎ | Append to or replace the notes on an application |
| `naruvi_run_fit_analysis` ✎ AI | Analyze a saved job, or refresh an application's analysis |
| `naruvi_generate_cv` ✎ AI | Draft the tailored CV (`pages`, `tone`, `focus`) and return it |
| `naruvi_revise_cv` ✎ AI | Change a CV from a request, checked against verified facts |
| `naruvi_generate_cover_letter` ✎ AI | Draft the cover letter |
| `naruvi_draft_email` AI | Reply, follow-up, thank-you or application email from the real thread. Returns a draft; you send it from Naruvi |
| `naruvi_save_job_lead` ✎ | Add a posting link to Job leads for review |
| `naruvi_add_job` ✎ | Read a posting from a link or text, save it and start tracking it |

✎ changes data · AI runs the language model configured in Naruvi (fit analysis and documents can take a minute or two).

### Resources

| URI | Content |
|---|---|
| `naruvi://profile` | The profile (JSON) |
| `naruvi://profile/entries` | All active entries with their facts (JSON) |
| `naruvi://cv-style` | The default CV style (JSON) |
| `naruvi://applications/{id}/analysis` | One application's fit analysis (JSON) |
| `naruvi://applications/{id}/cv/{language}` | One application's CV (Markdown) |

### Prompts

| Prompt | Arguments | Does |
|---|---|---|
| `tailor_cv` | `applicationId`, `focus` | Reviews the fit, then proposes a CV brief or revisions |
| `prepare_interview` | `applicationId` | Likely questions, stories from verified facts, honest answers to gaps |
| `follow_up_email` | `applicationId`, `instructions` | Reads the thread and drafts a follow-up |
| `weekly_review` | none | Replies waiting, overdue steps, quiet applications, best next moves |

## MCP App (visual views)

`mcp-app/` is a separate [Skybridge](https://docs.skybridge.tech) app that adds interactive views for clients that
render MCP Apps (Claude, ChatGPT, VS Code and others): an application board, the fit analysis with its evidence, and
a CV preview. Its tools are `naruvi_show_applications`, `naruvi_show_fit_analysis` and `naruvi_show_cv`. Connect it
next to the main server: the views show things, and the main server's tools change them.

It keeps no key of its own. Each request must carry your `nrv_` key, which the app checks with Naruvi and forwards to
`/api/v1/mcp`, so access, scoping and rate limits stay Naruvi's. Skybridge's usage telemetry is turned off in its scripts.

```bash
cd mcp-app
npm install
cp .env.template .env    # NARUVI_URL, if Naruvi is not on http://localhost:3000
npm run build
npm start                # http://localhost:3200/mcp
```

Then `npm run mcp:setup -- <client> --app` prints the client config, the same as above with
`http://localhost:3200/mcp`. For Claude Desktop, the stdio script reaches it with `NARUVI_MCP_URL=http://localhost:3200/mcp`.
`npm run dev` starts it with hot reload and Skybridge's local preview at http://localhost:3200. Node.js 24+ is required.

## Safety notes for agents

The server's instructions tell clients that posting, email and company text is third-party data, never instructions;
that only verified profile facts count as evidence; and that do-not-claim rules and NDA flags must be respected.
CV and letter generation checks every line against verified facts, as it does in the app.
