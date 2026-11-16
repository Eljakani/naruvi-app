#!/usr/bin/env bash
# Naruvi installer: one owner, your machine or your server. Bash 3.2+ (macOS, Linux, WSL2).
# Run as `curl … | bash`, bash reads this script from the same pipe that commands it starts inherit
# as stdin. One that reads stdin (Docker's install script, `docker compose exec`) swallows the rest
# of the script and the installer stops without a word. The braces make bash read all of it first.
{
set -euo pipefail
umask 077
USER=${USER:-$(id -un 2>/dev/null || echo root)} # unset under sudo -i, cron and in containers

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
  --install-deps              with --yes: install missing Git, curl and OpenSSL with this
                              system's package manager (needs root or sudo)
  --install-docker            with --yes: install Docker, or its missing Compose and Buildx
                              plugins, and start it (Linux, needs root or sudo)
  --firewall                  with --yes: open ports 80 and 443 in this server's firewall for
                              hosted mode (ufw or firewalld, needs root or sudo)
  --swap                      with --yes: add a 2 GB swap file when building on a small server
  --preview                   walk through the screens without installing anything
  --help                      show this help

Environment: NARUVI_INSTALL_DIR, NARUVI_REF, NARUVI_BUILD=1, NARUVI_SOURCE_DIR (local checkout), NO_COLOR.
Requires Docker with Compose v2, Git, curl and OpenSSL. It recognises the Debian, Ubuntu, Fedora,
RHEL (Rocky, Alma, Oracle, CentOS), Amazon Linux, Azure Linux, openSUSE/SLES, Arch, Alpine and Void
families, and offers to install what is missing with their own packages (macOS: Homebrew). In
hosted mode it checks DNS against this server's public address and, when ufw or firewalld is on,
offers to open ports 80 and 443. Nothing is installed without asking (or the matching flag), and
nothing outside the chosen directory changes except an optional `naruvi` link in ~/.local/bin.
EOF
}

# ---------- options ----------
preview=false assume_yes=false install_docker=false install_deps=false want_firewall=false want_swap=false mode= domain= port= bind= root=${NARUVI_INSTALL_DIR:-} ref=${NARUVI_REF:-}
build=false; [[ ${NARUVI_BUILD:-} != 1 ]] || build=true
repo_url=https://github.com/Eljakani/naruvi-app.git
need() { [[ $# -ge 2 && -n $2 ]] || { echo "Missing value for $1" >&2; exit 2; }; }
while [[ $# -gt 0 ]]; do
  case $1 in
    --preview) preview=true;;
    --yes|-y) assume_yes=true;;
    --install-docker) install_docker=true;;
    --install-deps) install_deps=true;;
    --swap) want_swap=true;;
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
trap 'out "\n\n  Stopped. Nothing was deleted. Run the installer again to pick up where it stopped.\n\n"; exit 130' INT TERM

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
command_row() { out '  %-*s %s%s%s\n' $((${#cli}+12)) "$1" "$dim" "$2" "$reset"; }
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
# Until the installation directory exists, step output goes to a private temporary log; it is
# folded into install.log once there is one.
log=/dev/null
early_log() { [[ $log != /dev/null ]] || { log=$(mktemp "${TMPDIR:-/tmp}/naruvi-install.XXXXXX"); chmod 600 "$log"; }; }
OTTER=
otter() { # frame -> OTTER: the mascot sliding along a short track, looping
  local w=14 x=$(($1 % 15)) c trail= ahead= face='•ᴥ•' ripples='∼˜∼⁓'
  [[ $(($1 % 40)) -lt 37 ]] || face='-ᴥ-'
  for ((c = 0; c < x; c++)); do trail+='─'; done
  for ((c = x; c < w; c++)); do ahead+='·'; done
  OTTER="$dim$trail$reset$copper${ripples:$(($1 / 2 % 4)):1}($reset$bold$face$reset$copper)$reset$dim$ahead$reset"
}

# Known causes in the last lines of the log, each with what to do about it.
explain_failure() {
  local text; text=$(tail -n 40 "$log" 2>/dev/null | tr 'A-Z' 'a-z')
  case $text in
    *'no space left on device'*)
      note '    The disk is full. Free some space (docker system prune removes unused images), then try again.';;
    *'could not get lock'*|*'waiting for cache lock'*|*'another app is currently holding the yum lock'*|*'system management is locked'*)
      note '    Another package manager is running, often automatic updates on a new server. Wait a minute, then try again.';;
    *'toomanyrequests'*|*'pull rate limit'*)
      note '    Docker Hub limits anonymous downloads. Wait a while, or sign in with: docker login';;
    *'could not resolve host'*|*'temporary failure in name resolution'*|*'no such host'*|*'name or service not known'*)
      note "    This machine can't resolve names. Check its network and DNS (/etc/resolv.conf), then try again.";;
    *'x509'*|*'certificate verify failed'*|*'certificate is not yet valid'*|*'certificate has expired'*)
      note "    A certificate was rejected. Check this machine's clock and its CA certificates (package ca-certificates)."
      [[ -z ${HTTPS_PROXY:-${https_proxy:-}} ]] || note '    A proxy that inspects HTTPS also causes this: add its CA to the system and to Docker.';;
    *'timeout'*|*'timed out'*|*'connection refused'*|*'connection reset'*|*'network is unreachable'*|*'unexpected eof'*|*'tls handshake'*)
      note '    A download was cut off. Usually temporary: try again.'
      [[ -z ${HTTPS_PROXY:-${https_proxy:-}} ]] || note '    Behind a proxy, Docker needs it too: https://docs.docker.com/engine/daemon/proxy/';;
    *'permission denied'*'docker'*)
      note '    This user may not use Docker yet. Log out and back in (new group membership), or run: sudo usermod -aG docker $USER';;
    *'killed'*|*'exit code: 137'*|*'out of memory'*|*'enomem'*|*'heap out of memory'*)
      note '    The build ran out of memory. Add swap (the installer offers it with --swap), or use the published image.';;
    *'buildx component is missing'*|*'requires buildx'*|*'buildx'*'not a docker command'*)
      note '    Building needs the Docker Buildx plugin. Run the installer again: it offers to add it.';;
    *'address already in use'*|*'port is already allocated'*)
      note '    A port Naruvi needs is taken by another program. Free it, or choose another port.';;
  esac
}

