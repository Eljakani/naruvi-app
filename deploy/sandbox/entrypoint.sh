#!/usr/bin/env bash
set -euo pipefail
# Override the image entrypoint: expose only a Unix socket, never a Docker TCP API.
dockerd --host=unix:///var/run/docker.sock > /tmp/dockerd.log 2>&1 &
daemon=$!
forwarder=
cleanup() {
  [[ -z $forwarder ]] || kill "$forwarder" 2>/dev/null || true
  kill "$daemon" 2>/dev/null || true
  wait "$daemon" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' TERM INT
for attempt in {1..60}; do
  docker info >/dev/null 2>&1 && break
  if ! kill -0 "$daemon" 2>/dev/null; then cat /tmp/dockerd.log >&2; exit 1; fi
  sleep 1
done
docker info >/dev/null 2>&1 || { cat /tmp/dockerd.log >&2; exit 1; }
# Installer laptop mode binds inside this namespace. Relay it to the host's loopback-only port.
socat TCP-LISTEN:8080,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:8088 &
forwarder=$!
printf '\nSandbox ready. Run the installer with docker compose exec (see docs/INSTALLER-SANDBOX.md).\n'
wait "$daemon"
