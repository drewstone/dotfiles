# Codex reviews arrive minutes after a PR opens, and agents merged without reading them:
# dotfiles#465 merged 22 s after it opened while its review ran, and the review's two
# P2 findings landed 6 minutes after the merge. Of the 42 completed Codex reviews on dotfiles from
# 2026-10-11 to 10-15, 20 finished after their PR merged.
# Before a merge (or --auto), one GraphQL query reads the PR's head, review threads and comments:
# - a review thread a Codex reviewer started, unresolved and with no reply from a non-bot account,
#   refuses the merge and names the finding;
# - a Codex Review Summary showing a review running on the head waits up to GH_DREW_REVIEW_WAIT
#   seconds, re-reading once a minute, then refuses (exit 75: merge again once it finishes);
# - a PR that opened or turned ready under 30 s ago with no Codex comment yet waits for the rest of
#   those 30 s: Codex posts its summary 12 s (median) to 16 s (90th percentile) after either, and 9
#   of 44 dotfiles reviews from 10-11 to 10-15 started after a merge made 3 to 12 s after it;
# - no Codex comment, a usage-limit comment, a failed review, or a completed review with every
#   finding answered carries on.
# The default wait is 600 s: those 42 reviews took 232 s at the median and 603 s at the 90th
# percentile from start to finish, and a merge comes at least one gate after the review starts.
# GH_DREW_REVIEW_OVERRIDE=<reason> merges without the check; the reason is logged. A host-wide override is the
# file ~/.config/gh-drew/review-override (GH_DREW_REVIEW_OVERRIDE_FILE): while it exists and is not empty, its
# first line is the reason for every merge on the host. Deleting the file restores the check. Reads that fail
# refuse. GraphQL draws on no core quota, so cap_reads and guard_reads never count these reads.
# The same read asks merge-on-green, which owns the rule, whether the PR's author holds it (the hold
# label, or a hold phrase such as "merge only after the pre-deploy check below"). A held PR is refused,
# override or not: a lane hand-merged #11312, which merge-on-green had skipped for six hours,
# before the pre-deploy check its body names was shown. GH_DREW_PRECONDITIONS_SHOWN=<evidence> merges a
# held PR once every precondition is shown true; the evidence is logged.
review_wait="${GH_DREW_REVIEW_WAIT:-600}"
merge_on_green="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/merge-on-green"
read -r -d '' review_query <<'GRAPHQL' || true
fragment pr on PullRequest {
  url headRefOid createdAt body labels(first: 20) { nodes { name } }
  timelineItems(itemTypes: [READY_FOR_REVIEW_EVENT], last: 1) { nodes { ... on ReadyForReviewEvent { createdAt } } }
  reviewThreads(first: 100) { nodes { isResolved isOutdated path line originalLine
    comments(first: 50) { nodes { author { __typename login } body url } } } }
  comments(first: 100) { nodes { author { login } body } }
}
GRAPHQL
# Prints "pr <url> <head>", "held <reason>" when merge-on-green says the author holds the PR,
# then "finding <path:line> <title> <url>" for each unanswered Codex thread, "running <review> <commit>" for each Codex review running on the head, and
# "pending <seconds left> <seconds since>" while a just-opened or just-ready PR has no Codex comment.
read -r -d '' review_reader <<'PY' || true
import json, re, subprocess, sys
from datetime import datetime, timezone
text = sys.stdin.read()
answer = json.loads(text)
if answer.get("errors"):
    sys.exit("GitHub answered: " + "; ".join(e.get("message", "?") for e in answer["errors"])[:300])
repo = (answer.get("data") or {}).get("repository")
if not repo:
    sys.exit("GitHub returned no repository")
pr = repo.get("pullRequest")
if pr is None and repo.get("pullRequests") is not None:
    found = repo["pullRequests"]["nodes"]
    if len(found) != 1:
        sys.exit(f"{len(found)} open pull requests have this head branch; name the PR number")
    pr = found[0]
if not pr:
    sys.exit("GitHub returned no such pull request")
head = pr["headRefOid"]
codex = lambda actor: "codex" in ((actor or {}).get("login") or "").lower()
clean = lambda s: re.sub(r"\s+", " ", s).strip()
print("pr", pr["url"], head, sep="\t")
held = subprocess.run([sys.executable, sys.argv[1], "hold"], input=text, capture_output=True, text=True)
if held.returncode == 1:
    print("held", clean(held.stdout), sep="\t")
elif held.returncode != 0:
    sys.exit("cannot ask merge-on-green whether the PR is held: " + clean(held.stderr or held.stdout)[:200])
# GitHub closes what a merged body names after a closing keyword, pull requests included:
# "placement fix #11872" in #11873 closed #11872, and "closed #11879" in #11872 closed #11879.
# "-" stands for this repository: tab is IFS whitespace, so bash's read would drop an empty field.
for m in re.finditer(r"(?i)\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+([\w.-]+/[\w.-]+)?#(\d+)\b", pr.get("body") or ""):
    print("closes", m.group(1) or "-", m.group(2), sep="\t")
