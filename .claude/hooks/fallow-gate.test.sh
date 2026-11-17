#!/usr/bin/env bash
set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fallow-gate.sh"
PASS=0
FAIL=0

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
WORK="$(cd "$WORK" && pwd -P)"
mkdir -p "$WORK/bin" "$WORK/repo" "$WORK/other"
git init -q "$WORK/repo"
git init -q "$WORK/other"
git -C "$WORK/repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git -C "$WORK/repo" worktree add -q -b linked "$WORK/linked"
AUDIT_LOG="$WORK/audited"

cat >"$WORK/bin/fallow" <<'STUB'
#!/usr/bin/env bash
if [ "${1:-}" = "--version" ]; then
  echo "fallow 3.36.0"
  exit 0
fi
pwd -P >>"$FALLOW_STUB_LOG"
printf '%s\n' "${FALLOW_AUDIT_BASE-<unset>}" >"$FALLOW_STUB_LOG.base"
echo "{\"verdict\":\"$FALLOW_STUB_VERDICT\"}"
[ "$FALLOW_STUB_VERDICT" = pass ]
STUB
chmod +x "$WORK/bin/fallow"

REPO="$WORK/repo"
OTHER="$WORK/other"
LINKED="$WORK/linked"
PUSH_SKIP="fallow-gate: git push is not audited; the commit gate and CI cover it."

run_case() {
  local name="$1"
  local command="$2"
  local expected_audited="$3"
  local verdict="${4:-pass}"
  local expected_exit=0
  if [ "$verdict" = fail ]; then
    expected_exit=2
  fi

  rm -f "$AUDIT_LOG"
  local payload
  payload="$(jq -n --arg cmd "$command" --arg cwd "$REPO" '{tool_input: {command: $cmd}, cwd: $cwd}')"
  local output
  output="$(cd / && printf '%s' "$payload" | PATH="$WORK/bin:$PATH" FALLOW_STUB_LOG="$AUDIT_LOG" FALLOW_STUB_VERDICT="$verdict" bash "$HOOK" 2>&1)"
  local actual_exit=$?
  local actual_audited=""
  if [ -f "$AUDIT_LOG" ]; then
    actual_audited="$(paste -sd ' ' "$AUDIT_LOG")"
  fi

  if [ "$actual_exit" = "$expected_exit" ] && [ "$actual_audited" = "$expected_audited" ]; then
    PASS=$((PASS + 1))
    echo "PASS: $name"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $name"
    echo "  command:  $command"
    echo "  expected: exit $expected_exit, audited [${expected_audited//$WORK/}]"
    echo "  actual:   exit $actual_exit, audited [${actual_audited//$WORK/}]"
    echo "  output: $output"
  fi
}

# --- every commit is audited ---
run_case "plain commit" "git commit -m 'x'" "$REPO"
run_case "commit with 2 -c options" "git -c user.name=X -c user.email=Y commit -m x" "$REPO"
run_case "commit with 4 -c options" "git -c a=1 -c b=2 -c c=3 -c d=4 commit -m x" "$REPO"
run_case "commit with 6 -c options" "git -c a=1 -c b=2 -c c=3 -c d=4 -c e=5 -c f=6 commit -m x" "$REPO"
run_case "commit with long-form global options" "git --no-pager --git-dir .git --work-tree . --namespace=n commit" "$REPO"
run_case "env-prefixed commit" "FOO=bar BAZ=1 git commit -m x" "$REPO"
run_case "commit chained after &&" "pnpm lint && git -c a=1 -c b=2 -c c=3 commit -m x" "$REPO"
run_case "commit chained after ;" "git add a; git commit -m x" "$REPO"
run_case "commit then push is audited for the commit" "git commit -m x && git push" "$REPO"
run_case "commit fed by a pipe" "printf x | git commit -F -" "$REPO"
run_case "commit inside bash -c" "bash -c \"git -c a=1 -c b=2 -c c=3 commit -m x\"" "$REPO"
run_case "commit inside eval" "eval \"git -c a=1 commit -m x\"" "$REPO"
run_case "commit inside a quoted command substitution" "echo \"\$(git -c a=1 commit -m x)\"" "$REPO"
run_case "a failing audit blocks the commit" "git -c a=1 -c b=2 -c c=3 -c d=4 -c e=5 commit -m x" "$REPO" fail