# Failures that waiting won't fix: retrying by itself only delays the explanation.
permanent_failure() {
  tail -n 40 "$log" 2>/dev/null | grep -qiE 'no space left on device|permission denied|manifest unknown|checksum mismatch|unsupported distribution|already in use|port is already allocated|no matching manifest|target not found|unable to locate package|no match for argument|not found in package names'
}
# A step that runs in the background behind a progress line. run_attempts > 1 retries by itself
# (network steps); run_soft=true turns a final failure into a warning; run_retry_hook runs between
# attempts. Interactively, a failure offers to try again, show the log, or stop.
run_attempts=1 run_soft=false run_retry_hook=
run() { # title command...
  local title=$1; shift
  local started frame status attempt=1 pause
  while true; do
    started=$SECONDS frame=0 status=0
    if fancy; then out '\033[?25l'; else out '  ... %s\n' "$title"; fi
    "$@" >> "$log" 2>&1 &
    worker_pid=$!
    while kill -0 "$worker_pid" 2>/dev/null; do
      if fancy; then otter "$frame"; out '\r\033[2K  %s  %s %s%ss%s' "$OTTER" "$title" "$dim" "$((SECONDS-started))" "$reset"; fi
      frame=$((frame+1)); (sleep 0.1) 2>/dev/null || true
    done
    wait "$worker_pid" || status=$?
    worker_pid=
    if fancy; then out '\r\033[2K\033[?25h'; fi
    if [[ $status == 0 ]]; then check ok "$title" "$((SECONDS-started))s"; return 0; fi
    if [[ $attempt -lt $run_attempts ]] && ! permanent_failure; then
      pause=$((attempt * 5))
      check warn "$title" "failed · trying again in ${pause}s ($((attempt+1))/$run_attempts)"
      recover_docker
      [[ -z $run_retry_hook ]] || $run_retry_hook >> "$log" 2>&1 || true
      sleep "$pause"; attempt=$((attempt+1)); continue
    fi
    if [[ $run_soft == true ]]; then
      check warn "$title" "didn't work · details in the log"; explain_failure; return 1
    fi
    check bad "$title" "failed after $((SECONDS-started))s"
    out '\n%s' "$dim"; tail -n 15 "$log" | sed 's/^/    /' >&3; out '%s' "$reset"
    explain_failure
    if [[ $interactive == true ]]; then
      while true; do
        choose 'Try again|Run this step again. Fix the cause first if one is shown above.' \
               'Show more of the log|The last 60 lines.' \
               'Stop here|Everything so far is kept. Run the installer again to pick up where it stopped.'
        case $CHOICE in
          1) recover_docker; attempt=1; continue 2;;
          2) out '\n%s' "$dim"; tail -n 60 "$log" | sed 's/^/    /' >&3; out '%s\n  Full log: %s\n' "$reset" "$log";;
          *) break;;
        esac
      done
    fi
    fail "Full log: $log" "${run_hint:-"Your settings are kept. Fix the issue, then run the installer again: it picks up where it stopped."}"
  done
}
port_busy() { (exec 9<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
valid_domain() {
  local label labels
  [[ ${#1} -le 253 && $1 == *.* && $1 != *..* && ! $1 =~ ^[0-9.]+$ ]] || return 1
  [[ ! $1 =~ \.(local|localhost|internal|test|invalid|lan|home|example|localdomain)$ ]] || return 1
  IFS=. read -r -a labels <<< "$1"
  for label in "${labels[@]}"; do [[ $label =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$ ]] || return 1; done
}
# What people paste: "https://Careers.Example.com:443/login", with spaces or a trailing dot.
clean_domain() {
  local d; d=$(printf '%s' "$1" | tr -d '[:space:]' | tr 'A-Z' 'a-z')
  d=${d#http://}; d=${d#https://}; d=${d%%/*}; d=${d%%\?*}; d=${d%%:*}; d=${d%.}
  printf '%s' "$d"
}
domain_problem() { # why a domain can't be used, in words
  if [[ -z $1 ]]; then echo 'Enter the hostname people will open, such as careers.example.com.'
  elif [[ $1 =~ ^[0-9.]+$ || $1 == *:*:* ]]; then echo 'That is an IP address. HTTPS certificates need a hostname: create a DNS A record for a (sub)domain pointing at this server.'
  elif [[ $1 =~ [^a-z0-9.-] ]]; then echo 'Use the ASCII form of the name (international names start with xn--).'
  elif [[ $1 != *.* ]]; then echo 'Use the full hostname, including the domain (careers.example.com, not careers).'
  else echo "\"$1\" is not a public hostname. Use one under a domain you own (no .local, .lan or .test)."; fi
}
port_owner() { # what listens on a port, when the system can tell
  local who=
  if command -v ss >/dev/null; then who=$(ss -Hltnp "sport = :$1" 2>/dev/null | sed -n 's/.*users:(("\([^"]*\)".*/\1/p' | head -n1); fi
  [[ -n $who ]] || who=$(docker ps --filter "publish=$1" --format 'Docker container {{.Names}}' 2>/dev/null | head -n1)
  printf '%s' "${who:-another program}"
}
local_addresses() {
  if command -v ip >/dev/null; then ip -o addr show scope global 2>/dev/null | awk '{sub(/\/.*/, "", $4); print $4}'
  elif command -v ifconfig >/dev/null; then ifconfig 2>/dev/null | awk '/inet6? / {print $2}' | grep -v '^127\.\|^::1$\|^fe80'; fi
}
valid_port() { [[ $1 =~ ^[0-9]{1,5}$ ]] && [[ $((10#$1)) -ge 1024 && $((10#$1)) -le 65535 ]]; }

# ---------- this machine ----------
# Read once: the distribution family decides how packages and Docker are installed, the init
# system how services start, and the cloud where the firewall that matters is.
os_id= os_like= os_version= os_name= family=other pkg= init= cloud= cloud_name= device= wsl=false
arch=$(uname -m 2>/dev/null || echo unknown)
os_file=
osr() { sed -n "s/^$1=//p" "$os_file" 2>/dev/null | head -n1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\\(.*\\)'\$/\\1/"; }
detect_system() {
  local word vendor= product= asset= bios=
  case $(uname -s 2>/dev/null) in
    Darwin) family=macos; os_name="macOS $(sw_vers -productVersion 2>/dev/null || true)"; ! command -v brew >/dev/null || pkg=brew; return 0;;
    Linux) ;;
    *) os_name=$(uname -s 2>/dev/null || echo unknown); return 0;;
  esac
  ! grep -qi microsoft /proc/version 2>/dev/null || wsl=true
  os_file=${NARUVI_OS_RELEASE:-/etc/os-release}; [[ -r $os_file ]] || os_file=/usr/lib/os-release
  os_id=$(osr ID | tr 'A-Z' 'a-z'); os_like=$(osr ID_LIKE | tr 'A-Z' 'a-z'); os_version=$(osr VERSION_ID)
  os_name=$(osr PRETTY_NAME); [[ -n $os_name ]] || os_name='Linux'
  for word in $os_id $os_like; do
    case $word in
      debian|ubuntu|raspbian|linuxmint|pop|elementary|zorin|kali|neon|devuan|pureos|deepin|mx|parrot) family=debian;;
      fedora) if [[ $(osr VARIANT_ID) == coreos ]]; then family=immutable; else family=fedora; fi;;
      rhel|centos|rocky|almalinux|ol|eurolinux|cloudlinux|virtuozzo|circle|navylinux) family=rhel;;
      amzn) family=amzn;;
      azurelinux|mariner) family=azure;;
      opensuse*|sles|sled|suse|sle-micro) family=suse;;
      arch|archarm|manjaro|endeavouros|garuda|artix|cachyos) family=arch;;
      alpine|postmarketos) family=alpine;;
      void) family=void;;
      nixos) family=nixos;;
      gentoo) family=gentoo;;
      flatcar|coreos|cos|bottlerocket|talos|rhcos) family=immutable;;
      *) continue;;
    esac
    break
  done
  case $family in
    debian) pkg=apt;;
    fedora|rhel|amzn) if command -v dnf >/dev/null; then pkg=dnf; else pkg=yum; fi;;
    azure) pkg=tdnf;;
    suse) pkg=zypper;;
    arch) pkg=pacman;;
    alpine) pkg=apk;;
    void) pkg=xbps;;
  esac
  [[ -z $pkg ]] || command -v "$(pkg_command)" >/dev/null || pkg=
  if [[ -d /run/systemd/system ]]; then init=systemd
  elif command -v rc-service >/dev/null; then init=openrc
  elif command -v sv >/dev/null && [[ -d /etc/sv ]]; then init=runit
  elif command -v service >/dev/null; then init=service; fi
  # Cloud machines say who runs them in their firmware tables (readable without root).
  vendor=$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null || true); product=$(cat /sys/class/dmi/id/product_name 2>/dev/null || true)
  asset=$(cat /sys/class/dmi/id/chassis_asset_tag 2>/dev/null || true); bios="$(cat /sys/class/dmi/id/bios_vendor 2>/dev/null || true) $(cat /sys/class/dmi/id/bios_version 2>/dev/null || true)"
  case "$vendor|$product|$asset|$bios" in
    *'Amazon EC2'*|*amazon*) cloud=aws cloud_name='AWS EC2';;
    *'Google Compute Engine'*|*Google*) cloud=gcp cloud_name='Google Cloud';;
    *7783-7084-3265-9085-8269-3286-77*) cloud=azure cloud_name='Microsoft Azure';;
    *OracleCloud*) cloud=oracle cloud_name='Oracle Cloud';;
    *DigitalOcean*) cloud=digitalocean cloud_name='DigitalOcean';;
    *Hetzner*) cloud=hetzner cloud_name='Hetzner Cloud';;
    *Linode*|*Akamai*) cloud=linode cloud_name='Akamai (Linode)';;
    *Vultr*) cloud=vultr cloud_name='Vultr';;
    *Scaleway*) cloud=scaleway cloud_name='Scaleway';;
    *Alibaba*) cloud=alibaba cloud_name='Alibaba Cloud';;
    *Tencent*) cloud=tencent cloud_name='Tencent Cloud';;
    *OVH*) cloud=ovh cloud_name='OVHcloud';;
    *OpenStack*) cloud=openstack cloud_name='OpenStack';;
  esac
  device=$(tr -d '\0' 2>/dev/null < /proc/device-tree/model | sed -n 's/^\(Raspberry Pi [0-9A-Za-z]*\).*/\1/p' || true)
}
system_summary() {
  local parts=$os_name
  [[ $wsl == false ]] || parts="$parts (WSL)"
  parts="$parts · $arch"
  [[ -z $cloud_name ]] || parts="$parts · $cloud_name"
  [[ -z $device ]] || parts="$parts · $device"
  printf '%s' "$parts"
}
# Where to open ports when the provider filters traffic before it reaches this machine.
cloud_firewall() {
  case $cloud in
    aws) echo 'the security group of this instance (EC2 → Security Groups → Inbound rules)';;
    gcp) echo 'a VPC firewall rule (or "Allow HTTP/HTTPS traffic" on this VM)';;
    azure) echo 'the network security group of this VM (Networking → Inbound port rules)';;
    oracle) echo 'the security list of this subnet (Networking → Virtual Cloud Networks)';;
    digitalocean) echo 'the Cloud Firewall attached to this Droplet, if any';;
    hetzner) echo 'the Hetzner Cloud Firewall applied to this server, if any';;
    linode) echo 'the Cloud Firewall attached to this Linode, if any';;
    vultr) echo 'the firewall group of this instance, if any';;
    scaleway|alibaba|tencent|openstack) echo 'the security group of this instance';;
    ovh) echo 'the OVHcloud network firewall, if it is on';;
    *) echo "your provider's or router's firewall";;
  esac
}

