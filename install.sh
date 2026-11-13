#!/usr/bin/env bash
# Naruvi installer: one owner, your machine or your server. Bash 3.2+ (macOS, Linux, WSL2).
set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Install Naruvi with Docker Compose.

Usage: bash install.sh [options]

  --mode local|hosted|proxy   local   this computer only (http://localhost)
                              hosted  your domain, automatic HTTPS built in
                              proxy   your domain, behind your own reverse proxy
                                      (Coolify, Traefik, nginx, Caddy…)
  --domain NAME               public hostname for hosted/proxy (careers.example.com)
  --port N                    app port for local/proxy (default 3000)
  --bind ADDRESS              proxy mode: address the app port listens on (default 127.0.0.1)
  --dir PATH                  installation directory (default ~/.local/share/naruvi)
  --ref REF                   release tag or branch to install (default: the latest release)
  --build                     build the app image from source instead of downloading the
                              published, signed one (a branch is always built)
  --yes                       no questions; requires --mode (and --domain when needed)
  --install-docker            with --yes: install Docker when it is missing (Linux, needs root or sudo)
  --firewall                  with --yes: open ports 80 and 443 in this server's firewall for
                              hosted mode (ufw or firewalld, needs root or sudo)
  --preview                   walk through the screens without installing anything
  --help                      show this help

Environment: NARUVI_INSTALL_DIR, NARUVI_REF, NARUVI_BUILD=1, NARUVI_SOURCE_DIR (local checkout), NO_COLOR.
Requires Docker with Compose v2, Git and OpenSSL. When Docker is missing, the installer offers to
set it up (Linux: Docker's official script; macOS: Docker Desktop with Homebrew). In hosted mode,
when ufw or firewalld is on, it offers to open ports 80 and 443. Otherwise it installs nothing
outside the chosen directory except an optional `naruvi` command link in ~/.local/bin.
EOF
}

# ---------- options ----------
preview=false assume_yes=false install_docker=false want_firewall=false mode= domain= port= bind= root=${NARUVI_INSTALL_DIR:-} ref=${NARUVI_REF:-}
build=false; [[ ${NARUVI_BUILD:-} != 1 ]] || build=true
repo_url=https://github.com/Eljakani/naruvi-app.git
need() { [[ $# -ge 2 && -n $2 ]] || { echo "Missing value for $1" >&2; exit 2; }; }
while [[ $# -gt 0 ]]; do
  case $1 in
    --preview) preview=true;;
    --yes|-y) assume_yes=true;;
    --install-docker) install_docker=true;;
    --firewall) want_firewall=true;;
    --mode) need "$@"; mode=$2; shift;;
    --domain) need "$@"; domain=$2; shift;;
    --port) need "$@"; port=$2; shift;;
    --bind) need "$@"; bind=$2; shift;;
    --dir) need "$@"; root=$2; shift;;
    --ref) need "$@"; ref=$2; shift;;
    --build) build=true;;
    --help|-h) usage; exit 0;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2;;
  esac
  shift
done
case $mode in ''|local|hosted|proxy) ;; *) echo "--mode must be local, hosted or proxy" >&2; exit 2;; esac
[[ $assume_yes == false || -n $mode ]] || { echo "--yes needs --mode" >&2; exit 2; }

# ---------- terminal ----------
# Questions are read from the terminal, so `curl … | bash` stays interactive.
interactive=false
if [[ $assume_yes == false ]]; then
  exec 3<> /dev/tty || { echo "An interactive terminal is required (or pass --yes with --mode)." >&2; exit 1; }
  interactive=true
  tty_settings=$(stty -g <&3)
else
  exec 3>&1
fi
copper= bold= dim= green= yellow= red= reset=
ok='ok' warn='!!' bad='xx' pointer='>' bullet='-'
if [[ -t 3 && ${TERM:-dumb} != dumb && -z ${NO_COLOR+x} ]]; then
  copper=$'\033[38;5;173m' bold=$'\033[1m' dim=$'\033[90m'
  green=$'\033[38;5;108m' yellow=$'\033[38;5;179m' red=$'\033[38;5;167m' reset=$'\033[0m'
  ok='✓' warn='!' bad='✗' pointer='❯' bullet='•'
fi
fancy() { [[ -n $reset && $interactive == true ]]; }
out() { printf "$@" >&3; }

