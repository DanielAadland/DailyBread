#!/usr/bin/env bash
# Applies migrations to the hosted Supabase project and loads the seed data.
# Run from the repository root (CI does this on every push to main).
#
# Needs: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD
# Optional: SUPABASE_DB_URL (a full connection string; otherwise the session pooler URL is looked up)
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?Add the SUPABASE_ACCESS_TOKEN secret}"
: "${SUPABASE_PROJECT_REF:?Add the SUPABASE_PROJECT_REF secret}"
: "${SUPABASE_DB_PASSWORD:?Add the SUPABASE_DB_PASSWORD secret}"

echo "Applying migrations"
npx --yes supabase@2 link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
npx --yes supabase@2 db push --password "$SUPABASE_DB_PASSWORD" --yes

# The direct database host is IPv6-only; CI runners need the IPv4 session pooler.
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  pooler=$(curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/database/pooler")
  template=$(echo "$pooler" | jq -r '[.[] | select((.database_type // "PRIMARY") == "PRIMARY")][0] | (.connection_string // .connectionString)')
  if [ -z "$template" ] || [ "$template" = "null" ]; then
    echo "Could not look up the pooler connection string. Add a SUPABASE_DB_URL secret (Connect → Session pooler)." >&2
    exit 1
  fi
  password=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$SUPABASE_DB_PASSWORD")
  # Session mode (port 5432) suits psql and COPY.
  SUPABASE_DB_URL=$(echo "$template" | sed -e "s/\[YOUR-PASSWORD\]/$password/" -e 's/:6543\//:5432\//')
fi

echo "Loading reading plans"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/seed/plans.sql

for t in bsb web; do
  count=$(psql "$SUPABASE_DB_URL" -Atc "select count(*) from public.bible_verses where translation = '$t'")
  if [ "$count" = "0" ]; then
    echo "Loading Bible text: $t"
    psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "\\copy public.bible_verses (translation, book, book_order, chapter, verse, text) from 'supabase/seed/generated/bible_$t.tsv'"
  else
    echo "Bible text $t already loaded ($count verses)"
  fi
done