# ---------- packages: offered, never silent ----------
pkg_command() { case $pkg in apt) echo apt-get;; xbps) echo xbps-install;; *) echo "$pkg";; esac; }
pkg_label() { case $pkg in apt) echo APT;; brew) echo Homebrew;; xbps) echo XBPS;; *) echo "$pkg";; esac; }
pkg_install() { # packages...
  case $pkg in
    apt) as_root env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 update -q &&
         as_root env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y -q --no-install-recommends "$@";;
    dnf) as_root dnf install -y -q "$@";;
    yum) as_root yum install -y -q "$@";;
    tdnf) as_root tdnf install -y -q "$@";;
    zypper) as_root zypper --non-interactive --quiet install --no-recommends "$@";;
    pacman) as_root pacman -S --needed --noconfirm "$@" || as_root pacman -Syu --needed --noconfirm "$@";;
    apk) as_root apk add --no-cache "$@";;
    xbps) as_root xbps-install -Sy "$@";;
    brew) brew install "$@";;
    *) return 1;;
  esac
}
manual_install_hint() { # tool -> how to install it here, in words
  case $pkg in
    apt) echo "sudo apt-get install $1";; dnf|yum|tdnf) echo "sudo $pkg install $1";; zypper) echo "sudo zypper install $1";;
    pacman) echo "sudo pacman -S $1";; apk) echo "sudo apk add $1";; xbps) echo "sudo xbps-install $1";; brew) echo "brew install $1";;
    *) case $family in
         nixos) echo "add $1 to environment.systemPackages in configuration.nix";;
         immutable) echo "this system is image-based: use a toolbox container or a system extension for $1";;
         macos) [[ $1 == git ]] && echo 'xcode-select --install (or install Homebrew, then: brew install git)' || echo "install Homebrew (https://brew.sh), then: brew install $1";;
         *) echo "install $1 with your package manager";;
       esac;;
  esac
}
# First boot of a cloud server: cloud-init is often still installing packages and holds the lock.
first_boot_wait() { cloud-init status --wait >/dev/null 2>&1 || true; }
wait_for_first_boot() {
  command -v cloud-init >/dev/null && cloud-init status 2>/dev/null | grep -q running || return 0
  run 'Wait for first-boot setup (cloud-init)' first_boot_wait
}
ensure_tools() {
  local missing= tool
  for tool in git curl openssl; do command -v "$tool" >/dev/null || missing="$missing $tool"; done
  missing=${missing# }
  [[ -n $missing && -n $pkg ]] || return 0
  [[ $family != macos || $pkg == brew ]] || return 0
  note "Missing: ${missing// /, }. $(pkg_label) can install $( [[ $missing == *' '* ]] && echo them || echo it)."
  offer "Install ${missing// /, } now?" "$install_deps" || return 0
  [[ $pkg == brew ]] || get_root || { check warn 'Packages' 'needs root or sudo · install them yourself'; return 0; }
  early_log; run_hint="Install them yourself ($(manual_install_hint "$missing")), then run this again."
  wait_for_first_boot
  # ca-certificates: minimal images lack it, and every HTTPS download needs it.
  if [[ $pkg == brew ]]; then run "Install ${missing// /, }" pkg_install $missing
  else run_attempts=2; run "Install ${missing// /, }" pkg_install $missing ca-certificates; run_attempts=1; fi
  run_hint=
  hash -r
}

# ---------- docker setup: offered, never silent ----------
# Asked before anything else is checked; with --yes only when --install-docker is given.
offer() { # question [flag]: asked when interactive; otherwise the flag decides
  if [[ $interactive == true ]]; then confirm "$1" y; else [[ ${2:-$install_docker} == true ]]; fi
}
as_root() { if [[ $EUID == 0 ]]; then "$@"; else sudo -n "$@"; fi; }
get_root() { # cache sudo credentials, asking for the password on the terminal
  [[ $EUID != 0 ]] || return 0
  command -v sudo >/dev/null || return 1
  ! sudo -n true 2>/dev/null || return 0
  [[ $interactive == true ]] || return 1
  out '\n'; sudo -v <&3 >&3 2>&3
}
no_root_hint() {
  if command -v sudo >/dev/null; then echo 'This needs root: run the installer with sudo rights, or as root.'
  else echo "sudo is not installed. Run the installer as root, or install sudo first (su -c '$(manual_install_hint sudo | sed 's/^sudo //')')."; fi
}
docker_log() { early_log; run_hint='Fix the issue, or install Docker yourself: https://docs.docker.com/engine/install/ — then run this again.'; }
# The `docker` command on some systems is Podman's look-alike, which can't run this stack.
podman_shim() { command -v docker >/dev/null && docker --version 2>/dev/null | grep -qi podman; }
have_docker() { command -v docker >/dev/null && ! podman_shim; }
docker_ready() { docker info >/dev/null 2>&1; }
docker_service() { # start, and start at boot
  case $init in
    systemd) as_root systemctl enable --now docker;;
    openrc) { as_root rc-update add docker default || true; } && as_root rc-service docker start;;
    runit) { [[ -e /var/service/docker ]] || as_root ln -s /etc/sv/docker /var/service/; } && as_root sv up docker;;
    service) as_root service docker start;;
    *) return 1;;
  esac
  local waited=0
  until docker_ready || as_root docker info >/dev/null 2>&1; do
    [[ $waited -lt 40 ]] || return 1
    sleep 1; waited=$((waited+1))
  done
}
docker_service_stopped() {
  case $init in
    systemd) ! systemctl is-active --quiet docker 2>/dev/null;;
    openrc) ! rc-service docker status >/dev/null 2>&1;;
    *) ! as_root docker info >/dev/null 2>&1;;
  esac
}
# Between retries: a Docker that stopped (out of memory, a restart) is started again if we may.
recover_docker() {
  have_docker || return 0
  docker_ready && return 0
  [[ $EUID == 0 ]] || sudo -n true 2>/dev/null || return 0
  docker_service >> "$log" 2>&1 || true
}
# Docker's own packages where Docker publishes them; the distribution's packages elsewhere.
docker_via_script() {
  local script; script=$(mktemp "${TMPDIR:-/tmp}/get-docker.XXXXXX")
  curl -fsSL --retry 3 https://get.docker.com -o "$script" && as_root sh "$script"; local status=$?
  rm -f "$script"; return $status
}
docker_ce_repo() { # RHEL rebuilds (Rocky, Alma, Oracle…): Docker's CentOS repository fits them
  as_root curl -fsSL --retry 3 https://download.docker.com/linux/centos/docker-ce.repo -o /etc/yum.repos.d/docker-ce.repo || return 1
  if [[ $pkg == dnf ]]; then as_root dnf install -y -q --allowerasing docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else as_root yum install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; fi
}
install_docker_engine() {
  case $os_id in ubuntu|debian|raspbian|fedora|centos|rhel) docker_via_script; return;; esac
  case $family in
    rhel) docker_ce_repo;;
    debian) pkg_install docker.io && { pkg_install docker-compose-v2 || pkg_install docker-compose-plugin || true; } \
              && { pkg_install docker-buildx || pkg_install docker-buildx-plugin || true; };;
    amzn) if [[ $os_version == 2 ]] && command -v amazon-linux-extras >/dev/null; then as_root amazon-linux-extras install -y docker; else pkg_install docker; fi;;
    azure) pkg_install moby-engine moby-cli && { pkg_install moby-compose moby-buildx || true; };;
    suse) pkg_install docker && { pkg_install docker-compose docker-buildx || pkg_install docker-compose || true; };;
    arch) pkg_install docker docker-compose docker-buildx;;
    alpine) pkg_install docker docker-cli-compose docker-cli-buildx;;
    void) pkg_install docker docker-compose;;
    *) return 1;;
  esac
}
docker_install_supported() {
  case $os_id in ubuntu|debian|raspbian|fedora|centos|rhel) return 0;; esac
  case $family in rhel|debian|amzn|azure|suse|arch|alpine|void) [[ -n $pkg ]];; *) return 1;; esac
}
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }
plugin_dir() { # system-wide when root is available, else this user's own Docker plugin folder
  if [[ $EUID == 0 ]] || sudo -n true 2>/dev/null; then echo /usr/local/lib/docker/cli-plugins; else echo "${DOCKER_CONFIG:-$HOME/.docker}/cli-plugins"; fi
}
place_plugin() { # file name
  local dir; dir=$(plugin_dir)
  chmod 755 "$1"
  # This script runs with umask 077, and sudo keeps it: set modes so every user's Docker can load the plugin.
  if [[ $dir == /usr/* ]]; then as_root sh -c 'umask 022; mkdir -p "$1" && chmod 755 "$1" "$(dirname "$1")" && cp "$2" "$1/$3" && chmod 755 "$1/$3"' _ "$dir" "$1" "$2"
  else mkdir -p "$dir" && cp "$1" "$dir/$2"; fi
  local status=$?; rm -f "$1"; return $status
}
# Official release binaries, checked against their published SHA-256 before use.
install_compose_plugin() {
  local a file url expected
  case $arch in x86_64|amd64) a=x86_64;; aarch64|arm64) a=aarch64;; armv7l) a=armv7;; armv6l) a=armv6;; ppc64le|s390x|riscv64) a=$arch;; *) return 1;; esac
  url=https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$a
  file=$(mktemp "${TMPDIR:-/tmp}/compose.XXXXXX")
  curl -fsSL --retry 3 "$url" -o "$file" && expected=$(curl -fsSL --retry 3 "$url.sha256" | awk '{print $1}') || { rm -f "$file"; return 1; }
  [[ -n $expected && $(sha256 "$file") == "$expected" ]] || { echo 'Checksum mismatch for docker-compose' >&2; rm -f "$file"; return 1; }
  place_plugin "$file" docker-compose
}
install_buildx_plugin() {
  local a version name file expected base
  case $arch in x86_64|amd64) a=amd64;; aarch64|arm64) a=arm64;; armv7l) a=arm-v7;; armv6l) a=arm-v6;; ppc64le|s390x|riscv64) a=$arch;; *) return 1;; esac
  version=$(curl -fsSLI --retry 3 -o /dev/null -w '%{url_effective}' https://github.com/docker/buildx/releases/latest | sed -n 's|.*/tag/\(v[0-9][0-9.]*\)$|\1|p')
  [[ -n $version ]] || return 1
  base=https://github.com/docker/buildx/releases/download/$version name=buildx-$version.linux-$a
  file=$(mktemp "${TMPDIR:-/tmp}/buildx.XXXXXX")
  curl -fsSL --retry 3 "$base/$name" -o "$file" \
    && expected=$(curl -fsSL --retry 3 "$base/checksums.txt" | awk -v f="$name" '$2 == f || $2 == "*" f {print $1}') || { rm -f "$file"; return 1; }
  [[ -n $expected && $(sha256 "$file") == "$expected" ]] || { echo 'Checksum mismatch for docker-buildx' >&2; rm -f "$file"; return 1; }
  place_plugin "$file" docker-buildx
}
setup_docker() {
  if [[ $family == other ]]; then return 0; fi
  if [[ $wsl == true ]] && ! have_docker; then
    note 'Docker is not available in this WSL distribution. Install Docker Desktop on Windows and turn on'
    note "Settings → Resources → WSL integration for this distribution, then run this again."
    return 0
  fi
  if [[ $family == macos ]]; then
    have_docker || ! command -v brew >/dev/null && return 0
    note 'Docker is not installed. Homebrew can install Docker Desktop.'
    offer 'Install Docker Desktop now with Homebrew?' || return 0
    brew install --cask docker <&3 >&3 2>&3 || fail 'Homebrew could not install Docker Desktop.' 'Install it from https://docs.docker.com/desktop/setup/install/mac-install/ and run this again.'
    open -a Docker || true
    note 'Finish Docker Desktop'"'"'s first-run screens; waiting for it to start (up to 5 minutes).'
    local waited=0; PATH="$PATH:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin"
    until docker info >/dev/null 2>&1 || [[ $waited -ge 300 ]]; do sleep 2; waited=$((waited+2)); done
    return 0
  fi
  if ! have_docker; then
    if podman_shim; then
      note '`docker` here is Podman'"'"'s compatibility command. Naruvi needs Docker Engine, which replaces it.'
    else
      note 'Docker is not installed.'
    fi
    if ! docker_install_supported; then
      case $family in
        nixos) note 'On NixOS set virtualisation.docker.enable = true; in configuration.nix, then rebuild.';;
        immutable) note 'This system is image-based. Docker usually ships with it: enable it, or use a general-purpose image.';;
      esac
      return 0
    fi
    case $os_id in ubuntu|debian|raspbian|fedora|centos|rhel) note "Docker's official script (get.docker.com) can install it on $os_name; it needs root.";;
      *) note "It can be installed with $(pkg_label) packages for $os_name; it needs root.";; esac
    offer 'Install Docker now?' || return 0
    get_root || fail 'Installing Docker needs root or sudo.' "$(no_root_hint)" 'Or install it yourself: https://docs.docker.com/engine/install/'
    docker_log
    wait_for_first_boot
    run_attempts=2; run 'Install Docker' install_docker_engine; run_attempts=1
    hash -r
  fi
  have_docker || return 0
  if ! docker_ready && docker_service_stopped; then
    offer 'The Docker service is not running. Start it now (and at boot)?' || return 0
    get_root || return 0
    docker_log; run_soft=true; run 'Start Docker' docker_service || true; run_soft=false
    docker_ready && { ensure_compose; return 0; }
  fi
  if ! docker_ready && [[ $EUID != 0 ]] && get_root && as_root docker info >/dev/null 2>&1; then
    if ! id -nG | tr ' ' '\n' | grep -qx docker; then
      if ! id -nG "$USER" 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
        offer "Let $USER use Docker without sudo (adds you to the docker group)?" || return 0
        docker_log; run 'Grant Docker access' grant_docker_group
      fi
      # The new group applies to new logins; use it for the rest of this run.
      if command -v sg >/dev/null; then
        docker() { sg docker -c "$(printf '%q ' docker "$@")"; }
        docker_relogin=true
      fi
    fi
  fi
  ensure_compose
}
grant_docker_group() {
  as_root groupadd -f docker 2>/dev/null || true
  if command -v usermod >/dev/null; then as_root usermod -aG docker "$USER"
  elif command -v addgroup >/dev/null; then as_root addgroup "$USER" docker
  else as_root gpasswd -a "$USER" docker; fi
}
# Docker without Compose v2 (distribution packages, older installs): add the plugin.
ensure_compose() {
  have_docker || return 0
  docker compose version >/dev/null 2>&1 && return 0
  [[ $family != macos ]] || return 0
  if command -v docker-compose >/dev/null; then note 'Only the old docker-compose v1 command is installed; Naruvi needs Compose v2.'
  else note 'Docker Compose v2 is missing.'; fi
  offer "Add the Compose plugin (official release, checksum verified, into $(plugin_dir))?" || return 0
  docker_log; run_attempts=3; run 'Add Docker Compose' install_compose_plugin; run_attempts=1
  docker compose version >/dev/null 2>&1 || check warn 'Docker Compose' "added to $(plugin_dir), but Docker doesn't load it"
}
# Building from source needs Buildx (the Dockerfile uses BuildKit cache mounts).
ensure_buildx() {
  docker buildx version >/dev/null 2>&1 && return 0
  [[ $family != macos ]] || return 0
  note 'Building the image needs the Docker Buildx plugin, which is missing.'
  offer "Add the Buildx plugin (official release, checksum verified, into $(plugin_dir))?" || return 0
  docker_log; run_attempts=3; run 'Add Docker Buildx' install_buildx_plugin; run_attempts=1
}
docker_relogin=false