worker_pid=
cleanup() {
  [[ -z $worker_pid ]] || kill "$worker_pid" 2>/dev/null || true
  [[ -z $reset ]] || out '\033[?25h'
  [[ $interactive == false ]] || stty "$tty_settings" <&3 2>/dev/null || true
}
trap cleanup EXIT
trap 'out "\n\n  Stopped. Nothing was deleted; run the installer again or see install.log.\n\n"; exit 130' INT TERM

fail() {
  out '\n  %s%s Can'"'"'t continue%s\n' "$red" "$bad" "$reset"
  local line; for line in "$@"; do out '    %s\n' "$line"; done
  out '\n'
  exit 1
}

# ---------- drawing ----------
width=62
rule() { out '  %s%s%s\n' "$dim" "$(printf '%*s' "$width" '' | tr ' ' '-')" "$reset"; }
step_total=5
step() { out '\n  %s%s/%s%s  %s%s%s\n' "$copper" "$1" "$step_total" "$reset" "$bold" "$2" "$reset"; rule; }
check() { # status label detail
  local mark color
  case $1 in ok) mark=$ok color=$green;; warn) mark=$warn color=$yellow;; *) mark=$bad color=$red;; esac
  out '  %s%s%s %-30s %s%s%s\n' "$color" "$mark" "$reset" "$2" "$dim" "${3:-}" "$reset"
}
kv() { out '  %s%-14s%s %s\n' "$dim" "$1" "$reset" "$2"; }
note() { out '  %s%s%s\n' "$dim" "$1" "$reset"; }
banner() {
  local cols=80
  [[ $interactive == false ]] || cols=$(stty size <&3 2>/dev/null | awk '{print $2}') || cols=80
  out '\n%s' "$copper"
  if [[ ${cols:-80} -lt 50 ]]; then out '  N A R U V I\n'
  else cat >&3 <<'ART'
     _   _                      _
    | \ | | __ _ _ __ _   ___   _(_)
    |  \| |/ _` | '__| | | \ \ / / |
    | |\  | (_| | |  | |_| |\ V /| |
    |_| \_|\__,_|_|   \__,_| \_/ |_|
ART
  fi
  out '%s\n  %sYour career. Your workspace.%s   %sinstaller · %s%s\n' "$reset" "$bold" "$reset" "$dim" "${ref:-latest release}" "$reset"
}

# ---------- input ----------
ANSWER=
ask() { # question default
  [[ $interactive == true ]] || fail "Missing a value for: $1" "Pass it as an option (see --help)."
  out '\n  %s%s%s' "$bold" "$1" "$reset"
  [[ -z ${2:-} ]] || out ' %s[%s]%s' "$dim" "$2" "$reset"
  out '\n  %s%s%s ' "$copper" "$pointer" "$reset"
  IFS= read -r ANSWER <&3 || ANSWER=
  ANSWER=${ANSWER:-${2:-}}
}
confirm() { # question default(y|n)
  [[ $interactive == true ]] || return 0
  local hint='Y/n'; [[ $2 == y ]] || hint='y/N'
  out '\n  %s%s%s %s[%s]%s ' "$bold" "$1" "$reset" "$dim" "$hint" "$reset"
  IFS= read -r ANSWER <&3 || ANSWER=
  ANSWER=${ANSWER:-$2}
  [[ $ANSWER == y || $ANSWER == Y || $ANSWER == yes ]]
}
CHOICE=1
choose() { # options as "Label|Description"; arrow keys when the terminal allows it, numbers otherwise
  local count=$# selected=1 index option key rest
  if ! fancy; then
    index=1
    for option in "$@"; do out '\n  %s%s%s  %s\n     %s%s%s\n' "$bold" "$index" "$reset" "${option%%|*}" "$dim" "${option#*|}" "$reset"; index=$((index+1)); done
    ask "Choose 1-$count" 1
    [[ $ANSWER =~ ^[0-9]+$ && $ANSWER -ge 1 && $ANSWER -le $count ]] || fail "Choose a number from 1 to $count."
    CHOICE=$ANSWER; return
  fi
  out '\n  %s↑/↓ to move · Enter to select%s\n\n\033[?25l' "$dim" "$reset"
  while true; do
    index=1
    for option in "$@"; do
      if [[ $index == "$selected" ]]; then out '\033[2K  %s%s %s%s%s\n\033[2K    %s%s\n' "$copper" "$pointer" "$bold" "${option%%|*}" "$reset" "${option#*|}" "$reset"
      else out '\033[2K    %s%s\n\033[2K    %s%s%s\n' "${option%%|*}" "$reset" "$dim" "${option#*|}" "$reset"; fi
      index=$((index+1))
    done
    IFS= read -rsn1 key <&3 || key=
    case $key in
      $'\033') IFS= read -rsn2 rest <&3 || rest=
               case $rest in '[A') [[ $selected -le 1 ]] || selected=$((selected-1));; '[B') [[ $selected -ge $count ]] || selected=$((selected+1));; esac;;
      k) [[ $selected -le 1 ]] || selected=$((selected-1));;
      j) [[ $selected -ge $count ]] || selected=$((selected+1));;
      [1-9]) [[ $key -gt $count ]] || selected=$key;;
      '') break;;
    esac
    out '\033[%dA' $((count*2))
  done
  out '\033[?25h'
  CHOICE=$selected
}

# ---------- work ----------
log=/dev/null
OTTER=
otter() { # frame -> OTTER: the mascot sliding along a short track, looping
  local w=14 x=$(($1 % 15)) c trail= ahead= face='•ᴥ•' ripples='∼˜∼⁓'
  [[ $(($1 % 40)) -lt 37 ]] || face='-ᴥ-'
  for ((c = 0; c < x; c++)); do trail+='─'; done
  for ((c = x; c < w; c++)); do ahead+='·'; done
  OTTER="$dim$trail$reset$copper${ripples:$(($1 / 2 % 4)):1}($reset$bold$face$reset$copper)$reset$dim$ahead$reset"
}
run() { # title command...
  local title=$1; shift
  local started=$SECONDS frame=0 status=0
  if fancy; then out '\033[?25l'; else out '  ... %s\n' "$title"; fi
  "$@" >> "$log" 2>&1 &
  worker_pid=$!
  while kill -0 "$worker_pid" 2>/dev/null; do
    if fancy; then otter "$frame"; out '\r\033[2K  %s  %s %s%ss%s' "$OTTER" "$title" "$dim" "$((SECONDS-started))" "$reset"; fi
    frame=$((frame+1)); sleep 0.1
  done
  wait "$worker_pid" || status=$?
  worker_pid=
  if fancy; then out '\r\033[2K\033[?25h'; fi
  if [[ $status != 0 ]]; then
    check bad "$title" "failed after $((SECONDS-started))s"
    out '\n%s' "$dim"; tail -n 15 "$log" | sed 's/^/    /' >&3; out '%s' "$reset"
    fail "Full log: $log" "${run_hint:-"Your settings are kept. Fix the issue, then run: $root/naruvi start"}"
  fi
  check ok "$title" "$((SECONDS-started))s"
}
port_busy() { (exec 9<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
resolve() {
  if command -v getent >/dev/null; then getent ahosts "$1" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' '
  elif command -v dig >/dev/null; then dig +short "$1" A "$1" AAAA 2>/dev/null | tr '\n' ' '
  elif command -v host >/dev/null; then host "$1" 2>/dev/null | awk '/address/ {print $NF}' | tr '\n' ' '
  else echo '?'; fi
}
valid_domain() {
  local label labels
  [[ ${#1} -le 253 && $1 == *.* && $1 != *..* && ! $1 =~ ^[0-9.]+$ ]] || return 1
  [[ ! $1 =~ \.(local|localhost|internal|test|invalid|lan|home)$ ]] || return 1
  IFS=. read -r -a labels <<< "$1"
  for label in "${labels[@]}"; do [[ $label =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$ ]] || return 1; done
}
valid_port() { [[ $1 =~ ^[0-9]{1,5}$ ]] && [[ $((10#$1)) -ge 1024 && $((10#$1)) -le 65535 ]]; }

# ---------- docker setup: offered, never silent ----------
# Asked before anything else is checked; with --yes only when --install-docker is given.
offer() { # question
  if [[ $interactive == true ]]; then confirm "$1" y; else [[ $install_docker == true ]]; fi
}
as_root() { if [[ $EUID == 0 ]]; then "$@"; else sudo -n "$@"; fi; }
get_root() { # cache sudo credentials, asking for the password on the terminal
  [[ $EUID != 0 ]] || return 0
  command -v sudo >/dev/null || return 1
  ! sudo -n true 2>/dev/null || return 0
  [[ $interactive == true ]] || return 1
  out '\n'; sudo -v <&3 >&3 2>&3
}
docker_log() { log=$(mktemp "${TMPDIR:-/tmp}/naruvi-docker.XXXXXX"); run_hint='Fix the issue, or install Docker yourself: https://docs.docker.com/engine/install/ — then run this again.'; }
setup_docker() {
  local system; system=$(uname -s)
  if [[ $system == Linux ]] && grep -qi microsoft /proc/version 2>/dev/null; then return 0; fi # WSL2: Docker Desktop
  if [[ $system == Darwin ]]; then
    command -v docker >/dev/null || ! command -v brew >/dev/null && return 0
    note 'Docker is not installed. Homebrew can install Docker Desktop.'
    offer 'Install Docker Desktop now with Homebrew?' || return 0
    brew install --cask docker <&3 >&3 2>&3 || fail 'Homebrew could not install Docker Desktop.' 'Install it from https://docs.docker.com/desktop/setup/install/mac-install/ and run this again.'
    open -a Docker || true
    note 'Finish Docker Desktop'"'"'s first-run screens; waiting for it to start (up to 5 minutes).'
    local waited=0; PATH="$PATH:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin"
    until docker info >/dev/null 2>&1 || [[ $waited -ge 300 ]]; do sleep 2; waited=$((waited+2)); done
    return 0
  fi
  [[ $system == Linux ]] || return 0
  if ! command -v docker >/dev/null; then
    note 'Docker is not installed. Docker'"'"'s official script (get.docker.com) can install it; it needs root.'
    offer 'Install Docker now?' || return 0
    get_root || fail 'Installing Docker needs root or sudo.' 'Install it yourself: https://docs.docker.com/engine/install/'
    docker_log; local script="$log.sh"
    run 'Download Docker install script' curl -fsSL https://get.docker.com -o "$script"
    run 'Install Docker' as_root sh "$script"
    rm -f "$script"
  fi
  command -v docker >/dev/null || return 0
  docker info >/dev/null 2>&1 && return 0
  # Installed but unusable: the service is stopped, or this user lacks access.
  if command -v systemctl >/dev/null && ! systemctl is-active --quiet docker 2>/dev/null; then
    offer 'The Docker service is not running. Start it now (and at boot)?' || return 0
    get_root || return 0
    docker_log; run 'Start Docker' as_root systemctl enable --now docker
    docker info >/dev/null 2>&1 && return 0
  fi
  [[ $EUID != 0 ]] || return 0
  get_root || return 0
  as_root docker info >/dev/null 2>&1 || return 0
  if ! id -nG | tr ' ' '\n' | grep -qx docker; then
    if ! id -nG "$USER" 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
      offer "Let $USER use Docker without sudo (adds you to the docker group)?" || return 0
      docker_log; run 'Grant Docker access' as_root usermod -aG docker "$USER"
    fi
    # The new group applies to new logins; use it for the rest of this run.
    if command -v sg >/dev/null; then
      docker() { sg docker -c "$(printf '%q ' docker "$@")"; }
      docker_relogin=true
    fi
  fi
}
docker_relogin=false

# ---------- firewall (hosted): offered, never silent ----------
# Root is asked for as soon as Hosted is chosen, so the password prompt comes before the questions;
# the ports are opened once the install is confirmed. A firewall that is off is left alone.
firewall= open_firewall=false
plan_firewall() {
  [[ $(uname -s) == Linux ]] || return 0
  if grep -qs '^ENABLED=yes' "${NARUVI_UFW_CONF:-/etc/ufw/ufw.conf}"; then firewall=ufw
  elif systemctl is-active --quiet firewalld 2>/dev/null; then firewall=firewalld
  else return 0; fi
  if [[ $interactive == true ]]; then
    note "This server's firewall ($firewall) is on. Naruvi needs TCP 80 and 443 open; changing it needs root."
    confirm "Open ports 80 and 443 in $firewall?" y || { check warn 'Firewall' "$firewall left as is · open TCP 80 and 443 yourself"; return 0; }
  elif [[ $want_firewall == false ]]; then
    check warn 'Firewall' "$firewall is on · pass --firewall, or open TCP 80 and 443 yourself"; return 0
  fi
  if get_root; then open_firewall=true; check ok 'Firewall' "$firewall · ports 80 and 443 open when the install starts"
  else check warn 'Firewall' "no root or sudo · open TCP 80 and 443 in $firewall yourself"; fi
}
apply_firewall() { # never fatal: the install is still good, and the closing notes say what to check
  local status=0
  case $firewall in
    ufw) { as_root ufw allow 80/tcp && as_root ufw allow 443/tcp; } >> "$log" 2>&1 || status=$?;;
    firewalld) { as_root firewall-cmd --add-service=http --add-service=https &&
                 as_root firewall-cmd --permanent --add-service=http --add-service=https; } >> "$log" 2>&1 || status=$?;;
  esac
  if [[ $status == 0 ]]; then check ok 'Open firewall' "TCP 80 and 443 in $firewall"
  else check warn 'Open firewall' "$firewall refused · open TCP 80 and 443 yourself (details in install.log)"; fi
}

# ======================================================================
banner
[[ $preview == false ]] || note 'Preview: nothing is downloaded, written or started.'
root=${root:-"$HOME/.local/share/naruvi"}

# Re-running against an existing installation is a no-op that points to the manager.
if [[ $preview == false && -f $root/.env && -x $root/naruvi ]]; then
  out '\n  %s%s Naruvi is already installed%s in %s\n\n' "$green" "$ok" "$reset" "$root"
  kv 'Status' "$root/naruvi status"
  kv 'Update' "$root/naruvi update"
  kv 'All commands' "$root/naruvi help"
  out '\n'
  exit 0
fi

# ---------- 1. preflight ----------
step 1 'Check this machine'
if [[ $preview == true ]]; then note 'Skipped in preview.'
else
  setup_docker
  problems=0
  for tool in docker git openssl; do
    if command -v "$tool" >/dev/null; then check ok "$tool" "$("$tool" --version 2>/dev/null | head -n1 | cut -c1-38)"
    else check bad "$tool" 'not installed'; problems=1; fi
  done
  if command -v docker >/dev/null; then
    if docker info >/dev/null 2>&1; then check ok 'Docker engine' 'running'
    else check bad 'Docker engine' 'not running or no permission'; problems=1; fi
    if docker compose version >/dev/null 2>&1; then check ok 'Docker Compose' "$(docker compose version --short 2>/dev/null || echo v2)"
    else check bad 'Docker Compose' 'v2 plugin missing'; problems=1; fi
  fi
  probe=$root; while [[ ! -d $probe ]]; do probe=$(dirname "$probe"); done
  free_gb=$(df -Pk "$probe" 2>/dev/null | awk 'NR==2 {printf "%d", $4/1048576}')
  if [[ ${free_gb:-0} -ge 6 ]]; then check ok 'Disk space' "${free_gb} GB free"
  else check warn 'Disk space' "${free_gb:-?} GB free · about 6 GB recommended"; fi
  mem_gb=
  if [[ -r /proc/meminfo ]]; then mem_gb=$(awk '/MemTotal/ {printf "%d", $2/1048576+0.5}' /proc/meminfo)
  elif command -v sysctl >/dev/null; then mem_gb=$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%d", $1/1073741824+0.5}'); fi
  if [[ -z $mem_gb ]]; then check warn 'Memory' 'unknown'
  elif [[ $mem_gb -ge 2 ]]; then check ok 'Memory' "${mem_gb} GB"
  else check warn 'Memory' "${mem_gb} GB · building from source needs about 2 GB"; fi
  if [[ $problems != 0 ]]; then
    fail 'Install the missing pieces, then run this again.' \
         'Docker: https://docs.docker.com/get-started/get-docker/' \
         'Windows: run the installer inside WSL2 with Docker Desktop integration.'
  fi
  if [[ -n $(docker ps -aq --filter label=com.docker.compose.project=naruvi 2>/dev/null) ]]; then
    fail 'A Naruvi stack (project "naruvi") already runs on this Docker engine.' 'Manage it with its `naruvi` command, or remove it first.'
  fi
fi

# ---------- version and image ----------
# Releases come as a published image, signed by the release workflow: downloaded in a minute.
# Branches, local copies, --build and other processor types build the image here instead.
if [[ -z $ref && -z ${NARUVI_SOURCE_DIR:-} && $preview == false ]]; then
  ref=$(git ls-remote --tags --refs "$repo_url" 'v*' 2>/dev/null | sed -n 's|.*refs/tags/\(v[0-9]*\.[0-9]*\.[0-9]*\)$|\1|p' | sort -V | tail -n1 || true)
  [[ -n $ref ]] || { ref=main; check warn 'Version' 'no release found; installing main'; }
fi
ref=${ref:-main}
use_image=false
if [[ $build == false && -z ${NARUVI_SOURCE_DIR:-} && $ref =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  if [[ $preview == true ]]; then use_image=true
  else case $(docker version --format '{{.Server.Arch}}' 2>/dev/null) in amd64|arm64) use_image=true;; esac; fi
fi

# ---------- 2. where ----------
step 2 'Where will Naruvi run?'
if [[ -z $mode ]]; then
  choose \
    'Local|On this computer only. Opens at http://localhost.' \
    'Hosted|On a server with your domain. HTTPS certificates handled for you.' \
    'Behind your proxy|Your domain through Coolify, Traefik, nginx or another proxy you run.'
  case $CHOICE in 1) mode=local;; 2) mode=hosted;; 3) mode=proxy;; esac
fi
case $mode in
  local) mode_label='Local';;
  hosted) mode_label='Hosted (built-in HTTPS)';;
  proxy) mode_label='Behind your proxy';;
esac
check ok 'Mode' "$mode_label"
[[ $mode != hosted || $preview == true ]] || plan_firewall

# ---------- 3. details ----------
step 3 'Details'
if [[ $mode != local ]]; then
  if [[ -z $domain ]]; then
    note 'Point a DNS A (and AAAA, if you use IPv6) record at this server first.'
    ask 'Domain, without https://' ''
    domain=$ANSWER
  fi
  domain=$(printf '%s' "$domain" | tr 'A-Z' 'a-z'); domain=${domain#https://}; domain=${domain%/}
  valid_domain "$domain" || fail "\"$domain\" is not a public hostname." 'Use something like careers.example.com (no IP, no .local).'
  url="https://$domain"
  if [[ $preview == false ]]; then
    addresses=$(resolve "$domain" || true)
    if [[ -z ${addresses// /} ]]; then check warn 'DNS' "$domain does not resolve yet"
    else check ok 'DNS' "$domain → ${addresses% }"; fi
  fi
fi
if [[ $mode != hosted ]]; then
  if [[ -z $port ]]; then
    default_port=3000
    while [[ $preview == false ]] && port_busy "$default_port" && [[ $default_port -lt 3010 ]]; do default_port=$((default_port+1)); done
    if [[ $interactive == true ]]; then ask 'App port' "$default_port"; port=$ANSWER; else port=$default_port; fi
  fi
  valid_port "$port" || fail 'Choose a port from 1024 to 65535.'
  port=$((10#$port))
  if [[ $preview == false ]] && port_busy "$port"; then fail "Port $port is already in use. Choose another with --port."; fi
  [[ $mode == proxy ]] || url="http://localhost:$port"
fi
if [[ $mode == proxy ]]; then
  if [[ -z $bind ]]; then
    note 'Where does your proxy run?'
    if [[ $interactive == true ]]; then
      choose \
        'On this host|Listen on 127.0.0.1 only. Safest; nothing else can reach the app port.' \
        'In Docker or on another host|Listen on all interfaces. Firewall the port to your proxy.'
      [[ $CHOICE == 1 ]] && bind=127.0.0.1 || bind=0.0.0.0
    else bind=127.0.0.1; fi
  fi
  [[ $bind =~ ^[0-9.]+$ || $bind =~ ^[0-9a-fA-F:]+$ ]] || fail 'Use an IP address for --bind.'
  [[ $bind == 127.0.0.1 ]] || check warn 'App port' "open on $bind:$port · restrict it to your proxy"
fi
if [[ $mode == hosted && $preview == false ]]; then
  for p in 80 443; do ! port_busy "$p" || check warn "Port $p" 'already in use on this machine'; done
fi
if [[ $interactive == true ]]; then
  ask 'Install into' "$root"; root=$ANSWER
fi
[[ $root == /* ]] || fail 'Use an absolute path for the installation directory.'
[[ $preview == true || ! -e $root || -z $(ls -A "$root" 2>/dev/null) ]] || fail "$root already has files in it." 'Choose an empty directory. Existing settings and data are never overwritten.'

# ---------- 4. review ----------
step 4 'Review'
kv 'Mode' "$mode_label"
kv 'Address' "$url"
case $mode in
  local) kv 'Reachable' 'only from this computer';;
  hosted) kv 'HTTPS' 'automatic certificates, renewal, HTTP → HTTPS'
          [[ $open_firewall == false ]] || kv 'Firewall' "open TCP 80 and 443 in $firewall";;
  proxy) kv 'App listens' "$bind:$port"; kv 'Your proxy' "forward $domain → http://$( [[ $bind == 0.0.0.0 ]] && echo '<this-host>' || echo 127.0.0.1 ):$port";;
esac
kv 'Directory' "$root"
kv 'Version' "$ref"
if [[ $use_image == true ]]; then kv 'Image' 'published release, signature checked before use'
else kv 'Image' 'built on this machine from the source'; fi
kv 'Access' 'one owner account, created from a private link'
out '\n'; note 'Secrets are generated on this machine and never leave it.'
if [[ $use_image == true ]]; then note 'Downloading the image takes a minute or two.'
else note 'Building the image takes 5 to 30 minutes, depending on this machine.'; fi
confirm 'Install now?' y || { out '\n  Nothing changed.\n\n'; exit 0; }

# ---------- 5. install ----------
step 5 'Install'
if [[ $preview == true ]]; then
  image_step='Build image'; [[ $use_image == false ]] || image_step='Download and verify image'
  for t in 'Download source' 'Generate secrets' "$image_step" 'Validate configuration' 'Start database, app and worker' 'Wait for Naruvi'; do check ok "$t" 'preview'; done
  out '\n  %s%s Preview complete%s · a real install ends with your private setup link.\n\n' "$green" "$ok" "$reset"
  exit 0
fi
mkdir -p "$root"; chmod 700 "$root"
log=$root/install.log; : > "$log"; chmod 600 "$log"
[[ $open_firewall == false ]] || apply_firewall
if [[ -n ${NARUVI_SOURCE_DIR:-} ]]; then
  [[ -f $NARUVI_SOURCE_DIR/Dockerfile && -f $NARUVI_SOURCE_DIR/deploy/compose.yaml ]] || fail 'NARUVI_SOURCE_DIR must point to a Naruvi checkout.'
  mkdir "$root/source"
  run 'Copy local source' sh -c 'tar -C "$1" --exclude=.git --exclude=node_modules --exclude=.next --exclude=data --exclude=".env*" --exclude="*.log" -cf - . | tar -C "$2" -xf -' _ "$NARUVI_SOURCE_DIR" "$root/source"
else
  run 'Download source' git clone --depth 1 --branch "$ref" https://github.com/Eljakani/naruvi-app.git "$root/source"
fi
chmod -R go+rX "$root/source" # public code; the image runs as `node` and must read it despite umask 077
cp "$root/source/deploy/compose.yaml" "$root/compose.yaml"
cp "$root/source/deploy/build.yaml" "$root/build.yaml"
overlay=$mode.yaml
cp "$root/source/deploy/$overlay" "$root/$overlay"
[[ $mode != hosted ]] || cp "$root/source/deploy/Caddyfile" "$root/Caddyfile"
{
  printf '# Naruvi settings. Keep this file private and backed up: it holds your encryption key.\n'
  printf 'COMPOSE_PROJECT_NAME=naruvi\n'
  printf 'NARUVI_MODE=%s\nNARUVI_URL=%s\n' "$mode" "$url"
  printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
  printf 'SETTINGS_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)"
  case $mode in
    hosted) printf 'NARUVI_DOMAIN=%s\nNARUVI_TRUST_PROXY=on\n' "$domain";;
    proxy) printf 'NARUVI_PORT=%s\nNARUVI_BIND=%s\n' "$port" "$bind";;
    local) printf 'NARUVI_PORT=%s\n' "$port";;
  esac
} > "$root/.env"
chmod 600 "$root/.env"
check ok 'Generate secrets' '.env, private to you'
cp "$root/source/deploy/naruvi" "$root/naruvi"; chmod 700 "$root/naruvi"
# Keys that may sign release tags. Copied once; `naruvi update` never replaces it.
cp "$root/source/deploy/trusted-signers" "$root/trusted-signers"; chmod 600 "$root/trusted-signers"
cd "$root"
# Signed release image, pinned by digest. When there is none for this machine (2) or it can't be
# downloaded (3), the image is built here instead, saying why. A failed signature check stops.
fetch_image() {
  local status=0
  "$root/naruvi" release-image "${ref#v}" "$(git -C "$root/source" rev-parse HEAD)" > "$root/.image" 2> "$root/.image-error" || status=$?
  cat "$root/.image-error" >> "$log"
  if [[ $status == 2 || $status == 3 ]]; then echo "$status" > "$root/.image"; status=0; fi
  return $status
}
image=
if [[ $use_image == true ]]; then
  run_hint="The image did not pass signature verification, so it was not used. Try again later, or build it here: bash install.sh --build"
  run 'Download and verify image' fetch_image
  run_hint=
  image=$(cat "$root/.image"); reason=$(tail -n1 "$root/.image-error" 2>/dev/null | cut -c1-90); rm -f "$root/.image" "$root/.image-error"
  case $image in
    2) image=; check warn 'Published image' "none for $ref on this machine; building instead";;
    3) image=; check warn 'Published image' "couldn't download it; building instead"; [[ -z $reason ]] || note "    Docker: $reason";;
  esac
fi
if [[ -n $image ]]; then
  printf 'COMPOSE_FILE=compose.yaml:%s\nNARUVI_IMAGE=%s\n' "$overlay" "$image" >> "$root/.env"
else
  printf 'COMPOSE_FILE=compose.yaml:%s:build.yaml\nNARUVI_IMAGE=naruvi-app:source\n' "$overlay" >> "$root/.env"
fi
run 'Validate configuration' docker compose config --quiet
[[ $mode != hosted ]] || run 'Validate HTTPS gateway' docker compose run --rm --no-deps gateway caddy validate --config /etc/caddy/Caddyfile
[[ -n $image ]] || run 'Build image' docker compose build
run 'Start database, app and worker' docker compose up -d
probe_url=$url/login
[[ $mode != proxy ]] || probe_url="http://127.0.0.1:$port/login"
ready=false
if command -v curl >/dev/null; then
  started=$SECONDS
  [[ $mode != hosted ]] || note 'Requesting the HTTPS certificate; this can take a minute.'
  if fancy; then out '\033[?25l'; fi
  for attempt in $(seq 1 60); do
    code=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "$probe_url" || true)
    if [[ $code =~ ^[23] ]]; then ready=true; break; fi
    if fancy; then out '\r\033[2K  %s…%s Wait for Naruvi %s%ss%s' "$copper" "$reset" "$dim" "$((SECONDS-started))" "$reset"; fi
    sleep 3
  done
  if fancy; then out '\r\033[2K\033[?25h'; fi
  if [[ $ready == true ]]; then check ok 'Wait for Naruvi' "$((SECONDS-started))s"; else check warn 'Wait for Naruvi' 'no answer yet'; fi
fi
setup_link=$(docker compose exec -T app node --import tsx scripts/setup-link.mts --raw 2>/dev/null | grep -Eo 'https?://[^[:space:]]+/auth/setup\?token=[a-f0-9]{64}' | tail -n1 || true)
[[ -n $setup_link ]] || setup_link=$(docker compose logs --no-color app 2>/dev/null | grep -Eo 'https?://[^[:space:]]+/auth/setup\?token=[a-f0-9]{64}' | tail -n1 || true)

# Offer a `naruvi` command on PATH without touching shell profiles.
linked=
if [[ -d $HOME/.local/bin && ! -e $HOME/.local/bin/naruvi ]] && confirm "Add the \`naruvi\` command to ~/.local/bin?" y; then
  ln -s "$root/naruvi" "$HOME/.local/bin/naruvi" && linked=yes
fi
cli="$root/naruvi"; [[ -z $linked ]] || cli=naruvi

# ---------- done ----------
out '\n'; rule
if [[ $ready == true ]]; then out '\n  %s%s Naruvi is ready%s\n\n' "$green" "$ok" "$reset"
else
  out '\n  %s%s Naruvi started, but did not answer yet%s\n' "$yellow" "$warn" "$reset"
  case $mode in
    hosted) note 'Check DNS, and that ports 80 and 443 reach this server. Then run:';;
    proxy) note "Point your proxy at port $port. Then run:";;
    *) note 'Give it a moment, then run:';;
  esac
  out '    %s logs app\n\n' "$cli"
fi
kv 'Open' "$url"
kv 'Installed in' "$root"
out '\n  %s1. Create your owner account%s\n' "$bold" "$reset"
if [[ -n $setup_link ]]; then
  note 'Private, one-time link, valid for 1 hour. Don'"'"'t share it or screenshot it.'
  out '\n     %s%s%s\n' "$copper" "$setup_link" "$reset"
  if [[ $mode == local && $interactive == true ]]; then
    opener=; command -v xdg-open >/dev/null && opener=xdg-open; command -v open >/dev/null && [[ $(uname) == Darwin ]] && opener=open
    if [[ -n $opener ]] && confirm 'Open it in your browser now?' y; then "$opener" "$setup_link" >/dev/null 2>&1 || true; fi
  fi
else
  note "Get your private link with:  $cli setup-link"
fi
out '\n  %s2. Then Naruvi walks you through your profile and AI model.%s\n' "$bold" "$reset"
out '\n  %sManage%s\n' "$bold" "$reset"
kv "$cli status" 'what is running'
kv "$cli logs" 'follow the logs'
kv "$cli backup" 'database, files and keys'
kv "$cli update" 'get the latest version'
kv "$cli help" 'everything else'
if [[ $docker_relogin == true ]]; then
  out '\n'; note 'You were just added to the docker group: log out and back in before using these commands.'
fi
out '\n'; rule; out '\n'
