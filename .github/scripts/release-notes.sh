#!/usr/bin/env bash
# Uso: release-notes.sh <tag-anterior>. Imprime commits e issues resolvidas desde a tag anterior.
set -euo pipefail
prev="${1:-}"
range="${prev:+$prev..}HEAD"
since=$([ -n "$prev" ] && git log -1 --format=%cI "$prev" || echo 1970-01-01T00:00:00Z)

repo="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
declare -A login_of

echo "## O que mudou"
echo
count=0
while IFS=$'\t' read -r sha email name subject; do
  [[ "$subject" == chore\(release\)* ]] && continue
  if [ -z "${login_of[$email]+x}" ]; then
    login=$(gh api "repos/$repo/commits/$sha" --jq '.author.login // empty' 2>/dev/null || true)
    login_of[$email]="${login:+@$login}"
  fi
  echo "- $subject — ${login_of[$email]:-$name}"
  count=$((count + 1))
done < <(git log "$range" --no-merges --format='%H%x09%ae%x09%an%x09%s')
[ "$count" -gt 0 ] || echo "- Sem commits novos"

issues=$(gh issue list --state closed --limit 100 --search "closed:>$since reason:completed" \
  --json number,title,author --jq '.[] | "- #\(.number) \(.title | gsub("@"; "@​") | gsub("[\\[\\]<>]"; "")) (reportada por @\(.author.login))"')
if [ -n "$issues" ]; then
  echo
  echo "## Issues resolvidas"
  echo
  echo "$issues"
fi

echo
echo "Obrigado a todo mundo que contribuiu, reportou bugs e sugeriu ideias nesta versão! 💜"