# ---------- network, clock ----------
online() { [[ $(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null || true) =~ ^[1-5][0-9][0-9]$ ]]; }
clock_skew() { # seconds between this clock and GitHub's; empty when unknown
  local date remote
  date=$(curl -sSI --max-time 8 https://github.com 2>/dev/null | tr -d '\r' | sed -n 's/^[Dd]ate: //p' | head -n1)
  [[ -n $date ]] || return 0
  remote=$(date -u -d "$date" +%s 2>/dev/null || date -u -j -f '%a, %d %b %Y %H:%M:%S GMT' "$date" +%s 2>/dev/null) || return 0
  [[ $remote =~ ^[0-9]+$ ]] || return 0
  local skew=$(( $(date -u +%s) - remote )); [[ $skew -ge 0 ]] || skew=$((-skew))
  printf '%s' "$skew"
}

# ---------- DNS ----------
# Public DNS (over HTTPS) sees what Let's Encrypt sees; this machine's resolver may be cached,
# split-horizon or overridden in /etc/hosts. Falls back to the local resolver when offline.
valid_ip4() { [[ $1 =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; }
valid_ip6() { [[ $1 == *:* && $1 =~ ^[0-9a-fA-F:.]+$ ]]; }
doh() { # name type -> records of that type, space separated; fails when no public resolver answered
  local server body code=1
  case $2 in AAAA) code=28;; CAA) code=257;; esac
  command -v curl >/dev/null || return 1
  for server in https://cloudflare-dns.com/dns-query https://dns.google/resolve; do
    body=$(curl -fsS --max-time 6 -H 'accept: application/dns-json' "$server?name=$1&type=$2" 2>/dev/null) || continue
    [[ $body == *'"Status"'* ]] || continue
    printf '%s' "$body" | tr '{}' '\n\n' | grep -E "\"type\": ?$code," | sed -n 's/.*"data": \{0,1\}"\(.*\)".*/\1/p' | tr '\n' ' '
    return 0
  done
  return 1
}
lookup() { # name A|AAAA -> addresses, space separated
  local found
  if found=$(doh "$1" "$2"); then printf '%s' "$found"; return 0; fi
  if command -v getent >/dev/null; then
    if [[ $2 == A ]]; then getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' '
    else getent ahostsv6 "$1" 2>/dev/null | awk '{print $1}' | grep -v '^::ffff:' | sort -u | tr '\n' ' '; fi
  elif command -v dig >/dev/null; then dig +short "$1" "$2" 2>/dev/null | grep -E '^[0-9a-fA-F:.]+$' | tr '\n' ' '
  elif command -v host >/dev/null; then host -t "$2" "$1" 2>/dev/null | awk '/address/ {print $NF}' | tr '\n' ' '
  fi
  return 0
}
public_ip() { # 4|6 -> this machine's address as the internet sees it
  local ip
  command -v curl >/dev/null || return 0
  ip=$(curl -"$1" -fsS --max-time 5 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | sed -n 's/^ip=//p' | head -n1 || true)
  if [[ $1 == 4 ]]; then valid_ip4 "$ip" || ip=$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null | head -n1 || true); valid_ip4 "$ip" || ip=
  else valid_ip6 "$ip" || ip=$(curl -6 -fsS --max-time 5 https://api6.ipify.org 2>/dev/null | head -n1 || true); valid_ip6 "$ip" || ip=; fi
  printf '%s' "$ip"
}
ip4_number() { local IFS=.; set -- $1; echo $(( ($1 << 24) + ($2 << 16) + ($3 << 8) + $4 )); }
in_net4() { # address cidr
  local bits=${2#*/} mask
  mask=$(( bits == 0 ? 0 : (0xFFFFFFFF << (32 - bits)) & 0xFFFFFFFF ))
  [[ $(( $(ip4_number "$1") & mask )) == $(( $(ip4_number "${2%/*}") & mask )) ]]
}
in_any4() { # address cidr...
  local address=$1 net; shift
  valid_ip4 "$address" || return 1
  for net in "$@"; do ! in_net4 "$address" "$net" || return 0; done
  return 1
}
private_ip4() { in_any4 "$1" 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16; }
cloudflare_ip4() { # Cloudflare's published proxy ranges (https://www.cloudflare.com/ips-v4)
  in_any4 "$1" 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 \
    190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 \
    172.64.0.0/13 131.0.72.0/22
}
server_ip4= server_ip6= server_checked=false
find_server_addresses() {
  [[ $server_checked == false ]] || return 0
  server_checked=true
  server_ip4=$(public_ip 4); server_ip6=$(public_ip 6)
}
# CAA records may allow only other certificate authorities. They are inherited from parent domains.
caa_blocks_letsencrypt() {
  local name=$1 records
  while [[ $name == *.* ]]; do
    records=$(doh "$name" CAA 2>/dev/null | tr 'A-Z' 'a-z' | tr -d ' \\') || return 1
    if [[ -n $records ]]; then
      [[ $records == *issue* || $records == *6973737565* ]] || return 1
      [[ $records != *letsencrypt* && $records != *6c657473656e6372797074* ]]
      return
    fi
    name=${name#*.}
  done
  return 1
}
# dns_state: ok, missing, elsewhere, ipv6 (a stale AAAA), cloudflare (proxied), unknown (can't tell)
dns_state= dns_a= dns_aaaa=
dns_check() { # domain; draws the result
  local d=$1 mine address match=false
  dns_a=$(lookup "$d" A); dns_a=${dns_a% }; dns_aaaa=$(lookup "$d" AAAA); dns_aaaa=${dns_aaaa% }
  find_server_addresses
  mine=" $server_ip4 $server_ip6 $(local_addresses | tr '\n' ' ') "
  if [[ -z $dns_a && -z $dns_aaaa ]]; then
    dns_state=missing; check warn 'DNS' "$d does not resolve yet"; return
  fi
  for address in $dns_a; do [[ $mine != *" $address "* ]] || match=true; done
  local first=${dns_a%% *}
  if [[ -n $first ]] && cloudflare_ip4 "$first"; then
    dns_state=cloudflare; check warn 'DNS' "$d → Cloudflare proxy ($first)"
  elif [[ $match == true || ( -z $dns_a && " $dns_aaaa " == *" $server_ip6 "* && -n $server_ip6 ) ]]; then
    dns_state=ok
    if [[ -n $dns_aaaa ]]; then
      match=false; for address in $dns_aaaa; do [[ $mine != *" $address "* ]] || match=true; done
      [[ $match == true ]] || dns_state=ipv6
    fi
    if [[ $dns_state == ok ]]; then check ok 'DNS' "$d → ${dns_a:-$dns_aaaa} · this server"
    else check warn 'DNS' "$d → $dns_a, but AAAA $dns_aaaa is not this server"; fi
  elif [[ -z $server_ip4 && -z $server_ip6 ]]; then
    dns_state=unknown; check ok 'DNS' "$d → ${dns_a:-$dns_aaaa}"
    note "    Couldn't look up this server's public address to compare."
  else
    dns_state=elsewhere; check warn 'DNS' "$d → ${dns_a:-$dns_aaaa}"
    note "    This server is ${server_ip4:-$server_ip6}."
  fi
}
dns_advice() { # domain: what to change, as the record to create
  local d=$1
  case $dns_state in
    cloudflare)
      note "    The record is proxied, so Let's Encrypt reaches Cloudflare instead of this server. In Cloudflare, set"
      note '    it to "DNS only" (grey cloud) until the certificate is issued. You can proxy it again afterwards'
      note '    with SSL/TLS mode "Full (strict)".';;
    ipv6)
      note "    Let's Encrypt tries IPv6 first, so a wrong AAAA record blocks the certificate."
      if [[ -n $server_ip6 ]]; then note "    Point the AAAA record at $server_ip6, or delete it."
      else note '    This server has no public IPv6 address: delete the AAAA record.'; fi;;
    missing|elsewhere)
      local w=$(( ${#d} + 3 )); [[ $w -ge 24 ]] || w=24
      out '\n  %sCreate this record at your DNS provider%s %s(or change the existing one)%s\n' "$bold" "$reset" "$dim" "$reset"
      out '    %s%-6s %-*s %s%s\n' "$dim" 'Type' "$w" 'Name' 'Value' "$reset"
      local value='<public IPv4 of this server>'; [[ -z $server_ip4 ]] || value=$server_ip4
      out '    %-6s %-*s %s\n' 'A' "$w" "$d" "$value"
      [[ -z $server_ip6 ]] || out '    %-6s %-*s %s %s(optional)%s\n' 'AAAA' "$w" "$d" "$server_ip6" "$dim" "$reset"
      [[ -z $dns_aaaa || -n $server_ip6 ]] || note '    Delete its AAAA record: this server has no IPv6.'
      note '    Changes usually show within minutes; a brand-new name can take longer.';;
  esac
}
wait_for_dns() { # domain: recheck every 15 s, up to 15 minutes; any key stops
  local d=$1 started=$SECONDS left key frame=0
  out '\n'
  while [[ $((SECONDS - started)) -lt 900 ]]; do
    left=15
    while [[ $left -gt 0 ]]; do
      if fancy; then otter "$frame"; out '\r\033[2K  %s  Waiting for %s %snext check in %ss · any key stops%s' "$OTTER" "$d" "$dim" "$left" "$reset"
      elif [[ $left == 15 ]]; then out '  ... waiting for %s (press Enter to stop)\n' "$d"; fi
      if IFS= read -rsn1 -t 1 key <&3; then if fancy; then out '\r\033[2K'; fi; return 1; fi
      left=$((left-1)) frame=$((frame+10))
    done
    if fancy; then out '\r\033[2K'; fi
    dns_check "$d" >/dev/null 2>&1 3>/dev/null || true
    if [[ $dns_state == ok || $dns_state == unknown ]]; then dns_check "$d"; return 0; fi
  done
  if fancy; then out '\r\033[2K'; fi
  return 1
}
# Hosted: DNS must reach this server before Let's Encrypt can issue. Interactively, help fix it here.
DOMAIN_CHANGED=false
review_dns() {
  DOMAIN_CHANGED=false
  if [[ $mode != hosted ]]; then # behind a proxy, the record points at the proxy, wherever it runs
    dns_a=$(lookup "$domain" A); dns_a=${dns_a% }
    if [[ -n $dns_a ]]; then check ok 'DNS' "$domain → $dns_a"
    else check warn 'DNS' "$domain does not resolve yet · point it at your proxy"; fi
    return 0
  fi
  dns_check "$domain"
  if caa_blocks_letsencrypt "$domain"; then
    check warn 'CAA' "the domain's CAA records don't allow Let's Encrypt"
    note '    Add a CAA record: 0 issue "letsencrypt.org" (or remove the CAA records).'
  fi
  [[ $dns_state != ok && $dns_state != unknown ]] || { behind_nat_note; return 0; }
  dns_advice "$domain"
  if [[ $interactive == false ]]; then
    note '    Installing anyway: the HTTPS certificate follows once DNS points here.'; return 0
  fi
  while true; do
    choose 'Check again|I changed the record.' \
           'Wait for it|Check every 15 seconds until it points here.' \
           'Continue anyway|Install now. The certificate follows by itself once DNS is right.' \
           'Use another domain|Type a different hostname.'
    case $CHOICE in
      1) dns_check "$domain";;
      2) wait_for_dns "$domain" || check warn 'DNS' "still not pointing here · you can keep going";;
      3) return 0;;
      4) DOMAIN_CHANGED=true; return 0;;
    esac
    if [[ $dns_state == ok || $dns_state == unknown ]]; then behind_nat_note; return 0; fi
    dns_advice "$domain"
  done
}
# DNS points at a public address this machine doesn't own: normal on clouds, a router forward at home.
behind_nat_note() {
  [[ $mode == hosted && -n $server_ip4 ]] || return 0
  local mine; mine=" $(local_addresses | tr '\n' ' ') "
  [[ $mine != *" $server_ip4 "* ]] || return 0
  [[ -z $cloud ]] || return 0
  local lan; lan=$(local_addresses | while read -r a; do private_ip4 "$a" && echo "$a"; done | head -n1)
  [[ -n $lan ]] || return 0
  note "    This machine is behind a router ($lan). Forward TCP 80 and 443 on it to $lan."
}

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

