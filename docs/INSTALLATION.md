# Install Naruvi

One owner, your own machine or server. The installer checks your machine, asks a few questions, downloads the signed release image and starts it with Docker Compose, and finishes with a private link to create your owner account. Afterwards, the `naruvi` command manages everything.

Want to try it without touching your machine? Use the [container sandbox](INSTALLER-SANDBOX.md).

## Requirements

Linux, macOS (Docker Desktop) or Windows through WSL2. Docker with Compose v2, Git, curl and OpenSSL. About 6 GB of disk. Building from source (branches, `--build`) also needs about 2 GB of memory. Node.js is not needed on the host.

The installer reads `/etc/os-release` and recognises the main Linux families, then fixes what is missing with that system's own tools. It always asks first. Non-interactive installs opt in with flags.

| Family | Examples | Missing tools | Docker |
| --- | --- | --- | --- |
| Debian | Debian, Ubuntu, Raspberry Pi OS, Mint, Pop!_OS | `apt-get` | Docker's script on Debian, Ubuntu and Raspberry Pi OS; `docker.io` elsewhere |
| Fedora / RHEL | Fedora, RHEL, CentOS Stream, Rocky, AlmaLinux, Oracle Linux | `dnf` / `yum` | Docker's script on Fedora, RHEL and CentOS; Docker's CentOS repository on the rebuilds |
| Cloud | Amazon Linux 2 and 2023, Azure Linux | `dnf`, `yum`, `tdnf` | The distribution's `docker` / `moby` packages |
| SUSE | openSUSE Leap and Tumbleweed, SLES | `zypper` | `docker`, `docker-compose` |
| Others | Arch, Manjaro, Alpine, Void | `pacman`, `apk`, `xbps` | The distribution's packages |
| macOS | | Homebrew | Docker Desktop through Homebrew |

- **Missing Git, curl or OpenSSL** are installed with the package manager (`--install-deps`).
- **Missing Docker** is installed and started at boot, using systemd, OpenRC or runit (`--install-docker`). If `docker` is Podman's look-alike, the installer says so, because Naruvi needs Docker Engine.
- **Missing Compose v2 or Buildx plugins** (old installs, distribution packages, Amazon Linux) are fetched from Docker's GitHub releases and checked against their published SHA-256 checksums (also `--install-docker`).
- **Adding you to the `docker` group** is offered, and the new group is used for the rest of the run.
- **Small servers** building from source without swap are offered a 2 GB swap file (`--swap`).
- **Fresh cloud servers:** the installer waits for cloud-init to finish, and for an APT lock held by automatic updates, before installing packages.

It also checks internet access to GitHub and the system clock, because a wrong clock breaks HTTPS and signature checks. It shows the machine it found, for example `Ubuntu 24.04 LTS · x86_64 · AWS EC2`. NixOS and image-based systems (Flatcar, Fedora CoreOS, Container-Optimized OS) get instructions instead of package installs. Snap's Docker can't read hidden folders, so the default directory becomes `~/naruvi`.

## Run the installer

```bash
curl -fsSLo install-naruvi.sh https://raw.githubusercontent.com/Eljakani/naruvi-app/main/install.sh
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

Add `--install-deps`, `--install-docker`, `--firewall` or `--swap` to let an unattended install fix the matching problem. Other options: `--dir PATH` (default `~/.local/share/naruvi`), `--ref TAG` (default: the latest release; a branch such as `main` is built from source), `--build` (build the image on this machine instead of downloading it), `--bind ADDRESS` for proxy mode. See `bash install.sh --help`.

## Choose where Naruvi runs

| Mode | Use it for | Address | What is exposed |
| --- | --- | --- | --- |
| **Local** | Your own computer | `http://localhost:<port>` | App on `127.0.0.1` only |
| **Hosted** | A VPS with a domain | `https://<domain>` | Ports 80 and 443 through the built-in Caddy gateway, automatic certificates |
| **Behind your proxy** | Coolify, Traefik, nginx, Caddy or a tunnel you already run | `https://<domain>` | App port on `127.0.0.1` (default) or an address you choose |

**Local.** Nothing leaves your machine. You still sign in: other programs on the computer can reach the port. Don't forward the port to the internet; switch to Hosted instead.