for thread in pr["reviewThreads"]["nodes"]:
    said = thread["comments"]["nodes"]
    if thread["isResolved"] or not said or not codex(said[0]["author"]):
        continue
    if any(c["author"] and c["author"]["__typename"] != "Bot" for c in said[1:]):
        continue
    line = thread["line"] or thread["originalLine"]
    where = thread["path"] + (f":{line}" if line else "") + (" (outdated)" if thread["isOutdated"] else "")
    title = next((l for l in said[0]["body"].splitlines() if l.strip()), "")
    title = re.sub(r"!\[([^\]]*?)(?: Badge)?\]\([^)]*\)", r"\1", title)
    title = clean(re.sub(r"<[^>]+>|\*\*|__", "", title))[:160]
    print("finding", where, title, said[0]["url"], sep="\t")
running = set()
for comment in pr["comments"]["nodes"]:
    body = comment["body"] or ""
    if not codex(comment["author"]) or "codex-pull-request-review-summary" not in body:
        continue
    # The summary carries this state while a review runs or after it fails, and drops it once
    # the review completes (dotfiles#464 and #465).
    state = re.search(r"codex-review-state:v1 (\{.*?\}) -->", body)
    try:
        for review, s in (json.loads(state.group(1)) if state else {}).items():
            if s and s.get("status") in ("running", "queued", "pending", "in_progress") and s.get("commit_sha") == head:
                running.add((review.replace("_", " "), head[:7]))
    except (ValueError, AttributeError):
        pass
for review, commit in sorted(running):
    print("running", review, commit, sep="\t")
moments = [pr.get("createdAt")] + [n.get("createdAt") for n in ((pr.get("timelineItems") or {}).get("nodes") or []) if n]
moments = [datetime.fromisoformat(m.replace("Z", "+00:00")) for m in moments if m]
if moments and not running and not any(codex(c["author"]) for c in pr["comments"]["nodes"]):
    since = max(0, int((datetime.now(timezone.utc) - max(moments)).total_seconds()))
    if since < 30:
        print("pending", 30 - since, since, sep="\t")
PY

