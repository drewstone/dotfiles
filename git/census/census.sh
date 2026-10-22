#!/usr/bin/env bash
# Logic-file sizes across this host's tangle-network and drewstone clones, each at its fetched default branch (60 s cap
# per fetch), classified by `census files` exactly as loc-ratchet classifies a commit.
# Writes <out>/files.tsv (repo, path, lines) and <out>/attr-exempt.tsv (files marked generated or vendored).
# Usage: census.sh [out-dir]   (default ~/.local/state/agent-work/loc-census)
set -u
here="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
OUT="${1:-$HOME/.local/state/agent-work/loc-census}"
mkdir -p "$OUT"
: > "$OUT/files.tsv.tmp"; : > "$OUT/attr-exempt.tsv.tmp"
declare -A seen
for d in ~/code/* ~/code/*/* ~/webb/* ~/company/* ~/company/*/*; do
  [ -e "$d/.git" ] || continue
  u=$(git -C "$d" remote get-url origin 2>/dev/null) || continue
  case "$u" in *tangle-network/*|*drewstone/*) ;; *) continue;; esac
  r=$(basename "$u" .git); [ -n "${seen[$r]:-}" ] && continue
  b=$(git -C "$d" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || true); b=${b:-origin/main}
  git -C "$d" rev-parse -q --verify "$b" >/dev/null || { b=origin/master; git -C "$d" rev-parse -q --verify "$b" >/dev/null || continue; }
  timeout 60 git -C "$d" fetch -q origin "${b#origin/}" 2>/dev/null
  seen[$r]=1
  "$here/census" files "$d" "$b" 2>/dev/null | awk -F'\t' -v r="$r" -v out="$OUT" \
    '$3=="exempt" {print r"\t"$1"\t"$2 >> (out "/attr-exempt.tsv.tmp"); next} {print r"\t"$1"\t"$2 >> (out "/files.tsv.tmp")}'
done
mv "$OUT/files.tsv.tmp" "$OUT/files.tsv"; mv "$OUT/attr-exempt.tsv.tmp" "$OUT/attr-exempt.tsv"
awk -F'\t' '{t[$1]+=$3; f[$1]++; if($3>1000){a[$1]++; al[$1]+=$3} if($3>1500){b[$1]++}} END{for(r in f) if(a[r]>0) printf "%s\t%d\t%d\t%d\t%d\t%d\n", r, f[r], t[r], a[r], b[r], al[r]}' "$OUT/files.tsv" | sort -t$'\t' -k4,4nr > "$OUT/repos.tsv"
echo "repos scanned: $(cut -f1 "$OUT/files.tsv" | sort -u | wc -l), logic files: $(wc -l < "$OUT/files.tsv")"
awk -F'\t' '$3>1000{a++; al+=$3} $3>1500{b++} {t+=$3} END{print "files>1000:", a, " files>1500:", b, " lines in files>1000:", al, " of total:", t}' "$OUT/files.tsv"
