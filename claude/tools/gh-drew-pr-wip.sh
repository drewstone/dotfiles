# Sourced by gh-drew: one open PR per fleet lane and repository. Uses the caller's "$@".
# One open PR per fleet lane and repository (ops-board #10097). Lanes opened PRs faster than
# signoff could land them (5.7/h in vs 3.25/h merged), so a lane with an open PR in a repository
# is refused another there. A PR in another repository is no duplicate: 73 of the 105 refusals of
# 10-19..26 that named their repository were cross-repository deliveries. Fleet stamps a stable key
# from the claimed project, shared by helpers, new runs, and operator handoffs.
# Older sessions retain their run-id key; a shell with no lane id is not limited.
# Each lane's ledger lists the PRs it created; only those are read, read-only.
# gh-read cannot see Drew's personal private repos, so a state it returns empty
# is read once with the drewstone token via a plain `gh pr view` (a read; it
# never re-enters this script). Unreadable by both refuses rather than admits.
pr_wip_dir="${GH_DREW_PR_WIP_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/fleet/pr-wip}"
pr_wip_key="${TANGLE_PR_WIP_KEY:-${TANGLE_ROOT_RUN_ID:-${TANGLE_RUN_ID:-}}}"
pr_wip_ledger=""
pr_wip_args=("$@")
pr_wip_pos=0
pr_wip_is_pr=0
pr_wip_repo=""
for (( i=0; i<${#pr_wip_args[@]}; i++ )); do
  case "${pr_wip_args[i]}" in
    -R|--repo) pr_wip_repo="${pr_wip_args[i+1]:-}" ;;
    --repo=*) pr_wip_repo="${pr_wip_args[i]#--repo=}" ;;
    -R?*) pr_wip_repo="${pr_wip_args[i]#-R}" ;;
  esac
done
while (( pr_wip_pos < ${#pr_wip_args[@]} )); do
  case "${pr_wip_args[pr_wip_pos]}" in
    -R|--repo) pr_wip_pos=$((pr_wip_pos + 2)) ;;
    --repo=*|-R?*) pr_wip_pos=$((pr_wip_pos + 1)) ;;
    *) break ;;
  esac
done
if [[ "${pr_wip_args[pr_wip_pos]:-}" == pr ]]; then
  pr_wip_is_pr=1
  pr_wip_pos=$((pr_wip_pos + 1))
  while (( pr_wip_pos < ${#pr_wip_args[@]} )); do
    case "${pr_wip_args[pr_wip_pos]}" in
      -R|--repo) pr_wip_pos=$((pr_wip_pos + 2)) ;;
      --repo=*|-R?*) pr_wip_pos=$((pr_wip_pos + 1)) ;;
      *) break ;;
    esac
  done
fi
# Without --repo, gh creates in the checkout's origin; an unknown repository checks every open PR.
[[ -n "$pr_wip_repo" ]] || pr_wip_repo="$(git remote get-url origin 2>/dev/null | sed -E 's#^(git@|ssh://git@|https://)github\.com[:/]##; s#\.git$##' || true)"
pr_wip_repo="${pr_wip_repo#https://github.com/}"
if (( pr_wip_is_pr )) && [[ "${pr_wip_args[pr_wip_pos]:-}" == create && -n "$pr_wip_key" ]]; then
  if [[ ! "$pr_wip_key" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "gh-drew: invalid fleet PR WIP key" >&2
    exit 2
  fi
  pr_wip_ledger="$pr_wip_dir/$pr_wip_key.tsv"
  mkdir -p "$pr_wip_dir"
  # Keep the check, GitHub create, and ledger write in one local critical
  # section. A crashed creator leaves the lock in place and fails closed.
  pr_wip_lock="$pr_wip_dir/$pr_wip_key.lock"
  pr_wip_locked=0
  for (( pr_wip_wait=0; pr_wip_wait<600; pr_wip_wait++ )); do
    if mkdir "$pr_wip_lock" 2>/dev/null; then
      pr_wip_locked=1
      trap 'rmdir "$pr_wip_lock"' EXIT
      break
    fi
    sleep 0.1
  done
  if (( ! pr_wip_locked )); then
    echo "gh-drew: PR create for lane $pr_wip_key is locked ($pr_wip_lock); inspect the creator before clearing it" >&2
    exit 1
  fi
fi

pr_wip_guard() {
  local token="$1"
  [[ -n "$pr_wip_ledger" && -s "$pr_wip_ledger" ]] || return 0
  if [[ -n "${PR_WIP_OVERRIDE:-}" ]]; then
    printf '%s\toverride\t%s\n' "$(date -u +%FT%TZ)" "$PR_WIP_OVERRIDE" >>"$pr_wip_ledger"
    return 0
  fi
  # MERGED and CLOSED are terminal, so each is appended once as a `settled` line
  # and never read again. Still inside the create lock, so appends do not race.
  local url state
  while IFS= read -r url; do
    state="$("${GH_DREW_PR_WIP_READER:-gh-read}" pr view "$url" --json state --jq .state 2>/dev/null || true)"
    if [[ -z "$state" ]]; then
      state="$(GH_TOKEN="$token" gh pr view "$url" --json state --jq .state 2>/dev/null || true)"
    fi
    if [[ "$state" == MERGED || "$state" == CLOSED ]]; then
      printf '%s\tsettled\t%s\t%s\n' "$(date -u +%FT%TZ)" "$url" "$state" >>"$pr_wip_ledger"
      continue
    fi
    echo "pr create refused: lane $pr_wip_key already has open PR $url (state: ${state:-unreadable}) in this repository; push to its branch, or land or close it first (ops-board #10097). Override: PR_WIP_OVERRIDE=<reason>" >&2
    exit 1
  done < <(awk -F'\t' -v repo="$(printf %s "$pr_wip_repo" | tr A-Z a-z)" 'FNR==NR { if ($2 == "settled") done[$3] = 1; next }
    $2 == "created" && $3 != "" && !($3 in done) && !seen[$3]++ &&
    (repo == "" || index(tolower($3), "github.com/" repo "/pull/")) { print $3 }' "$pr_wip_ledger" "$pr_wip_ledger")
}