**Hosted.** Point the domain's A record at the server (and AAAA only if the server has IPv6; a stale AAAA blocks certificates). Open inbound TCP 80 and 443 in your provider's firewall, if it has one. On AWS, Google Cloud, Azure, Oracle, DigitalOcean, Hetzner, Linode, Vultr and similar clouds, the installer recognises the provider and names the exact place, such as the security group of the instance.

The installer checks DNS the way Let's Encrypt will. It asks public DNS (over HTTPS) instead of this machine's possibly cached resolver, and compares the answer with the server's public address. It catches:

- a missing record
- a record pointing elsewhere
- a stale AAAA record
- a Cloudflare-proxied record
- CAA records that don't allow Let's Encrypt
- a home server behind a router, where it says which local address to forward ports 80 and 443 to

When something is off, it prints the exact records to create, with the server's addresses filled in. Then you can check again, wait (it rechecks every 15 seconds), use another domain, or continue anyway. If DNS does not point at the server yet, the install still finishes: Naruvi keeps asking for the certificate, and the address starts working once the record is right. Non-interactive installs warn and continue.

When the server's own firewall (ufw or firewalld) is on, the installer offers to open the two ports there. It asks for sudo right after you choose Hosted, and opens them once you confirm the install. Non-interactive installs opt in with `--yes --firewall`. A firewall that is off stays off. With rootless Docker, it offers to let Docker use ports 80 and 443.

If port 80 or 443 is already taken, for example by Coolify, Traefik or nginx, the installer names the program. Interactively, it offers to switch to *Behind your proxy* so that program can stay. Caddy issues and renews certificates and redirects HTTP to HTTPS. The app and database publish no host ports.