# Reads the PR that parse_pr_merge named; prints review_reader's lines.
review_state() {
  local token="$1" sel="$merge_selector" repo="${merge_repo[1]:-}" rest json
  local -a vars=()
  if [[ "$sel" =~ ^https?://[^/]+/([^/]+)/([^/]+)/pull/([0-9]+) ]]; then
    vars=(-f "owner=${BASH_REMATCH[1]}" -f "name=${BASH_REMATCH[2]}")
    sel="${BASH_REMATCH[3]}"
  elif [[ -n "$repo" ]]; then
    # -R takes [HOST/]OWNER/REPO or a URL.
    repo="${repo#*://}"; repo="${repo%.git}"; repo="${repo%/}"; rest="${repo%/*}"
    vars=(-f "owner=${rest##*/}" -f "name=${repo##*/}")
  else
    # gh fills these from the current repository (or GH_REPO), as `gh pr merge` does.
    vars=(-F "owner={owner}" -F "name={repo}")
  fi
  sel="${sel#\#}"
  if [[ "$sel" =~ ^[0-9]+$ ]]; then
    vars+=(-F "number=$sel" -f "query=query(\$owner: String!, \$name: String!, \$number: Int!) {
  repository(owner: \$owner, name: \$name) { pullRequest(number: \$number) { ...pr } } }
$review_query")
  else
    if [[ -n "$sel" ]]; then vars+=(-f "branch=${sel#*:}"); else vars+=(-F "branch={branch}"); fi
    vars+=(-f "query=query(\$owner: String!, \$name: String!, \$branch: String!) {
  repository(owner: \$owner, name: \$name) { pullRequests(headRefName: \$branch, states: OPEN, first: 2) { nodes { ...pr } } } }
$review_query")
  fi
  # merge-on-green already read this exact PR's reviews in this tick. Reuse
  # that response, then run the same reader/hold/finding checks below.
  json=""
  if [[ -n "${MOG_REVIEW_SNAPSHOT:-}" && "$sel" =~ ^[0-9]+$ && "${vars[0]}" == -f ]]; then
    json="$(python3 "$(dirname "$merge_on_green")/merge-on-green-github.py" \
      "$MOG_REVIEW_SNAPSHOT" "${vars[1]#owner=}" "${vars[3]#name=}" "$sel")" || json=""
  fi
  if [[ -z "$json" ]]; then
    json="$(GH_TOKEN="$token" gh api graphql "${vars[@]}")" || return 1
  fi
  printf '%s' "$json" | python3 -I -c "$review_reader" "$merge_on_green"
}

review_guard() {
  local token="$1"; shift
  parse_pr_merge "$@" || return 0
  (( ! merge_disable_auto )) || return 0
  local override="${GH_DREW_REVIEW_OVERRIDE:-}" override_file="${GH_DREW_REVIEW_OVERRIDE_FILE:-$HOME/.config/gh-drew/review-override}"
  if [[ -z "$override" && -s "$override_file" ]]; then
    IFS= read -r override < "$override_file" || true
    override="${override:-host override file $override_file}"
  fi
  local shown="${GH_DREW_PRECONDITIONS_SHOWN:-}"
  shown="${shown//[$'\t\n\r']/ }"
  if [[ ! "$review_wait" =~ ^[0-9]+$ ]]; then
    echo "gh-drew: GH_DREW_REVIEW_WAIT must be whole seconds, got '$review_wait'" >&2
    exit 2
  fi
  local start=$SECONDS out err kind a b c url head elapsed why told="" pending since nap held logged_shown=0 closes_checked=0 ref repo state
  local -a findings running closes
  err="$(mktemp)"
  while :; do
    findings=() running=() closes=() url="" head="" pending="" since="" held=""
    if ! out="$(review_state "$token" 2>"$err")"; then
      log_call refused "$@"
      echo "gh-drew: refusing to merge: cannot read the PR's reviews: $(tr '\n' ' ' <"$err" | cut -c1-300)" >&2
      echo "Merge again once GitHub answers, or override with GH_DREW_REVIEW_OVERRIDE=<reason>." >&2
      rm -f "$err"
      exit 1
    fi
    while IFS=$'\t' read -r kind a b c; do
      case "$kind" in
        pr) url="$a" head="$b" ;;
        finding) findings+=("  $a  $b"$'\n'"    $c") ;;
        running) running+=("$a of ${b}") ;;
        pending) pending="$a" since="$b" ;;
        held) held="$a" ;;
        closes) closes+=("$a#$b") ;;
      esac
    done <<<"$out"
    reviewed_url="$url" reviewed_head="$head"
    if [[ -n "$held" && -z "$shown" ]]; then
      log_call refused "$@"
      echo "gh-drew: refusing to merge $url: its author holds it ($held)." >&2
      echo "Show every precondition its body names is true, then merge with GH_DREW_PRECONDITIONS_SHOWN=<evidence>." >&2
      rm -f "$err"
      exit 1
    fi
    # A closing keyword aimed at an open pull request closes it on merge. Refuse until the body says
    # "see #N" instead, or GH_DREW_ALLOW_CLOSE lists N (space-separated) because closing it is intended.
    if (( ! closes_checked )); then
      closes_checked=1
      for ref in "${closes[@]}"; do
        repo="${ref%#*}"
        [[ "$repo" != - ]] || { repo="${url#https://github.com/}"; repo="${repo%/pull/*}"; }
        state="$(GH_TOKEN="$token" gh api "repos/$repo/pulls/${ref##*#}" --jq .state 2>/dev/null)" || continue  # 404: an issue
        [[ "$state" == open && " ${GH_DREW_ALLOW_CLOSE:-} " != *" ${ref##*#} "* ]] || continue
        log_call refused "$@"
        echo "gh-drew: refusing to merge $url: its body names open pull request $repo#${ref##*#} after a closing keyword, so GitHub would close it." >&2
        echo "Reword it as \"see #${ref##*#}\", or merge with GH_DREW_ALLOW_CLOSE=${ref##*#} if closing it is intended." >&2
        rm -f "$err"
        exit 1
      done
    fi
    if [[ -n "$held" ]] && (( ! logged_shown )); then
      log_call "preconditions-shown: ${shown:0:200}" "$@"
      echo "gh-drew: merging a held PR ($held); preconditions shown: $shown" >&2
      logged_shown=1
    fi
    if [[ -n "$override" ]]; then
      local reason="${override//[$'\t\n\r']/ }"
      log_call "review-override: ${reason:0:200}" "$@"
      echo "gh-drew: merging without the Codex review check: $reason" >&2
      rm -f "$err"
      return 0
    fi
    if (( ${#findings[@]} )); then
      log_call refused "$@"
      {
        echo "gh-drew: refusing to merge $url: ${#findings[@]} Codex review finding(s) have no answer:"
        printf '%s\n' "${findings[@]}"
        echo "For each, fix it and reply on the thread with the commit, reply with the evidence that it"
        echo "does not apply, or resolve the thread. Then merge again."
        echo "Override: GH_DREW_REVIEW_OVERRIDE=<reason>"
      } >&2
      rm -f "$err"
      exit 1
    fi
    nap=60
    if (( ${#running[@]} )); then
      why="Codex ${running[*]} is running"
    elif [[ -n "$pending" ]]; then
      why="no Codex comment yet, ${since}s after the PR opened or turned ready"
      nap="$pending"
    else
      break
    fi
    elapsed=$((SECONDS - start))
    if (( elapsed >= review_wait )); then
      log_call refused "$@"
      echo "gh-drew: refusing to merge $url: $why (waited ${elapsed}s, GH_DREW_REVIEW_WAIT=$review_wait)." >&2
      echo "Merge again once Codex answers, or override with GH_DREW_REVIEW_OVERRIDE=<reason>." >&2
      rm -f "$err"
      exit 75
    fi
    (( review_wait - elapsed > nap )) || nap=$((review_wait - elapsed))
    if [[ "$why" != "$told" ]]; then
      echo "gh-drew: waiting up to $(( ${#running[@]} ? review_wait : nap ))s to merge $url: $why." >&2
      told="$why"
    fi
    sleep "$nap"
  done
  rm -f "$err"
}
