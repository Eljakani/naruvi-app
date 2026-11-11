#!/usr/bin/env bash
# A slim otter sliding across a one-line progress bar.
# Usage: scripts/otter-progress.sh [seconds=4] [width=36]
set -euo pipefail

secs=${1:-4}
width=${2:-36}
fps=30
total=$((secs * fps))

rgb() { printf '\e[38;2;%d;%d;%dm' "$1" "$2" "$3"; }
R=$'\e[0m' D=$'\e[2m'
rust=$(rgb 196 92 52) cream=$(rgb 245 222 190) foam=$(rgb 200 235 250)

# Trail fades from deep water to light foam
grad=()
for ((c = 0; c < width; c++)); do
  grad+=("$(rgb $((30 + c * 120 / width)) $((80 + c * 140 / width)) $((140 + c * 100 / width)))")
done
ripple=(∼ ˜ ∼ ⁓)

tput civis 2>/dev/null || true
trap 'tput cnorm 2>/dev/null || true; printf "%s\n" "$R"' EXIT

for ((f = 0; f <= total; f++)); do
  pct=$((f * 100 / total))
  x=$((f * width / total))
  face="•ᴥ•"; ((f % 45 > 41)) && face="-ᴥ-"; ((pct == 100)) && face="^ᴥ^"

  bar=""
  for ((c = 0; c < x; c++)); do bar+="${grad[c]}─"; done
  otter="${foam}${ripple[f / 3 % 4]}${rust}(${cream}${face}${rust})${R}"
  rest=""
  for ((c = x; c < width; c++)); do rest+="${D}·${R}"; done

  printf '\r  %s%s%s  %s%3d%%%s' "$bar" "$otter" "$rest" "$D" "$pct" "$R"
  sleep "$(awk "BEGIN{print 1/$fps}")"
done
