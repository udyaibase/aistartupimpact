#!/usr/bin/env bash
# Measures public page speed and caching. Usage: scripts/perf-check.sh [base-url]
# Each page is fetched twice: the second request shows whether it is served from Vercel's cache.
set -euo pipefail

BASE="${1:-https://udyaibase.com}"
UA="Mozilla/5.0 (udyaibase perf-check)"
HDRS="$(mktemp)"
trap 'rm -f "$HDRS"' EXIT

LIST_PAGES=(/ /stories /tools /startups /funding /events /jobs /india-ai)

detail_page() {
  curl -s -A "$UA" "$BASE$1" | grep -oE "href=\"$1/[a-z0-9-]{4,}\"" \
    | grep -vE "/(category|compare|submit|alternatives|company)" | head -1 | sed -E 's/href="([^"]+)"/\1/' || true
}

header() { grep -i "^$1:" "$HDRS" | head -1 | cut -d' ' -f2- | tr -d '\r'; }

measure() {
  local path="$1" run="$2" line
  line=$(curl -s -o /dev/null -D "$HDRS" -A "$UA" \
    -w "%{http_code} %{time_starttransfer} %{time_total} %{size_download}" "$BASE$path")
  read -r code ttfb total size <<<"$line"
  printf "%-58s #%s %s ttfb=%6.3fs total=%6.3fs size=%8s cache=%-7s region=%-14s cc=%s\n" \
    "$path" "$run" "$code" "$ttfb" "$total" "$size" "$(header x-vercel-cache)" \
    "$(header x-vercel-id | cut -d: -f1-3 | cut -d- -f1)" "$(header cache-control)"
}

echo "== HTML ($BASE) =="
pages=("${LIST_PAGES[@]}")
for p in /stories /tools /startups /events /jobs; do
  d=$(detail_page "$p"); [ -n "$d" ] && pages+=("$d")
done
for p in "${pages[@]}"; do measure "$p" 1; measure "$p" 2; done

echo
echo "== In-app navigation payload (RSC) =="
for p in "${LIST_PAGES[@]}"; do
  curl -s -o /dev/null -H "RSC: 1" -A "$UA" \
    -w "$(printf '%-12s' "$p") ttfb=%{time_starttransfer}s total=%{time_total}s size=%{size_download}\n" \
    "$BASE$p?_rsc=perfcheck"
done
