#!/usr/bin/env bash
# llm-wiki lint: mechanical health checks over a wiki/ tree.
#
# Detects the issues the Lint section names that can be found without a model:
#   - broken [[wikilinks]] (target page does not exist)
#   - orphan pages (no inbound wikilink from any other page)
#   - source-less syntheses (pages under syntheses/ with no sources: frontmatter and no source links)
#   - stale frontmatter (updated: older than --stale-days, default 180)
#   - missing required frontmatter keys (type, status, updated)
#
# Semantic checks the model still owns (contradictions, weak citations,
# concepts missing pages, oversized pages) are listed but not auto-detected.
#
# Usage: references/lint.sh [WIKI_DIR] [--stale-days N]
#   WIKI_DIR defaults to ./wiki (falls back to . if ./wiki absent).
# Exit: 0 = clean, 1 = issues found, 2 = bad invocation.

set -euo pipefail

WIKI_DIR=""
STALE_DAYS=180
while [ $# -gt 0 ]; do
  case "$1" in
    --stale-days) STALE_DAYS="${2:?--stale-days needs a value}"; shift 2 ;;
    --stale-days=*) STALE_DAYS="${1#*=}"; shift ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) WIKI_DIR="$1"; shift ;;
  esac
done

if [ -z "$WIKI_DIR" ]; then
  if [ -d wiki ]; then WIKI_DIR=wiki; else WIKI_DIR=.; fi
fi
[ -d "$WIKI_DIR" ] || { echo "no such dir: $WIKI_DIR" >&2; exit 2; }
command -v rg >/dev/null 2>&1 || { echo "ripgrep (rg) is required" >&2; exit 2; }

issues=0
note() { issues=$((issues + 1)); printf '%s\n' "$1"; }
section() { printf '\n== %s ==\n' "$1"; }

# All markdown pages, relative to WIKI_DIR.
mapfile -t PAGES < <(cd "$WIKI_DIR" && rg --files -g '*.md' | sort)
[ "${#PAGES[@]}" -gt 0 ] || { echo "no markdown pages under $WIKI_DIR" >&2; exit 2; }

# Map basename-without-extension -> exists, for wikilink resolution.
declare -A PAGE_STEM
for p in "${PAGES[@]}"; do
  stem="$(basename "$p" .md)"
  PAGE_STEM["$stem"]=1
done

# ---- broken wikilinks ----
# [[Target]] and [[Target|Alias]] and [[Target#heading]] all resolve on Target.
section "broken wikilinks"
while IFS= read -r line; do
  file="${line%%:*}"
  rest="${line#*:}"
  # rest is "Target|alias" or "Target#h" possibly; strip alias and anchor.
  target="${rest%%|*}"; target="${target%%#*}"
  target="$(printf '%s' "$target" | sed -e 's/^ *//' -e 's/ *$//')"
  [ -n "$target" ] || continue
  if [ -z "${PAGE_STEM[$target]:-}" ]; then
    note "broken-link: $file -> [[$target]]"
  fi
done < <(cd "$WIKI_DIR" && rg -o -r '$1' '\[\[([^]]+)\]\]' -g '*.md' --no-line-number --with-filename | sort -u)

# ---- orphan pages (no inbound wikilink) ----
# index.md, log.md, inbox.md, open-questions.md are roots; never orphans.
section "orphan pages (no inbound links)"
ROOTS_RE='^(index|log|inbox|open-questions)$'
for p in "${PAGES[@]}"; do
  stem="$(basename "$p" .md)"
  [[ "$stem" =~ $ROOTS_RE ]] && continue
  # search every OTHER page for [[stem]] (optionally with |alias or #anchor)
  if ! (cd "$WIKI_DIR" && rg -q -g '*.md' "\[\[${stem}([]|#])" . 2>/dev/null) \
     && ! (cd "$WIKI_DIR" && rg -q -g '*.md' "\[\[${stem}\]\]" . 2>/dev/null); then
    note "orphan: $p"
  fi
done

# ---- source-less syntheses ----
section "source-less syntheses"
for p in "${PAGES[@]}"; do
  case "$p" in
    syntheses/*|*/syntheses/*) : ;;
    *) continue ;;
  esac
  full="$WIKI_DIR/$p"
  # has a non-empty sources: frontmatter value OR links into sources/ or raw/?
  if rg -q '^sources:\s*\S' "$full" 2>/dev/null; then continue; fi
  if rg -q '\[\[.*\]\]|\(\.\./|raw/|sources/' "$full" 2>/dev/null; then continue; fi
  note "source-less-synthesis: $p"
done

# ---- frontmatter: required keys + staleness ----
section "frontmatter (required keys + staleness)"
# epoch cutoff for staleness
if cutoff_epoch="$(date -d "-${STALE_DAYS} days" +%s 2>/dev/null)"; then :; else
  cutoff_epoch="$(date -v-"${STALE_DAYS}"d +%s 2>/dev/null || echo 0)"  # BSD/macOS
fi
for p in "${PAGES[@]}"; do
  full="$WIKI_DIR/$p"
  # frontmatter present?
  if ! rg -q '^---\s*$' "$full" 2>/dev/null; then
    note "no-frontmatter: $p"
    continue
  fi
  for key in type status updated; do
    rg -q "^${key}:\s*\S" "$full" 2>/dev/null || note "missing-frontmatter-key:$key: $p"
  done
  updated="$(rg -o -r '$1' '^updated:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})' "$full" 2>/dev/null | head -1 || true)"
  [ -n "$updated" ] || continue
  if u_epoch="$(date -d "$updated" +%s 2>/dev/null)"; then :; else
    u_epoch="$(date -j -f %Y-%m-%d "$updated" +%s 2>/dev/null || echo "")"
  fi
  [ -n "$u_epoch" ] || continue
  if [ "$u_epoch" -lt "$cutoff_epoch" ]; then
    note "stale (>${STALE_DAYS}d, updated $updated): $p"
  fi
done

section "model-owned checks (not auto-detected)"
cat <<'EOF'
Run these by hand or via the critic subagent:
  - contradictions across pages
  - weak citations / unsupported assertions
  - concepts mentioned repeatedly but missing pages
  - oversized pages that need splitting
  - source notes not reflected in syntheses
EOF

printf '\n----\n'
if [ "$issues" -eq 0 ]; then
  echo "lint clean: 0 mechanical issues across ${#PAGES[@]} pages"
  exit 0
fi
echo "lint found $issues mechanical issue(s) across ${#PAGES[@]} pages"
exit 1