After starting, the installer waits for the HTTPS address to answer. If Let's Encrypt saw DNS from before you fixed it, the installer asks for the certificate again straight away instead of waiting out the back-off. If the address still doesn't answer, you can keep waiting, ask for the certificate again (a few times at most, because Let's Encrypt limits failed tries), or finish and check later with `naruvi doctor`.

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
| `naruvi start` / `stop` / `restart` | Control the services; `start` applies database migrations first and confirms them |
| `naruvi doctor` | Check settings, services, migrations, the address and DNS, with the fix for each problem |
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
4. **Gets the new image while the current version keeps running.** It downloads the release image and checks its signature (below), or builds from source on a source install. A failed download, check or build changes nothing.
5. **Migrates and restarts**, then waits for the app to answer.
6. **Rolls back on failure.** If migrations fail or the app does not start, it restores the database from step 3 and puts the previous images back.

### Release images

Each release tag is built once by the [release workflow](../.github/workflows/release.yml) for `linux/amd64` and `linux/arm64` and published as `ghcr.io/eljakani/naruvi-app:X.Y.Z`. The workflow signs it keylessly with Sigstore, so the signature records which workflow, tag and commit produced it. Before using an image, the installer and `naruvi update` check with a pinned `cosign` container that it was signed by that workflow for that release tag, at the commit the signed tag points to. Then they pin it by digest in `.env` (`NARUVI_IMAGE`). An image that fails the check is not used. Servers need nothing but Docker for this.

Installing a branch, using a local copy, passing `--build`, or a processor type without a published image builds from `./source` instead (`build.yaml` in `COMPOSE_FILE`), the same way as before. Installations from before published images keep building. `naruvi use-images` moves one to the published image of the version it runs, keeping the previous `compose.yaml` and `.env` beside the new ones.

Base images are pinned by digest and npm packages by `package-lock.json`, so a release builds the same way everywhere. `naruvi update v1.2.0` installs a specific release; `naruvi update --ref main --allow-unsigned` follows a branch, without verification, on installations that build from source. Downgrades are refused: restore a backup instead. The Settings check asks GitHub for the latest release at most twice a day; set `NARUVI_UPDATE_CHECK=off` in `.env` to turn it off.

Installations from before signed releases get the new `naruvi` command from their own `source` folder once: `cp source/deploy/naruvi naruvi` after a `git -C source pull`, then `naruvi update`. Until a release key is in `trusted-signers`, updates need `--allow-unsigned`.

Running the installer again on a finished installation changes nothing: it says whether Naruvi is running and points to `naruvi`. An installation that was interrupted or failed (a closed terminal, a build error) is picked up where it stopped, with the same settings and secrets, when you run the installer again with the same directory. It refuses any other non-empty directory, and it stops when a database volume from an earlier installation (`naruvi_db-data`) is still on the Docker engine, so secrets are never regenerated for an existing database. One installer-managed stack runs per Docker engine (project `naruvi`).

## When something is wrong

Start with `naruvi doctor`. It checks each layer and prints the next step.

| What you see | What to do |
| --- | --- |
| Docker missing, stopped, or `permission denied` | The installer offers to install or start it on Linux. Otherwise start Docker Desktop or `sudo systemctl start docker`; for permissions, `sudo usermod -aG docker $USER` and log in again. |
| `Docker Compose v2 plugin missing` | Run the installer again and accept the offer to add it, or install the `docker-compose-plugin` package. The old `docker-compose` v1 command is not enough. |
| `github.com can't be reached` | Check the network or DNS (`/etc/resolv.conf`). Behind a proxy, set `HTTPS_PROXY`, and configure Docker's proxy too. |
| `Clock … minutes off` | Turn on time synchronisation (`sudo timedatectl set-ntp true`); certificates and signatures fail otherwise. |
| `Port N is already in use` | Local and proxy: choose another port. Hosted: stop the web server on 80/443, or install with `--mode proxy` behind it. |
| A step failed during the install | Network steps (downloading the source, packages, the image build, starting the services) retry by themselves. Starting is retried once with fresh containers; data is kept. The installer then names known causes: full disk, package lock, Docker Hub rate limit, DNS, certificates or clock, out of memory, a taken port. Interactively, it offers to try the step again, show more of the log, or stop. |
| The install stopped half-way | Run the installer again with the same directory. |
| `A Naruvi database from an earlier installation` | Put that installation's folder (or its `.env`) back and run its `naruvi start`. Only to start over: `docker volume rm naruvi_db-data naruvi_assets`, which deletes that data. |
| `Setting problem in .env` | `SETTINGS_ENCRYPTION_KEY` (64 hex characters) and `POSTGRES_PASSWORD` must be the original values: copy them back from `backups/<timestamp>/env`. `NARUVI_URL` must be the exact address you open, such as `https://careers.example.com`, with no trailing slash. The database address is built from `POSTGRES_PASSWORD`; a `DATABASE_URL` line in `.env` is not used. |
| `Database migrations failed` | The app is not started on an out-of-date database. The message includes the database's own error; after an update, `naruvi restore backups/<timestamp>` returns to the backup made before it. |
| Hosted: the address does not answer | The app is running; the path to it is not. Point the A record at the server (remove a stale AAAA), open TCP 80 and 443 in the server's firewall and in your provider's, then `naruvi logs gateway`. The certificate follows by itself. |
| Setup link expired, lost, or replaced by a restart | `naruvi setup-link` prints a new one while no owner exists. Afterwards it says so; use `naruvi reset-password` instead. |

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

`bash -n install.sh deploy/naruvi` and `python3 tests/installer/test_install.py` exercise every mode in a pseudo-terminal with mocked Docker, Git and curl. They also cover:

- the DNS record hint
- domains and ports that are refused and asked again
- Docker installs routed per distribution (Rocky, Alpine, Arch)
- missing tools installed through the package manager, or explained when declined
- file permissions, reruns and resuming an interrupted install
- a leftover database volume, unapplied migrations and broken `.env` values
- non-interactive use They don't deploy real containers or request certificates.

## Browser authentication flow

Signed-in owners visiting `/login` are redirected to the workspace (or a validated internal `next` page). The login page also checks its session server-side. Signed-out visits to protected pages retain their destination through sign-in; external URLs, API routes and auth routes cannot be used as return destinations.

Expired or reset sessions return to login with a session-ended message. Active tabs recheck when brought to the foreground and every minute while visible; those checks do not renew inactivity expiry. Tabs restored from the browser's back/forward cache reload to revalidate access. Network outages do not cause automatic sign-out. A previously rendered page can remain visible until the next session check, but protected server requests recheck authentication immediately.

Old setup links cannot reopen owner registration. Signed-in owners go to the workspace; signed-out users see that setup is complete and are offered login. Invalid or expired first-run links clear the setup cookie and explain how to obtain a fresh link. Logout is POST-only and clears both session and setup cookies. Logging out or resetting a password revokes the database session; signing in from another tab redirects an open login screen on its next foreground/session check.
