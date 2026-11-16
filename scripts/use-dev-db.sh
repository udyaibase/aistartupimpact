#!/usr/bin/env bash
# Point local development at the Neon "dev" branch instead of production.
# Asks for the dev branch's POOLED connection string (input hidden), derives the direct one,
# and updates the local env files. Production URLs are removed from local files and saved
# to a private backup in your home folder (outside the project, never committed).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$HOME/.udyaibase-env-backup"
STAMP="$(date +%Y%m%d-%H%M%S)"
PROD_HOST="ep-restless-shadow"

printf 'Paste the dev branch POOLED connection string (hidden), then press Enter: '
# Neon's copied snippet can start with a blank line or span several lines: take the first line with the URL,
# then swallow whatever else was pasted so none of it runs as a shell command afterwards.
POOLED=""
while IFS= read -rs line; do
  if [[ "$line" == *postgres* ]]; then POOLED="$line"; break; fi
done
while IFS= read -rs -t 1 _rest; do :; done
echo

# Accept the string however Neon's Connect dialog copies it: bare, quoted, as DATABASE_URL='…', or as psql '…'.
POOLED="$(printf '%s' "$POOLED" | tr -d '\r\n' | sed -E "s/^[[:space:]]*(export[[:space:]]+)?[A-Z_]+[[:space:]]*=[[:space:]]*//; s/^psql[[:space:]]+//; s/^[\"']//; s/[\"'][[:space:]]*$//; s/[[:space:]]+$//")"

if [[ "$POOLED" != postgres://* && "$POOLED" != postgresql://* ]]; then
  echo "That doesn't look like a connection string (should start with postgresql://). Nothing changed."; exit 1
fi
if [[ "$POOLED" == *"$PROD_HOST"* ]]; then
  echo "That is the PRODUCTION database. Use the dev branch's string. Nothing changed."; exit 1
fi
if [[ "$POOLED" != *"-pooler"* ]]; then
  echo "That is not the pooled string (host should contain -pooler). In Neon Connect, turn 'Connection pooling' on and copy again. Nothing changed."; exit 1
fi
DIRECT="${POOLED/-pooler/}"

mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"

export POOLED DIRECT ROOT BACKUP_DIR STAMP
python3 - <<'PY'
import os, re
root, backup_dir, stamp = os.environ['ROOT'], os.environ['BACKUP_DIR'], os.environ['STAMP']
pooled, direct = os.environ['POOLED'], os.environ['DIRECT']
keys = ('DATABASE_URL', 'DIRECT_URL')
pat = re.compile(r'^\s*(?:export\s+)?(DATABASE_URL|DIRECT_URL)\s*=')

def backup(path, lines):
    name = os.path.relpath(path, root).replace('/', '__')
    out = os.path.join(backup_dir, f'{name}.{stamp}')
    with open(out, 'w') as f: f.write(''.join(lines))
    os.chmod(out, 0o600)

# Local development files: switch to the dev branch.
for rel in ['.env', 'packages/database/.env', 'apps/web/.env.local', 'apps/admin/.env.local']:
    path = os.path.join(root, rel)
    if not os.path.exists(path): continue
    lines = open(path).read().splitlines(keepends=True)
    backup(path, lines)
    seen, out = set(), []
    for line in lines:
        m = pat.match(line)
        if m:
            k = m.group(1); seen.add(k)
            out.append(f'{k}="{pooled if k == "DATABASE_URL" else direct}"\n')
        else:
            out.append(line)
    if out and not out[-1].endswith('\n'): out[-1] += '\n'
    for k in keys:
        if k not in seen and rel in ('.env', 'packages/database/.env'):
            out.append(f'{k}="{pooled if k == "DATABASE_URL" else direct}"\n')
    open(path, 'w').write(''.join(out))
    print(f'  updated  {rel}')

# .env.production on this laptop: remove the production database lines (kept in the backup).
path = os.path.join(root, '.env.production')
if os.path.exists(path):
    lines = open(path).read().splitlines(keepends=True)
    if any(pat.match(l) for l in lines):
        backup(path, lines)
        open(path, 'w').write(''.join(l for l in lines if not pat.match(l)))
        print('  removed production database lines from .env.production')
PY

host() { sed -E 's#^[a-z]+://[^@]*@([^/:?]+).*#\1#' <<<"$1"; }
echo
echo "Local development now uses:"
echo "  pooled: $(host "$POOLED")"
echo "  direct: $(host "$DIRECT")"
echo "Backups of the old files (including the production URLs): $BACKUP_DIR"
echo
# A schema-only branch has production's tables but not the rows in _prisma_migrations (those are data).
# The tables already match production, so record each migration as applied instead of re-running it.
cd "$ROOT/packages/database"
echo "Recording migrations on the dev branch (tables already match production)..."
for dir in prisma/migrations/*/; do
  name="$(basename "$dir")"
  [ -f "$dir/migration.sql" ] || continue
  npx prisma migrate resolve --applied "$name" >/dev/null 2>&1 && echo "  recorded $name" || echo "  already recorded $name"
done
echo
npx prisma migrate status