# ---------- small servers, rootless Docker, SELinux: offered, never silent ----------
mem_mb= add_swap=false
plan_swap() { # building on a small server without swap is the usual cause of a killed build
  [[ $use_image == false && -r /proc/meminfo && -n $mem_mb ]] || return 0
  local swap_mb; swap_mb=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
  [[ $mem_mb -lt 2800 && ${swap_mb:-0} -lt 1024 && ! -e /swapfile ]] || return 0
  note "Building the image with ${mem_mb} MB of memory and no swap can run out of memory."
  if ! offer 'Add a 2 GB swap file (/swapfile) for the build?' "$want_swap"; then
    check warn 'Swap' 'none · pass --swap, or add some if the build is killed'; return 0
  fi
  if get_root; then add_swap=true; check ok 'Swap' '2 GB swap file, added when the install starts'
  else check warn 'Swap' 'needs root or sudo · add swap yourself if the build is killed'; fi
}
make_swap() {
  as_root sh -c 'fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null
    chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile &&
    { grep -q "^/swapfile " /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab; }'
}
low_ports=false
plan_low_ports() { # rootless Docker can't listen on 80 and 443 unless the kernel allows it
  docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -q rootless || return 0
  local start; start=$(sysctl -n net.ipv4.ip_unprivileged_port_start 2>/dev/null || echo 1024)
  [[ $start =~ ^[0-9]+$ && $start -gt 80 ]] || return 0
  note 'Docker runs rootless here, and the kernel keeps ports below 1024 for root.'
  if offer 'Let it use ports 80 and 443 (sysctl net.ipv4.ip_unprivileged_port_start=80)?' "$want_firewall" && get_root; then
    low_ports=true; check ok 'Rootless ports' '80 and 443 allowed when the install starts'
  else check warn 'Rootless ports' 'ports 80 and 443 stay closed to rootless Docker'; fi
}
apply_low_ports() {
  as_root sh -c 'sysctl -q -w net.ipv4.ip_unprivileged_port_start=80 && echo "net.ipv4.ip_unprivileged_port_start=80" > /etc/sysctl.d/99-naruvi-ports.conf'
}
selinux_label() { # SELinux confines containers: let the gateway read its bind-mounted Caddyfile
  [[ -f $root/Caddyfile ]] && command -v chcon >/dev/null || return 0
  docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -q selinux || return 0
  chcon -t container_file_t "$root/Caddyfile" 2>/dev/null || true
}
say_problem() { out '  %s%s%s %s\n' "$red" "$bad" "$reset" "$1"; }

