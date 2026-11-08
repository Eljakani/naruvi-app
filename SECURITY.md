# Security

Naruvi handles personal career data, mailbox access, and model credentials. Run it in a trusted environment. The default Docker configuration binds application and database ports to localhost; do not expose them publicly without appropriate access controls.

Keep the database, uploaded assets, and encryption key backed up. Store the key separately from database backups. Use dedicated service credentials where possible and revoke credentials if an instance is compromised.

## Owner authentication

Naruvi requires owner login. First-run registration is unlocked by a one-hour token printed in app logs and becomes unavailable once an owner exists. Treat setup URLs and logs as sensitive. Password hashes, bootstrap tokens, rate limits and sessions are kept in separate `naruvi_*` database tables outside workspace exports. Use HTTPS with a stable `NARUVI_URL`; do not trust arbitrary forwarded headers for the public origin.

## Reporting a vulnerability

Do not post secrets, private data, or exploit details in a public issue. If GitHub private vulnerability reporting is enabled for this repository, use **Security → Report a vulnerability**. Otherwise, open an issue asking the maintainer for a private reporting channel, without disclosing the vulnerability details.

Include affected versions or commit IDs, reproduction steps using synthetic data, and the potential impact in the private report. There is currently no guaranteed response-time or supported-release policy.

## Authentication controls

- Database-backed global credential limit (10/minute), per-client credential limit (5/minute), per-username limit (10/15 minutes), and setup-link exchange limit (20/minute). Counters are atomic, shared across processes and survive restarts. Successful authentication clears the username counter. Limits return 429 with Retry-After; unauthenticated floods can temporarily block legitimate users on this single-owner instance.
- Client IPs are ignored unless `NARUVI_TRUST_PROXY=on`. The supplied server deployment enables this behind an unpublished app port; Caddy overwrites `X-Naruvi-Client-IP`. Never enable it with a directly reachable app port or an untrusted proxy. Without a trusted gateway all clients share a conservative bucket. Do not trust user-provided X-Forwarded-For.
- Salted scrypt password hashes; at most two simultaneous scrypt computations per process. Missing-account verification performs a dummy derivation. Busy responses return 503 with Retry-After rather than exhausting memory.
- Random session tokens are stored as SHA-256 hashes, with seven-day absolute and 30-minute idle expiry. Successful login rotates the current browser's session. At most ten owner sessions are retained. Logout revokes the session in the database.
- HTTPS uses `__Host-` prefixed Secure/HttpOnly/SameSite=Lax cookies, without a Domain attribute. Local loopback HTTP remains supported. Public deployments require a canonical HTTPS `NARUVI_URL`; forwarded headers cannot choose the origin. Existing HTTPS users must sign in again after the cookie-name upgrade.
- Exact Origin and Fetch Metadata checks on browser mutations, streamed 4 KiB auth body limits, ten-second body-read deadline, duplicate-field rejection, no-store responses, clickjacking and MIME-sniffing protection, and a restricted form/base/object CSP. The CSP intentionally does not impose script-src nonces on Next.js; it is not comprehensive XSS isolation.
- Setup tokens expire after one hour and are consumed atomically. Owner credentials and auth tables are separate from workspace imports/exports. Logs must remain private because first-run setup links are printed there. `naruvi setup-link` / `npm run auth:setup-link` issue a new link and invalidate the previous one; they need host or database access and stop working once an owner exists.

These controls do not replace TLS, host patching, backups, an upstream traffic/connection limit, or an independent security review. Terminal-only password recovery is available through `npm run auth:reset-password`; it requires host/database access and revokes sessions atomically. MFA, self-service password changes, email-based recovery and a security audit are not implemented yet. API and calendar endpoints use their own credentials rather than the browser session. API requests now have independent database-backed global, client and key budgets; calendar-feed throttling remains outside those API budgets.

## API and outbound network hardening

API-key creation/revocation serialize on the settings row. Usage timestamps update only keys still present in the current row; stale snapshots cannot restore revoked keys. A request authorized before revocation may still finish; subsequent requests must authenticate again.

REST API budgets are 300 requests/minute globally, 60/minute per trusted client (one shared bucket without a trusted gateway), and 120/minute per key. Unauthorized attempts count toward client/global budgets. Over-limit responses return 429 and Retry-After. Mutating JSON requests are streamed through a 512 KiB limit and ten-second read deadline before parsing; compressed bodies and non-JSON mutations are rejected. API throttling depends on the database and fails closed if it is unavailable.

Public URL imports resolve DNS once per redirect and pin the actual HTTP(S) connection to a validated public IP. The original hostname remains in the URL for Host and TLS verification. Every redirect is revalidated. Requests use fresh connections, an overall deadline including DNS, and decoded response-size limits, including gzip/deflate/Brotli. Private, mapped-private and transition addresses are rejected. Owner-configured local model/mail endpoints are intentionally separate from public job/logo URL fetching.

Regression commands: `node --conditions=react-server --import tsx scripts/test-api-security.mts` (disposable database schema) and `node --conditions=react-server --import tsx scripts/test-safe-fetch.mts` (intercepted transport; no private network probes).

## Expensive browser workflows and image decoding

Assistant requests have a 16 MiB streamed body cap, a 20,000-character cap per text part, a 256 KiB aggregate non-file conversation cap, a ten-second body-read deadline, and 12 requests/minute. Existing attachment type/count/byte checks remain in place. PDF previews have a 64 KiB JSON cap, the same read deadline, and 30 requests/minute. Each workflow admits at most two concurrent requests per process and uses atomic database admission across instances, including during body intake. The database lease expires after four minutes to recover from crashed processes; local admission remains held until completion. This is workload admission, not a sandbox for arbitrary PDF execution.

Assistant capacity is retained for the response-stream lifetime and released on completion, error or cancellation. Disconnect signals propagate to the model request, which also retains its three-minute timeout and output/step caps. These controls bound request volume and concurrency; they are not a monetary spending quota.

Stored images require known, positive dimensions, at most 16 megapixels and at most 8192 pixels on either edge. Native decoders enforce the pixel cap too. Raster logos are downsized to at most 512×512 before raw RGBA inspection, so the scan does not allocate full-resolution pixel buffers. Excessive or malformed logo inputs are skipped; oversized direct uploads are rejected.

## Mailbox OAuth identity validation

Google/Microsoft mailbox connections verify RS256 ID-token signatures against provider-hosted cached JWKS, issuer, client audience, required subject/issue/expiry claims, maximum token age and a PKCE-bound nonce before storing credentials. Google requires a verified email; Microsoft validates tenant-specific issuer and configured tenant restrictions, including consumer/organization restrictions. Domain-based Microsoft tenants resolve their issuer from the fixed Microsoft discovery host. Tokens cannot choose arbitrary key URLs.

Existing refresh-token connections continue to work; restart any in-progress Google/Microsoft sign-in after updating because older attempts did not request the required nonce. Fixtures use locally signed tokens; live provider sign-in has not been exercised by these tests.

Resource regression command: `node --conditions=react-server --import tsx scripts/test-resource-security.mts` (disposable database schema, local image fixtures). Signed OAuth-token fixtures run with the normal test suite.
