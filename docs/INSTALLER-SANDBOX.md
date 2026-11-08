# Try the installer in a container

This runs the real installer and a real nested Naruvi stack from your current checkout. It does not mount your host Docker socket. Docker-in-Docker needs a **privileged container** and shares the host kernel: use a trusted development machine or disposable VM. This is not a security boundary for untrusted code. Only the demo web port is published, on host loopback.

Run these commands from the repository root. Allow several GB of disk space and enough RAM for the production build. The first run downloads images and builds the app; this can take several minutes. Your existing app on port 3000 stays separate.

## 1. Start the sandbox

```bash
docker compose -f deploy/sandbox/compose.yaml up --build -d --wait
```

The image contains a snapshot of your current source, including uncommitted changes. `.env` files, `.git`, dependencies, local assets, and build caches are excluded by `.dockerignore`. Rebuild the sandbox image after source changes.

## Preview the interface

Run `bash install.sh --preview` on your host to walk through the prompts without downloads, files or services. Use a normal terminal for the copper styling and live progress indicators; `NO_COLOR=1` or `TERM=dumb` gives plain text. Actual builds write verbose output to a private `install.log`, while the terminal shows each step and elapsed time.

## 2. Run the interactive installer

```bash
docker compose -f deploy/sandbox/compose.yaml exec sandbox bash /snapshot/install.sh
```

Answer:

- Where: **Local**.
- Port: **8088** (important: this matches the sandbox forwarding).
- Directory: **Enter**, accepting `/demo/naruvi`.
- Continue: **y**.

You’ll see Naruvi’s ASCII art, prompts, source setup, image build, migrations and service startup. This mode exercises a real installation with owner setup and login, but does not test public DNS or ACME certificates.

## 3. Open the app

Open **http://localhost:8088**. Use the private `/auth/setup?token=…` link printed by the installer to create a **test account**, then try login and logout. The browser address must use port 8088 so origin checks and generated links agree.

## Logs and status

```bash
docker compose -f deploy/sandbox/compose.yaml exec sandbox bash -lc 'cd /demo/naruvi && ./naruvi status'
docker compose -f deploy/sandbox/compose.yaml exec sandbox bash -lc 'cd /demo/naruvi && ./naruvi compose logs --tail=100 app'
```

If the build fails, inspect the installer output. The installer preserves its configuration, so resume without rerunning it:

```bash
docker compose -f deploy/sandbox/compose.yaml exec sandbox bash -lc 'cd /demo/naruvi && ./naruvi rebuild'
```

The setup link is in the nested app logs. Never publish that link or the log output. A real Hosted-mode test should use a disposable VM with a DNS hostname and reachable ports 80/443; this Local-mode sandbox does not certify server deployment readiness.

## Stop or reset

Stop while keeping the demo database and images:

```bash
docker compose -f deploy/sandbox/compose.yaml down
```

Delete **only this sandbox’s** volumes, including its test account, nested database and images, to start over:

```bash
docker compose -f deploy/sandbox/compose.yaml down -v
```

Do not run a global Docker prune. Cleanup is scoped to the `naruvi-installer-sandbox` Compose project.