# ======================================================================
started_at=$SECONDS
banner
[[ $preview == false ]] || note 'Preview: nothing is downloaded, written or started.'
detect_system
root_given=${root:+yes}
root=${root:-"$HOME/.local/share/naruvi"}
# Snap's Docker can't see hidden folders in the home directory, ~/.local included.
snap_docker=false
if [[ -z $root_given && $(command -v docker 2>/dev/null || true) == /snap/* ]]; then snap_docker=true root=$HOME/naruvi; fi

# An installation that was interrupted leaves `.installing` behind (the version, then whether the
# published image is used). With its secrets already written it is resumed with the same settings,
# so a database that may already exist keeps its password. Before that point nothing was started,
# and the installer's own files are cleared for a clean start.
resume=false
saved() { sed -n "s/^$1=//p" "$root/.env" | tail -n1; }
if [[ $preview == false && -f $root/.installing ]]; then
  if [[ -f $root/.env && -x $root/naruvi && -n $(saved SETTINGS_ENCRYPTION_KEY) && -n $(saved NARUVI_MODE) ]]; then
    resume=true
    mode=$(saved NARUVI_MODE) url=$(saved NARUVI_URL) domain=$(saved NARUVI_DOMAIN) port=$(saved NARUVI_PORT) bind=$(saved NARUVI_BIND)
    ref=$(sed -n 1p "$root/.installing")
    out '\n  %s%s Picking up the unfinished installation%s in %s\n' "$yellow" "$warn" "$reset" "$root"
    note 'Same settings and secrets as before. Nothing is asked again.'
  else
    rm -rf "$root/source" "$root/.env" "$root/naruvi" "$root/trusted-signers" "$root/install.log" "$root/Caddyfile" \
           "$root/compose.yaml" "$root/build.yaml" "$root/local.yaml" "$root/hosted.yaml" "$root/proxy.yaml" \
           "$root/.image" "$root/.image-error" "$root/.installing"
  fi
fi

# Re-running against a finished installation changes nothing: it says how it is doing and points to the manager.
if [[ $preview == false && $resume == false && -f $root/.env && -x $root/naruvi ]]; then
  out '\n  %s%s Naruvi is already installed%s in %s\n\n' "$green" "$ok" "$reset" "$root"
  if ! docker info >/dev/null 2>&1; then check warn 'Docker' "not running · start it, then: $root/naruvi start"
  elif [[ -n $(cd "$root" && docker compose ps -q --status running app 2>/dev/null) ]]; then check ok 'Running' "$(saved NARUVI_URL)"
  else check warn 'Not running' "start it with: $root/naruvi start"; fi
  out '\n'
  kv 'Status' "$root/naruvi status"
  kv 'Check' "$root/naruvi doctor"
  kv 'Owner link' "$root/naruvi setup-link"
  kv 'Update' "$root/naruvi update"
  kv 'All commands' "$root/naruvi help"
  out '\n'
  exit 0
fi

# ---------- 1. preflight ----------
step 1 'Check this machine'
case $arch in
  x86_64|amd64|aarch64|arm64) check ok 'System' "$(system_summary)";;
  *) check warn 'System' "$(system_summary)"
     note "    No published image for $arch: the image is built here, which is slow. A 64-bit OS is recommended.";;
esac
if [[ $preview == true ]]; then note 'Skipped in preview.'
else
  [[ $snap_docker == false ]] || note "    Docker from Snap can't read hidden folders, so Naruvi goes into $root."
  ensure_tools
  setup_docker
  problems=0 net_problem=false
  for tool in docker git openssl curl; do
    if [[ $tool == docker ]] && podman_shim; then check bad docker "Podman's look-alike · Docker Engine is needed"; problems=1
    elif command -v "$tool" >/dev/null; then
      if [[ $tool == openssl ]]; then check ok openssl "$(openssl version 2>/dev/null | cut -d' ' -f1-2)"
      else check ok "$tool" "$("$tool" --version 2>/dev/null | head -n1 | cut -c1-38)"; fi
    elif [[ $tool == curl ]]; then check warn curl 'not installed · address and DNS checks are skipped'
    else check bad "$tool" 'not installed'; problems=1; fi
  done
  if have_docker; then
    if docker_ready; then check ok 'Docker engine' "running$(docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -q rootless && echo ' · rootless' || true)"
    else check bad 'Docker engine' 'not running or no permission'; problems=1; fi
    if docker compose version >/dev/null 2>&1; then check ok 'Docker Compose' "$(docker compose version --short 2>/dev/null || echo v2)"
    else check bad 'Docker Compose' 'v2 plugin missing'; problems=1; fi
  fi
  if command -v curl >/dev/null; then
    if online https://github.com; then check ok 'Internet' 'github.com reachable'
    elif [[ -n ${NARUVI_SOURCE_DIR:-} ]]; then check warn 'Internet' "github.com can't be reached · installing from the local copy"
    else check bad 'Internet' "github.com can't be reached"; problems=1 net_problem=true; fi
    skew=$(clock_skew)
    if [[ -n $skew && $skew -gt 300 ]]; then
      check warn 'Clock' "$((skew / 60)) minutes off · HTTPS and signature checks fail"
      if [[ $init == systemd ]]; then note '    Fix it with: sudo timedatectl set-ntp true'; else note '    Turn on time synchronisation (NTP), then run this again.'; fi
    fi
  fi
  probe=$root; while [[ ! -d $probe ]]; do probe=$(dirname "$probe"); done
  free_gb=$(df -Pk "$probe" 2>/dev/null | awk 'NR==2 {printf "%d", $4/1048576}')
  if [[ ${free_gb:-0} -ge 6 ]]; then check ok 'Disk space' "${free_gb} GB free"
  else check warn 'Disk space' "${free_gb:-?} GB free · about 6 GB recommended"; fi
  if [[ -r /proc/meminfo ]]; then mem_mb=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
  elif command -v sysctl >/dev/null; then mem_mb=$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%d", $1/1048576}'); fi
  if [[ -z $mem_mb ]]; then check warn 'Memory' 'unknown'
  elif [[ $mem_mb -ge 1900 ]]; then check ok 'Memory' "$(( (mem_mb + 512) / 1024 )) GB"
  else check warn 'Memory' "${mem_mb} MB · building from source needs about 2 GB"; fi
  if [[ $problems != 0 ]]; then
    hints=()
    if podman_shim; then
      hints+=('Docker: `docker` here is Podman. Install Docker Engine: https://docs.docker.com/engine/install/'
              "(on RHEL-family systems remove podman-docker first: sudo $pkg remove podman-docker).")
    elif ! command -v docker >/dev/null; then
      if [[ $wsl == true ]]; then hints+=('Docker: install Docker Desktop on Windows and turn on its WSL integration for this distribution.')
      else hints+=('Docker: https://docs.docker.com/engine/install/ (or run this again and accept the offer to install it).'); fi
    elif ! docker_ready; then
      case $init in
        systemd) hints+=('Docker engine: sudo systemctl enable --now docker');;
        openrc) hints+=('Docker engine: sudo rc-update add docker default && sudo rc-service docker start');;
        *) hints+=('Docker engine: start it (Linux: sudo service docker start · macOS, Windows: open Docker Desktop).');;
      esac
      hints+=('Permission denied? sudo usermod -aG docker $USER, then log out and back in.')
    elif ! docker compose version >/dev/null 2>&1; then
      hints+=('Docker Compose v2: run this again and accept the offer to add it, or see https://docs.docker.com/compose/install/linux/'
              '(the old docker-compose v1 command is not enough).')
    fi
    for tool in git openssl; do
      command -v "$tool" >/dev/null || hints+=("$tool: $(manual_install_hint "$tool")")
    done
    if [[ $net_problem == true ]]; then
      if command -v getent >/dev/null && ! getent hosts github.com >/dev/null 2>&1; then
        hints+=("Internet: this machine can't resolve github.com. Check its DNS settings (/etc/resolv.conf).")
      else hints+=('Internet: github.com is unreachable. Check the network, or set HTTPS_PROXY if you are behind a proxy.'); fi
    fi
    fail 'Install or start the missing pieces, then run this again.' "${hints[@]}"
  fi
  if [[ $resume == false ]]; then
    if [[ -n $(docker ps -aq --filter label=com.docker.compose.project=naruvi 2>/dev/null) ]]; then
      fail 'Containers of a Compose project named "naruvi" already exist on this Docker engine.' \
           'See them: docker ps -a --filter label=com.docker.compose.project=naruvi' \
           'An installed Naruvi: manage it with its `naruvi` command (or pass its folder with --dir).' \
           'A development checkout: stop it from that checkout (docker compose --profile full down keeps its data),' \
           'or install on another machine. One stack named "naruvi" runs per Docker engine.'
    fi
    # A database left by an earlier installation has that installation's password; new secrets can't open it.
    if docker volume inspect naruvi_db-data >/dev/null 2>&1; then
      fail 'A Naruvi database from an earlier installation is still on this Docker engine (volume naruvi_db-data).' \
           "To keep that data: put the earlier installation folder (or at least its .env) back, then run its \`naruvi start\`." \
           'To start over and DELETE that data for good: docker volume rm naruvi_db-data naruvi_assets'
    fi
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
if [[ $preview == false && $use_image == false ]]; then
  ensure_buildx
  if docker buildx version >/dev/null 2>&1; then check ok 'Docker Buildx' "$(docker buildx version 2>/dev/null | awk '{print $2}' | head -n1)"
  else check warn 'Docker Buildx' 'missing · the image build may fail'; fi
  [[ $resume == true ]] || plan_swap
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
mode_name() { case $1 in local) echo 'Local';; hosted) echo 'Hosted (built-in HTTPS)';; proxy) echo 'Behind your proxy';; esac; }
mode_label=$(mode_name "$mode")
check ok 'Mode' "$mode_label"
if [[ $mode == hosted && $preview == false && $resume == false ]]; then
  # Hosted runs its own gateway on 80 and 443. A proxy already there (Coolify, Traefik, nginx…) can
  # stay: Naruvi then sits behind it instead.
  for p in 80 443; do
    port_busy "$p" || continue
    owner=$(port_owner "$p")
    check bad "Port $p" "in use by $owner"
    if [[ $interactive == true ]]; then
      note '    Hosted mode runs its own HTTPS gateway on ports 80 and 443.'
      choose "Behind your proxy|Keep $owner and have it forward your domain to Naruvi." \
             'Stop here|Free ports 80 and 443 first (for example: sudo systemctl disable --now nginx), then run this again.'
      [[ $CHOICE == 1 ]] || fail "Port $p is in use by $owner." 'Free ports 80 and 443, then run the installer again.'
      mode=proxy mode_label=$(mode_name proxy)
      check ok 'Mode' "$mode_label"
      break
    fi
    fail "Port $p is already in use by $owner." \
      'Hosted mode needs ports 80 and 443 for HTTPS. Stop that program (for example: sudo systemctl disable --now nginx apache2),' \
      'or keep it and install with --mode proxy so it forwards your domain to Naruvi.'
  done
fi
if [[ $mode == hosted && $preview == false ]]; then plan_firewall; plan_low_ports; fi

# ---------- 3. details ----------
step 3 'Details'
if [[ $resume == true ]]; then note 'Kept from the unfinished installation.'
else
if [[ $mode != local ]]; then
  while true; do
    if [[ -z $domain ]]; then
      if [[ $mode == hosted ]]; then note "Its DNS A record should point at this server; it is checked right after."
      else note 'The address your proxy serves, such as careers.example.com.'; fi
      ask 'Domain, without https://' ''
      domain=$ANSWER
    fi
    domain=$(clean_domain "$domain")
    if ! valid_domain "$domain"; then
      [[ $interactive == true ]] || fail "$(domain_problem "$domain")"
      say_problem "$(domain_problem "$domain")"; domain=; continue
    fi
    url="https://$domain"
    [[ $preview == false ]] || break
    review_dns
    [[ $DOMAIN_CHANGED == true ]] || break
    domain=
  done
fi
if [[ $mode != hosted ]]; then
  default_port=3000
  while [[ $preview == false ]] && port_busy "$default_port" && [[ $default_port -lt 3010 ]]; do default_port=$((default_port+1)); done
  while true; do
    if [[ -z $port ]]; then
      if [[ $interactive == true ]]; then ask 'App port' "$default_port"; port=$ANSWER; else port=$default_port; fi
    fi
    problem=
    if ! valid_port "$port"; then problem='Choose a port from 1024 to 65535.'
    elif [[ $preview == false ]] && port_busy "$((10#$port))"; then problem="Port $port is already in use by $(port_owner "$((10#$port))")."; fi
    [[ -n $problem ]] || break
    [[ $interactive == true ]] || fail "$problem" 'Run the installer again and choose another port (or pass --port N).'
    say_problem "$problem"; port=
  done
  port=$((10#$port))
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
dir_problem() {
  if [[ $1 != /* ]]; then echo 'Use an absolute path for the installation directory.'
  elif [[ $preview == false && -f $1/.installing ]]; then echo "An unfinished installation is in $1. Pick it up with: bash install.sh --dir $1"
  elif [[ $preview == false && -e $1 && ! -d $1 ]]; then echo "$1 is a file. Choose a directory."
  elif [[ $preview == false && -e $1 && -n $(ls -A "$1" 2>/dev/null) ]]; then echo "$1 already has files in it. Choose an empty directory; existing settings and data are never overwritten."
  fi
}
while true; do
  if [[ $interactive == true ]]; then
    ask 'Install into' "$root"; root=$ANSWER
    [[ $root != '~'* ]] || root=$HOME${root#\~}
    root=${root%/}; root=${root:-/}
  fi
  problem=$(dir_problem "$root")
  [[ -n $problem ]] || break
  [[ $interactive == true ]] || fail "$problem"
  say_problem "$problem"
done
fi

# ---------- 4. review ----------
step 4 'Review'
kv 'Mode' "$mode_label"
kv 'Address' "$url"
case $mode in
  local) kv 'Reachable' 'only from this computer';;
  hosted) kv 'HTTPS' 'automatic certificates, renewal, HTTP → HTTPS'
          [[ $open_firewall == false ]] || kv 'Firewall' "open TCP 80 and 443 in $firewall"
          [[ $low_ports == false ]] || kv 'Ports' 'let rootless Docker use 80 and 443'
          [[ -z $cloud ]] || kv 'Cloud' "TCP 80 and 443 must be open in $(cloud_firewall)";;
  proxy) kv 'App listens' "$bind:$port"; kv 'Your proxy' "forward $domain → http://$( [[ $bind == 0.0.0.0 ]] && echo '<this-host>' || echo 127.0.0.1 ):$port";;
esac
kv 'Directory' "$root"
kv 'Version' "$ref"
if [[ $use_image == true ]]; then kv 'Image' 'published release, signature checked before use'
else kv 'Image' 'built on this machine from the source'; fi
[[ $add_swap == false ]] || kv 'Swap' 'add a 2 GB swap file (/swapfile)'
kv 'Access' 'one owner account, created from a private link'
out '\n'; note 'Secrets are generated on this machine and never leave it.'
if [[ $use_image == true ]]; then note 'Downloading the image takes a minute or two.'
else note 'Building the image takes 5 to 30 minutes, depending on this machine.'; fi
[[ $resume == true ]] || confirm 'Install now?' y || { out '\n  Nothing changed.\n\n'; exit 0; }

# ---------- 5. install ----------
step 5 'Install'
if [[ $preview == true ]]; then
  image_step='Build image'; [[ $use_image == false ]] || image_step='Download and verify image'
  for t in 'Download source' 'Generate secrets' "$image_step" 'Validate configuration' 'Start and migrate database' 'Reach the address'; do check ok "$t" 'preview'; done
  out '\n  %s%s Preview complete%s · a real install ends with your private setup link.\n\n' "$green" "$ok" "$reset"
  exit 0
fi
mkdir -p "$root"; chmod 700 "$root"
early=$log
log=$root/install.log; [[ $resume == true ]] || : > "$log"; chmod 600 "$log"
# What ran before the folder existed (packages, Docker) belongs in the same log.
if [[ $early != /dev/null && -f $early ]]; then cat "$early" >> "$log"; rm -f "$early"; fi
overlay=$mode.yaml
[[ $resume == true ]] || printf '%s\n' "$ref" > "$root/.installing"
[[ $open_firewall == false ]] || apply_firewall
if [[ $low_ports == true ]]; then run_soft=true; run 'Allow ports 80 and 443' apply_low_ports || true; run_soft=false; fi
if [[ $add_swap == true ]]; then run_soft=true; run 'Add swap' make_swap || true; run_soft=false; fi
clean_source() { rm -rf "$root/source"; }
if [[ $resume == true ]]; then check ok 'Source and secrets' 'kept'
else
if [[ -n ${NARUVI_SOURCE_DIR:-} ]]; then
  [[ -f $NARUVI_SOURCE_DIR/Dockerfile && -f $NARUVI_SOURCE_DIR/deploy/compose.yaml ]] || fail 'NARUVI_SOURCE_DIR must point to a Naruvi checkout.'
  mkdir "$root/source"
  run 'Copy local source' sh -c 'tar -C "$1" --exclude=.git --exclude=node_modules --exclude=.next --exclude=data --exclude=".env*" --exclude="*.log" -cf - . | tar -C "$2" -xf -' _ "$NARUVI_SOURCE_DIR" "$root/source"
else
  run_attempts=3 run_retry_hook=clean_source
  run 'Download source' git clone --depth 1 --branch "$ref" https://github.com/Eljakani/naruvi-app.git "$root/source"
  run_attempts=1 run_retry_hook=
fi
chmod -R go+rX "$root/source" # public code; the image runs as `node` and must read it despite umask 077
cp "$root/source/deploy/compose.yaml" "$root/compose.yaml"
cp "$root/source/deploy/build.yaml" "$root/build.yaml"
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
} > "$root/.env.new"
chmod 600 "$root/.env.new"
cp "$root/source/deploy/naruvi" "$root/naruvi"; chmod 700 "$root/naruvi"
# Keys that may sign release tags. Copied once; `naruvi update` never replaces it.
cp "$root/source/deploy/trusted-signers" "$root/trusted-signers"; chmod 600 "$root/trusted-signers"
mv "$root/.env.new" "$root/.env" # last: from here on a re-run resumes with these secrets
check ok 'Generate secrets' '.env, private to you'
fi
cd "$root"
selinux_label
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
[[ -z $(saved NARUVI_IMAGE) ]] || use_image=false # resumed after the image was chosen
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
if [[ -n $(saved NARUVI_IMAGE) ]]; then :
elif [[ -n $image ]]; then
  printf 'COMPOSE_FILE=compose.yaml:%s\nNARUVI_IMAGE=%s\n' "$overlay" "$image" >> "$root/.env"
else
  printf 'COMPOSE_FILE=compose.yaml:%s:build.yaml\nNARUVI_IMAGE=naruvi-app:source\n' "$overlay" >> "$root/.env"
fi
run 'Validate configuration' docker compose config --quiet
[[ $mode != hosted ]] || run 'Validate HTTPS gateway' docker compose run --rm --no-deps gateway caddy validate --config /etc/caddy/Caddyfile
if [[ $(saved NARUVI_IMAGE) == naruvi-app:source ]]; then
  [[ $use_image == false ]] || ensure_buildx # the published image fell through: building after all
  run_attempts=2; run 'Build image' docker compose build; run_attempts=1
fi
# Starts the database, applies migrations, then starts the app and worker; confirms the app answers
# inside its container and that every migration is recorded, or says why not. A failed start is
# retried once from scratch (containers recreated, data kept).
restart_stack() { docker compose down --remove-orphans; }
run_hint="Fix the issue above, then run the installer again (it picks up where it stopped) or: $root/naruvi start"
run_attempts=2 run_retry_hook=restart_stack
run 'Start and migrate database' "$root/naruvi" wait-ready
run_attempts=1 run_retry_hook= run_hint=
rm -f "$root/.installing"

# ---------- reach the address ----------
probe_url=$url/login
[[ $mode != proxy ]] || probe_url="http://127.0.0.1:$port/login"
answers() { [[ $(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "$probe_url" 2>/dev/null </dev/null || true) =~ ^[23] ]]; }
reach() { # seconds label: probe until the address answers
  local until=$((SECONDS + $1)) started=$SECONDS frame=0 tick
  if fancy; then out '\033[?25l'; fi
  while true; do
    if answers; then if fancy; then out '\r\033[2K\033[?25h'; fi; return 0; fi
    [[ $SECONDS -lt $until ]] || break
    for tick in 1 2 3 4 5 6 7 8 9 10; do
      if fancy; then otter "$frame"; out '\r\033[2K  %s  %s %s%ss%s' "$OTTER" "$2" "$dim" "$((SECONDS-started))" "$reset"; fi
      frame=$((frame+1)); (sleep 0.3) 2>/dev/null || true
    done
  done
  if fancy; then out '\r\033[2K\033[?25h'; fi
  return 1
}
# Let's Encrypt's own reason for the last failed certificate attempt ("Timeout during connect", "DNS problem: …").
cert_problem() { docker compose logs --no-color --tail=400 gateway 2>/dev/null </dev/null | grep -F '"challenge failed"' | tail -n1 | sed -n 's/.*"detail":"\([^"]*\)".*/\1/p' | cut -c1-240 || true; }
answers_locally() { [[ $(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 -H "Host: $domain" http://127.0.0.1/ 2>/dev/null </dev/null || true) =~ ^[23] ]]; }
retry_certificate() { docker compose restart gateway; }
restart_app() { docker compose up -d; }
explain_unreachable() {
  local detail
  case $mode in
    hosted)
      # Let's Encrypt says why it could not issue the certificate; a timeout while this machine answers
      # on port 80 itself means a firewall in front of it, which nothing on this server can open.
      detail=$(cert_problem)
      if [[ $detail =~ Timeout\ during\ connect|Connection\ refused|connection\ reset ]] && answers_locally; then
        note "The app is up and this server answers on port 80, but Let's Encrypt can't reach it from the internet:"
        note "  $detail"
        note "Something in front of this server drops TCP 80 and 443. Open both in $(cloud_firewall)."
        [[ -n $cloud ]] || note 'Some networks (university, lab, some home ISPs) block incoming web traffic entirely.'
        note 'The certificate follows within minutes. If you cannot open them, reinstall in "Behind your proxy" mode'
        note 'and publish Naruvi through a tunnel (Cloudflare Tunnel, Tailscale Funnel).'
      else
        note "The app itself is up. $url works once all of this is true:"
        note "  $bullet the DNS A record of $domain points at this server${server_ip4:+ ($server_ip4)} (AAAA only if it has IPv6)"
        note "  $bullet TCP 80 and 443 are open in this server's firewall and in $(cloud_firewall)"
        [[ -z $detail ]] || note "Let's Encrypt: $detail"
        note 'The certificate then arrives by itself within a few minutes.'
      fi;;
    proxy) note "The app itself is up, but nothing answers on $bind:$port.";;
    *) note "The app itself is up, but $url does not answer yet.";;
  esac
}
ready=false
if command -v curl >/dev/null; then
  [[ $mode != hosted ]] || note 'Requesting the HTTPS certificate; this can take a minute.'
  if reach "$( [[ $mode == hosted ]] && echo 120 || echo 60 )" "Reach $probe_url"; then ready=true
  elif [[ $mode == hosted ]]; then
    # Let's Encrypt saw DNS from before it was fixed and backs off; once DNS points here, ask again now.
    if [[ $(cert_problem) =~ DNS\ problem|NXDOMAIN|SERVFAIL|no\ valid\ A ]]; then
      dns_check "$domain" 3>/dev/null
      if [[ $dns_state == ok ]]; then run_soft=true; run 'Ask for the certificate again' retry_certificate || true; run_soft=false
        ! reach 90 "Reach $probe_url" || ready=true; fi
    fi
  else
    run_soft=true; run 'Restart Naruvi' restart_app || true; run_soft=false
    ! reach 30 "Reach $probe_url" || ready=true
  fi
  if [[ $ready == false && $interactive == true ]]; then
    tries=0
    while [[ $ready == false ]]; do
      check warn 'Reach the address' "no answer from ${probe_url%/login} yet"
      explain_unreachable
      if [[ $mode == hosted ]]; then
        choose 'Keep waiting|Check again for two more minutes.' \
               "Ask for the certificate again|Restarts the HTTPS gateway. Let's Encrypt allows a few failed tries per hour." \
               'Finish|Naruvi keeps running and keeps trying. Check later with: naruvi doctor'
      else
        choose 'Keep waiting|Check again for a minute.' \
               'Restart Naruvi|Recreate its containers. Your data is kept.' \
               'Finish|Naruvi keeps running. Check later with: naruvi doctor'
      fi
      case $CHOICE in
        1) ;;
        2) if [[ $mode == hosted ]]; then
             tries=$((tries+1))
             if [[ $tries -gt 3 ]]; then note "Several tries already: wait an hour before asking Let's Encrypt again."; continue; fi
             run_soft=true; run 'Ask for the certificate again' retry_certificate || true; run_soft=false
           else run_soft=true; run 'Restart Naruvi' restart_app || true; run_soft=false; fi;;
        *) break;;
      esac
      ! reach "$( [[ $mode == hosted ]] && echo 120 || echo 60 )" "Reach $probe_url" || ready=true
    done
  fi
  if [[ $ready == true ]]; then check ok 'Reach the address' "${probe_url%/login} answers"; else check warn 'Reach the address' "no answer from ${probe_url%/login} yet"; fi
