# Install Naruvi

One owner, your own machine or server. The installer checks your machine, asks a few questions, builds Naruvi with Docker Compose, and finishes with a private link to create your owner account. Afterwards, the `naruvi` command manages everything.

Want to try it without touching your machine? Use the [container sandbox](INSTALLER-SANDBOX.md).

## Requirements

Linux, macOS (Docker Desktop) or Windows through WSL2. Docker with Compose v2, Git and OpenSSL. About 6 GB of disk and 2 GB of memory for the first build. Node.js is not needed on the host.

## Run the installer

```bash
curl -fsSLo install-naruvi.sh https://raw.githubusercontent.com/Eljakani/naruvi/main/install.sh
less install-naruvi.sh
bash install-naruvi.sh
```

From a checkout, run `bash install.sh`. Try the screens without installing anything with `--preview`. Use arrow keys (or numbers) to choose. `NO_COLOR=1` gives plain output.

For scripts and provisioning, skip every question:

```bash
bash install.sh --yes --mode local --port 3000
bash install.sh --yes --mode hosted --domain careers.example.com
bash install.sh --yes --mode proxy --domain careers.example.com --port 3000
```

Other options: `--dir PATH` (default `~/.local/share/naruvi`), `--ref TAG` (default `main`; prefer a reviewed release tag), `--bind ADDRESS` for proxy mode. See `bash install.sh --help`.

## Choose where Naruvi runs

| Mode | Use it for | Address | What is exposed |
| --- | --- | --- | --- |
| **Local** | Your own computer | `http://localhost:<port>` | App on `127.0.0.1` only |
| **Hosted** | A VPS with a domain | `https://<domain>` | Ports 80 and 443 through the built-in Caddy gateway, automatic certificates |
| **Behind your proxy** | Coolify, Traefik, nginx, Caddy or a tunnel you already run | `https://<domain>` | App port on `127.0.0.1` (default) or an address you choose |

**Local.** Nothing leaves your machine. You still sign in: other programs on the computer can reach the port. Don't forward the port to the internet; switch to Hosted instead.

**Hosted.** Before installing, point the domain's A record (and AAAA, if the server has IPv6; a stale AAAA blocks certificates) at the server, and open inbound TCP 80 and 443. The installer checks DNS and warns if the ports are busy. Caddy issues and renews certificates and redirects HTTP to HTTPS. The app and database publish no host ports.

**Behind your proxy.** Your proxy must terminate HTTPS for the domain you enter and forward to the app port. `NARUVI_URL` is set to `https://<domain>`, so sign-in only works through that address. Choose *On this host* when the proxy runs directly on the server. Choose *In Docker or on another host* to listen on all interfaces; Docker-published ports bypass host firewalls such as ufw, so restrict the port with your provider's firewall or Docker's `DOCKER-USER` chain. Naruvi does not trust forwarded client IP headers in this mode, so sign-in rate limits apply to all clients together, which is stricter rather than weaker.

## After installing

1. **Create your owner account.** Open the one-time setup link the installer prints (in Local mode it can open your browser). It is valid for one hour. Lost or expired? Run `naruvi setup-link`.
2. **Set up your profile and AI model.** Naruvi walks you through it after the account is created.
3. **Back up.** Run `naruvi backup` once things look right.

## Manage your installation

The installer puts a `naruvi` command in the installation directory and offers to link it into `~/.local/bin`.

| Command | What it does |
| --- | --- |
| `naruvi status` | Services, health and address |
| `naruvi open` | Open Naruvi in the browser |
| `naruvi logs [app\|worker\|db\|gateway]` | Follow logs |
| `naruvi start` / `stop` / `restart` | Control the services |
| `naruvi setup-link` | New private owner setup link (before an owner exists) |
| `naruvi reset-password` | New owner password; signs out every session |
| `naruvi backup` | Database, uploaded files and `.env` into `backups/<timestamp>` |
| `naruvi version` | Installed version, and whether a newer release exists |
| `naruvi update` | Install the newest signed release: verify, back up, migrate, roll back on failure |
| `naruvi restore backups/<timestamp>` | Put a backup's database and files back |
| `naruvi compose …` | Any `docker compose` command for this installation |
| `naruvi uninstall` | Remove containers; keeps data volumes and files |

The installation directory is a normal Compose project: `.env` sets `COMPOSE_PROJECT_NAME=naruvi` and `COMPOSE_FILE`, so plain `docker compose ps` works there too.

`.env` holds the database password and the key that encrypts saved credentials. Keep it private and keep it with your backups: a database backup without it cannot decrypt stored API keys. Never use `docker compose down -v` unless you mean to delete your data. Updates replace the `naruvi` command but not your copied `compose.yaml` or mode file; `naruvi update` tells you when the bundled versions changed so you can review them. Migrations may prevent a simple downgrade; restore a backup instead.

## Updates

Updates run from a terminal; the app only tells you one is available (Settings → Version & updates) and never updates itself.

