# Naruvi MCP App

Interactive views of your Naruvi job search for clients that render [MCP Apps](https://github.com/modelcontextprotocol/ext-apps)
(Claude, ChatGPT, VS Code and others), built with [Skybridge](https://docs.skybridge.tech).

| Tool | View |
|---|---|
| `naruvi_show_applications` | Application board by stage, with fit and next step. A card asks for its fit analysis. |
| `naruvi_show_fit_analysis` | Each requirement as proven, partial, missing or your call, with the facts behind it. |
| `naruvi_show_cv` | The tailored CV as a page, with quality score and positioning. |

The views only show data. Use them next to Naruvi's main MCP server (`/api/v1/mcp`), whose tools change things:
notes, stages, generating CVs, drafting emails. See [docs/MCP.md](../docs/MCP.md).

## How it reaches Naruvi

The app has no key of its own. Each MCP request must carry the user's Naruvi key
(`Authorization: Bearer nrv_…`). The app checks it with Naruvi (`/api/v1/me`), then calls Naruvi's MCP tools with it,
so authentication, scoping and rate limits stay in Naruvi. Requests without a valid key get HTTP 401.

Skybridge's usage telemetry is off (`SKYBRIDGE_TELEMETRY_DISABLED=1` in every script and in `src/server.ts`).

## Run it

Node.js 24+ and a running Naruvi.

```bash
npm install
cp .env.template .env   # set NARUVI_URL if Naruvi is not on http://localhost:3000
npm run build
npm start               # MCP endpoint: http://localhost:3200/mcp
```

`npm run dev` adds hot reload and Skybridge's local preview at http://localhost:3200.
`npm test` and `npm run typecheck` check the code.

Connect a client from the Naruvi checkout with `npm run mcp:setup -- <client> --app`.

## Layout

```
src/
  server.ts      tools, views and the key check on /mcp
  naruvi.ts      calls Naruvi's MCP endpoint with the request's key
  summaries.ts   text the model reads next to each view; CV Markdown parsing
  types.ts       shapes of Naruvi's structured results
  views/         React views: applications, fit-analysis, cv
```