else
  ready=true; check warn 'Reach the address' 'not tested (curl is not installed)'
fi
setup_link=
for attempt in 1 2 3; do
  setup_link=$(docker compose exec -T app node --import tsx scripts/setup-link.mts --raw 2>/dev/null </dev/null | grep -Eo 'https?://[^[:space:]]+/auth/setup\?token=[a-f0-9]{64}' | tail -n1 || true)
  [[ -z $setup_link ]] || break
  sleep 2
done
[[ -n $setup_link ]] || setup_link=$(docker compose logs --no-color app 2>/dev/null </dev/null | grep -Eo 'https?://[^[:space:]]+/auth/setup\?token=[a-f0-9]{64}' | tail -n1 || true)

# Offer a `naruvi` command on PATH without touching shell profiles.
linked=
if [[ -d $HOME/.local/bin && ! -e $HOME/.local/bin/naruvi && ! -L $HOME/.local/bin/naruvi ]] && confirm "Add the \`naruvi\` command to ~/.local/bin?" y; then
  ln -s "$root/naruvi" "$HOME/.local/bin/naruvi" && linked=yes
fi
cli="$root/naruvi"; [[ -z $linked ]] || cli=naruvi

# ---------- done ----------
elapsed=$((SECONDS - started_at))
out '\n'; rule
if [[ $ready == true ]]; then out '\n  %s%s Naruvi is ready%s  %sinstalled in %dm %02ds%s\n\n' "$green" "$ok" "$reset" "$dim" $((elapsed / 60)) $((elapsed % 60)) "$reset"
else
  out '\n  %s%s Naruvi is running, but %s does not answer yet%s\n' "$yellow" "$warn" "${probe_url%/login}" "$reset"
  explain_unreachable
  note 'To check again:'
  out '    %s doctor\n\n' "$cli"