```bash
naruvi update --check   # is there a newer release?
naruvi update           # install it
```

`naruvi update` picks the newest `vX.Y.Z` release tag and:

1. **Verifies it.** Every release tag is signed. The signature must match a key in `trusted-signers`, copied into the installation directory once at install time. Updates never replace that file, so a tampered download cannot bring its own key. Unsigned or unknown tags are refused.
2. **Shows what changes** (the new changelog entries) and asks before going on.
3. **Backs up** the database, uploaded files and `.env` into `backups/<timestamp>`.
4. **Builds the new version while the current one keeps running.** A failed build changes nothing.
5. **Migrates and restarts**, then waits for the app to answer.
6. **Rolls back on failure.** If migrations fail or the app does not start, it restores the database from step 3 and puts the previous images back.

Base images are pinned by digest and npm packages by `package-lock.json`, so a release builds the same way everywhere. `naruvi update v1.2.0` installs a specific release; `naruvi update --ref main --allow-unsigned` follows a branch, without verification. Downgrades are refused: restore a backup instead. The Settings check asks GitHub for the latest release at most twice a day; set `NARUVI_UPDATE_CHECK=off` in `.env` to turn it off.

Installations from before signed releases get the new `naruvi` command from their own `source` folder once: `cp source/deploy/naruvi naruvi` after a `git -C source pull`, then `naruvi update`. Until a release key is in `trusted-signers`, updates need `--allow-unsigned`.

Running the installer again on an existing installation changes nothing and points to `naruvi`. It also refuses a non-empty directory, so secrets are never regenerated for an existing database. One installer-managed stack runs per Docker engine (project `naruvi`).

## Owner setup and login

On first startup the app prints a private link such as `https://your-domain/auth/setup?token=…`. The installer prints it at the end. Get a new one anytime with `naruvi setup-link` (installed) or `npm run auth:setup-link` (development); each new link replaces the previous one. Open it to unlock the account wizard, choose a username and a 16–128 character password, and continue into the existing profile/model setup.

The link expires in one hour and can create exactly one owner. Restarting the app or running the setup-link command issues a new link while there is no owner. After an account exists, startup never reopens registration. Visiting the link stores it in an HttpOnly cookie and redirects to a clean URL before the form loads. Treat terminal logs and browser history containing this link as secrets. Do not send it to anyone or include it in screenshots.

Passwords use salted scrypt hashing. Sessions are opaque random tokens, stored as hashes in separate database tables, expire after seven days or 30 minutes of inactivity, and are revoked on sign-out. HTTPS deployments use Secure cookies; all cookies are HttpOnly and SameSite=Lax. Database-backed global, per-client and per-username limits return a retry delay on excessive attempts. Server mode uses the private Caddy gateway to identify clients; local mode shares an anonymous-client limit. See [security controls](../SECURITY.md#authentication-controls) for exact budgets and proxy trust requirements.

This is a single-owner account, not multi-user isolation or MFA. REST/MCP endpoints retain their independent API-key authentication, and calendar subscriptions retain private token authentication. Browser OAuth callbacks require the owner session. Do not share your account or private API/feed tokens.

The installer validates Compose and Caddy before starting public listeners. Readiness checks a reachable HTTPS response; sign in and verify the application afterward. A real public-domain deployment still needs correct DNS and reachable ports.

Certificate issuance requires working DNS and internet connectivity. If readiness is not confirmed, inspect logs rather than bypassing certificate errors.

### Forgotten password

```bash
naruvi reset-password            # installed
npm run auth:reset-password      # development checkout
```

It asks twice for a hidden 16–128 character password and never accepts one as an argument. All browser sessions and pending setup links are revoked and lockouts are cleared. API keys, calendar tokens and workspace data are unchanged. There is no email-based recovery; protect host and database access.

## Installer tests

`bash -n install.sh deploy/naruvi` and `python3 tests/installer/test_install.py` exercise every mode in a pseudo-terminal with mocked Docker, Git and curl, plus file permissions, reruns and non-interactive use. They don't deploy real containers or request certificates.

## Browser authentication flow

Signed-in owners visiting `/login` are redirected to the workspace (or a validated internal `next` page). The login page also checks its session server-side. Signed-out visits to protected pages retain their destination through sign-in; external URLs, API routes and auth routes cannot be used as return destinations.

Expired or reset sessions return to login with a session-ended message. Active tabs recheck when brought to the foreground and every minute while visible; those checks do not renew inactivity expiry. Tabs restored from the browser's back/forward cache reload to revalidate access. Network outages do not cause automatic sign-out. A previously rendered page can remain visible until the next session check, but protected server requests recheck authentication immediately.

Old setup links cannot reopen owner registration. Signed-in owners go to the workspace; signed-out users see that setup is complete and are offered login. Invalid or expired first-run links clear the setup cookie and explain how to obtain a fresh link. Logout is POST-only and clears both session and setup cookies. Logging out or resetting a password revokes the database session; signing in from another tab redirects an open login screen on its next foreground/session check.