# --- the tree the command targets is audited ---
run_case "-C relative dir audits that tree" "git -C ../other commit -m x" "$OTHER"
run_case "-C absolute dir audits that tree" "git -C '$OTHER' commit -m x" "$OTHER"
run_case "cd then commit audits the cd tree" "cd ../other && git commit -m x" "$OTHER"
run_case "-C between -c options audits session and target" "git -c a=1 -c b=2 -C ../other -c c=3 commit" "$REPO $OTHER"
run_case "subshell cd then commit audits session and target" "(cd ../other && git commit -m x)" "$REPO $OTHER"
run_case "cd then many -c commit audits session and target" "cd '$OTHER' && git -c a=1 -c b=2 -c c=3 commit" "$REPO $OTHER"
run_case "-C into a plain directory audits the session" "git -C '$WORK/bin' commit -m x" "$REPO"
run_case "-C linked worktree commit audits only that worktree" "git -C ../linked commit -m x" "$LINKED"
run_case "cd linked worktree then commit audits only that worktree" "cd '$LINKED' && git commit -m x" "$LINKED"

# --- a push is not audited: the commit gate and CI cover it ---
push_case() {
  local name="$1"
  local command="$2"
  rm -f "$AUDIT_LOG"
  local payload
  payload="$(jq -n --arg cmd "$command" --arg cwd "$REPO" '{tool_input: {command: $cmd}, cwd: $cwd}')"
  local output
  output="$(cd / && printf '%s' "$payload" | PATH="$WORK/bin:$PATH" FALLOW_STUB_LOG="$AUDIT_LOG" FALLOW_STUB_VERDICT=fail bash "$HOOK" 2>&1)"
  local actual_exit=$?
  if [ "$actual_exit" = 0 ] && [ ! -f "$AUDIT_LOG" ] && [ "$output" = "$PUSH_SKIP" ]; then
    PASS=$((PASS + 1))
    echo "PASS: $name"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $name"
    echo "  command:  $command"
    echo "  expected: exit 0, no audit, output [$PUSH_SKIP]"
    echo "  actual:   exit $actual_exit, audited [$( [ -f "$AUDIT_LOG" ] && paste -sd ' ' "$AUDIT_LOG" | sed "s|$WORK||g")], output [$output]"
  fi
}
push_case "bare push" "git push"
push_case "push with remote and ref" "git push origin HEAD"
push_case "push with long-form global options" "git --no-pager --git-dir .git --work-tree . --namespace=n push"
push_case "push chained after ;" "git add a; git push"
push_case "-C push" "git -C ../other push"
push_case "-C linked worktree push" "git -C '$LINKED' push -u origin linked"
push_case "cd then push" "cd ../other && git push"
push_case "push inside bash -c" "bash -c \"git push\""

# --- not a commit or push ---
run_case "git log --grep commit" "git log --grep commit" ""
run_case "git show commit-ish" "git show commit-ish" ""
run_case "git status" "git status" ""
run_case "git log format ending in push" "git log -1 --format=%s push" ""
run_case "git commit-tree" "git commit-tree HEAD^{tree} -m x" ""
run_case "unrelated command" "ls -la" ""
run_case "empty command" "" ""

# --- documented behaviour of the generated script: a regeneration that changes these is noticed ---
run_case "accepted false positive: quoted echo of git commit is audited" "echo \"git commit\"" "$REPO"
run_case "KNOWN GAP of the generated script, not wanted: git by full path is not audited" "/usr/bin/git commit -m x" ""

# --- the comparison base pinned in .claude/settings.json env reaches fallow ---
base_case() {
  local name="$1"
  local expected="$2"
  shift 2
  rm -f "$AUDIT_LOG" "$AUDIT_LOG.base"
  local payload
  payload="$(jq -n --arg cwd "$REPO" '{tool_input: {command: "git commit -m x"}, cwd: $cwd}')"
  (cd / && printf '%s' "$payload" | env -u FALLOW_AUDIT_BASE "$@" PATH="$WORK/bin:$PATH" FALLOW_STUB_LOG="$AUDIT_LOG" FALLOW_STUB_VERDICT=pass bash "$HOOK" >/dev/null 2>&1)
  local actual=""
  if [ -f "$AUDIT_LOG.base" ]; then
    actual="$(cat "$AUDIT_LOG.base")"
  fi
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1))
    echo "PASS: $name"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $name"
    echo "  expected FALLOW_AUDIT_BASE [$expected], fallow saw [$actual]"
  fi
}
base_case "FALLOW_AUDIT_BASE set is handed to fallow" "origin/main" FALLOW_AUDIT_BASE=origin/main
base_case "FALLOW_AUDIT_BASE unset stays unset for fallow" "<unset>"

echo
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
