# Naruvi API (v1)

A small JSON API for the browser extension, the MCP server and your own scripts.
Create a key in **Integrations → API & browser extension** and send it on every request:

```
Authorization: Bearer nrv_…
```

Keys are shown once and stored only as SHA-256 fingerprints. Revoke a key to cut access immediately.
Errors are JSON: `{ "error": "…" }` with status 400 (invalid request), 401 (missing or wrong key), 404 or 500.

| Method | Path | What it does |
|---|---|---|
| GET | `/api/v1/me` | Checks the key. |
| GET | `/api/v1/attention` | New replies, things to do, upcoming next steps. |
| GET | `/api/v1/applications?show=active\|closed\|archived\|all&q=…` | Applications with stage, fit and next step. |
| GET | `/api/v1/applications/{id}` | One application, its evidence counts and emails. |
| PATCH | `/api/v1/applications/{id}` | Body: any of `status` (`submitted`, `interviewing`, `offer`, `rejected`, `withdrawn`), `nextStep`, `nextStepDue` (ISO 8601 or `null`), `archived`. |
| GET | `/api/v1/jobs?q=…&sort=newest\|oldest\|fit\|company&page=1` | Saved jobs, 30 per page. |
| POST | `/api/v1/captures` | Body: `url`, optional `title` and `text`. Adds a job lead and returns `{ id, review }`. |

## MCP server

`mcp/naruvi-mcp.mjs` exposes the same API as MCP tools (`naruvi_attention`, `naruvi_list_applications`,
`naruvi_get_application`, `naruvi_update_application`, `naruvi_search_jobs`, `naruvi_save_job_lead`).
Run it with `NARUVI_URL` and `NARUVI_API_KEY` set; the Integrations page shows ready-to-paste configuration.

## Request limits

All `/api/v1` handlers apply shared rate budgets: 300 requests/minute globally, 60/minute per client and 120/minute per API key. Client addresses are trusted only behind the configured Caddy gateway; otherwise callers share one client bucket. Unauthorized attempts count toward global/client budgets. HTTP 429 responses include `Retry-After` in seconds.

POST/PATCH and other mutations require `Content-Type: application/json`, accept at most 512 KiB of streamed request data, and have a ten-second body-read deadline. Compressed request bodies are not accepted. Errors use 413 (too large), 415 (unsupported type/encoding), or 408 (body timeout). Authentication still runs before application handlers. Revocation is atomic; an already-authorized request can finish, but later requests cannot revive the key through usage updates.
