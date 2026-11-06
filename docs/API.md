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