fi
kv 'Open' "$url"
kv 'Installed in' "$root"
out '\n  %s1. Create your owner account%s\n' "$bold" "$reset"
if [[ -n $setup_link ]]; then
  note 'Private, one-time link, valid for 1 hour. Don'"'"'t share it or screenshot it.'
  out '\n     %s%s%s\n' "$copper" "$setup_link" "$reset"
  if [[ $mode == local && $interactive == true ]]; then
    opener=; command -v xdg-open >/dev/null && opener=xdg-open; command -v open >/dev/null && [[ $(uname) == Darwin ]] && opener=open
    [[ $wsl == false ]] || ! command -v wslview >/dev/null || opener=wslview
    if [[ -n $opener ]] && confirm 'Open it in your browser now?' y; then "$opener" "$setup_link" >/dev/null 2>&1 || true; fi
  fi
else
  note "Get your private link with:  $cli setup-link"
  note '(If an owner account already exists, just sign in.)'
fi
note "Link expired or lost? $cli setup-link makes a new one, as long as no owner exists."
out '\n  %s2. Then Naruvi walks you through your profile and AI model.%s\n' "$bold" "$reset"
out '\n  %sManage%s\n' "$bold" "$reset"
command_row "$cli status" 'what is running'
command_row "$cli doctor" 'check everything, and what to fix'
command_row "$cli logs" 'follow the logs'
command_row "$cli backup" 'database, files and keys'
command_row "$cli update" 'get the latest version'
command_row "$cli help" 'everything else'
if [[ $docker_relogin == true ]]; then
  out '\n'; note 'You were just added to the docker group: log out and back in before using these commands.'
fi
out '\n'; rule; out '\n'
exit 0
}
