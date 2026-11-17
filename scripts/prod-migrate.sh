#!/usr/bin/env bash
# Run Prisma migrations against the PRODUCTION database from one terminal command.
#   ./scripts/prod-migrate.sh          -> read-only: shows what is pending (prisma migrate status)
#   ./scripts/prod-migrate.sh deploy   -> applies pending migrations (asks you to type DEPLOY first)
# Asks for the production pooled and direct connection strings (input hidden). They live only inside this
# script's process: never written to a file, never printed (only the host names are shown).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROD_HOST="ep-restless-shadow"
MODE="${1:-status}"

clean() {
  # Accept the string however Neon copies it: bare, quoted, as DATABASE_URL='…', or as psql '…'.
  printf '%s' "$1" | tr -d '\r\n' | sed -E "s/^[[:space:]]*(export[[:space:]]+)?[A-Z_]+[[:space:]]*=[[:space:]]*//; s/^psql[[:space:]]+//; s/^[\"']//; s/[\"'][[:space:]]*$//; s/[[:space:]]+$//"
}
host_of() { printf '%s' "$1" | sed -E 's#.*@([^/:?]+).*#\1#'; }
db_of() { printf '%s' "$1" | sed -E 's#^[^@]*@[^/]*/([^?]*).*#\1#'; }

printf 'Paste the PRODUCTION POOLED connection string (pooling ON, hidden), then Enter: '
IFS= read -rs POOLED; echo
printf 'Paste the PRODUCTION DIRECT connection string (pooling OFF, hidden), then Enter: '
IFS= read -rs DIRECT; echo
POOLED="$(clean "$POOLED")"; DIRECT="$(clean "$DIRECT")"

PH="$(host_of "$POOLED")"; DH="$(host_of "$DIRECT")"
PD="$(db_of "$POOLED")"; DD="$(db_of "$DIRECT")"
echo "Pooled host: $PH   database: $PD"
echo "Direct host: $DH   database: $DD"
[[ "$PD" != prisma_migrate_shadow* && "$DD" != prisma_migrate_shadow* ]] || { echo "STOP: that is Prisma's leftover shadow database, not your app's. In Neon's Connect dialog choose Database: neondb and copy again. Nothing changed."; exit 1; }
[[ "$PD" == "neondb" && "$DD" == "neondb" ]] || { echo "STOP: expected database neondb (your app's database). Choose it in Neon's Connect dialog and copy again. Nothing changed."; exit 1; }
[[ "$POOLED" == postgres* && "$DIRECT" == postgres* ]] || { echo "STOP: a string doesn't start with postgresql://. Copy the plain connection string. Nothing changed."; exit 1; }
[[ "$PH" == *"$PROD_HOST"* && "$DH" == *"$PROD_HOST"* ]] || { echo "STOP: these are not the production ($PROD_HOST) strings. Nothing changed."; exit 1; }
[[ "$PH" == *-pooler* ]] || { echo "STOP: the first string should be the POOLED one (host contains -pooler). Nothing changed."; exit 1; }
[[ "$DH" != *-pooler* ]] || { echo "STOP: the second string should be the DIRECT one (no -pooler). Nothing changed."; exit 1; }

export DATABASE_URL="$POOLED" DIRECT_URL="$DIRECT"
cd "$ROOT/packages/database"

if [[ "$MODE" == "diff" ]]; then
  # Read-only: the SQL that would make production match prisma/schema.prisma (nothing is run).
  OUT="${DIFF_OUT:-$HOME/udyaibase-prod-schema-diff.sql}"
  npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script > "$OUT"
  echo
  echo "Differences written to $OUT ($(grep -c . "$OUT") lines). Nothing was changed."
  grep -E '^(CREATE|ALTER|DROP)' "$OUT" | cut -c1-140 || echo "(no differences)"
  exit 0
fi

if [[ "$MODE" == "deploy" ]]; then
  echo
  npx prisma migrate status || true
  echo
  printf 'This APPLIES the pending migrations above to PRODUCTION. Type DEPLOY to continue: '
  read -r CONFIRM
  [[ "$CONFIRM" == "DEPLOY" ]] || { echo "Cancelled. Nothing changed."; exit 1; }
  npx prisma migrate deploy
  echo
  npx prisma migrate status
else
  npx prisma migrate status
fi
