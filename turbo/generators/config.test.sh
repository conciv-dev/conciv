#!/usr/bin/env bash
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
COPY="$WORK/repo"
PASS=0
FAIL=0

cleanup() {
  git -C "$REPO" worktree remove --force "$COPY" >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

check() {
  local name="$1"
  shift
  local output
  if output="$("$@" 2>&1)"; then
    PASS=$((PASS + 1))
    echo "PASS: $name"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $name"
    echo "$output" | tail -20 | sed 's/^/  /'
  fi
}

refuses() {
  ! "$@"
}

prints() {
  local expected="$1"
  shift
  "$@" 2>&1 | grep -qF -- "$expected"
}

same_files() {
  local folder="$1"
  local expected="$2"
  diff <(cd "$COPY/$folder" && find . -type f -not -path './node_modules/*' | sort) <(printf '%s\n' $expected | sort)
}

manifest_is() {
  local folder="$1"
  local expression="$2"
  node -e "const m = require(process.argv[1]); if (!($expression)) { console.error(JSON.stringify(m, null, 2)); process.exit(1) }" \
    "$COPY/$folder/package.json"
}

generate() {
  (cd "$COPY" && pnpm exec turbo gen package --args "$@")
}

TESTS="./test/unit/.gitkeep ./test/it/.gitkeep ./test/e2e/.gitkeep ./test/fixtures/.gitkeep"

git -C "$REPO" worktree add --quiet --detach "$COPY" HEAD
rm -rf "$COPY/turbo/generators"
cp -R "$REPO/turbo/generators" "$COPY/turbo/generators"
for file in package.json pnpm-lock.yaml pnpm-workspace.yaml .oxfmtrc.json; do cp "$REPO/$file" "$COPY/$file"; done
(cd "$COPY" && pnpm install --frozen-lockfile --prefer-offline >/dev/null 2>&1)

check "a published node package is generated" \
  prints "Success" generate published gen-check-node "A published node package the generator test made." node
check "a private browser package is generated" \
  prints "Success" generate private gen-check-web "A private browser package the generator test made." browser
check "an internal package for both runtimes is generated" \
  prints "Success" generate internal gen-check-both "An internal package the generator test made." both

check "the published package holds the built package files, its entry named after it" \
  same_files packages/gen-check-node "./package.json ./tsconfig.json ./tsconfig.build.json ./tsdown.config.ts
  ./vite.config.ts ./README.md ./src/gen-check-node.ts $TESTS"
check "the private package holds the same built package files" \
  same_files packages/gen-check-web "./package.json ./tsconfig.json ./tsconfig.build.json ./tsdown.config.ts
  ./vite.config.ts ./README.md ./src/gen-check-web.ts $TESTS"
check "the internal package is source-only, in its -internal folder" \
  same_files packages/gen-check-both-internal "./package.json ./tsconfig.json ./vite.config.ts ./README.md
  ./src/gen-check-both.ts $TESTS"

check "the published manifest is public, exports its dist entry and runs publint and attw" \
  manifest_is packages/gen-check-node "m.name === '@conciv/gen-check-node' && !m.private && m.publishConfig.access === 'public' && m.exports['.'].import === './dist/gen-check-node.js' && m.exports['.'].types === './dist/gen-check-node.d.ts' && m.scripts.publint && m.scripts.attw && m.devDependencies['@types/node'] === 'catalog:'"
check "the private manifest is private, built, and neither publishes nor checks publishing" \
  manifest_is packages/gen-check-web "m.name === '@conciv/gen-check-web' && m.private === true && !m.publishConfig && !m.scripts.publint && m.scripts.build && !m.devDependencies['@types/node']"
check "the internal manifest is @internal, private and exports its source entry" \
  manifest_is packages/gen-check-both-internal "m.name === '@internal/gen-check-both' && m.private === true && m.exports['.'] === './src/gen-check-both.ts' && m.main === 'src/gen-check-both.ts' && !m.scripts.build"
check "tsdown builds the entry named after the package" \
  grep -qF "entry: ['src/gen-check-node.ts']" "$COPY/packages/gen-check-node/tsdown.config.ts"
check "node extends the base preset, browser and both the web preset" bash -c "
  grep -q tsconfig.base.json '$COPY/packages/gen-check-node/tsconfig.json' &&
  grep -q tsconfig.web.json '$COPY/packages/gen-check-web/tsconfig.json' &&
  grep -q tsconfig.web.json '$COPY/packages/gen-check-both-internal/tsconfig.json' &&
  grep -q '\"node\"' '$COPY/packages/gen-check-both-internal/tsconfig.json'"

check "the published package joins PUBLIC_PACKAGES" grep -q "'@conciv/gen-check-node'," "$COPY/packages/publish/src/guards.ts"
check "the published package joins fallow publicPackages" grep -q '"@conciv/gen-check-node"' "$COPY/.fallowrc.json"
check "the published package gets a changeset" grep -q "'@conciv/gen-check-node': patch" \
  "$COPY/.changeset/add-gen-check-node-package.md"
check "the private and internal packages are in no public list and get no changeset" bash -c "
  ! grep -qE 'gen-check-(web|both)' '$COPY/packages/publish/src/guards.ts' '$COPY/.fallowrc.json' &&
  [ ! -e '$COPY/.changeset/add-gen-check-web-package.md' ] && [ ! -e '$COPY/.changeset/add-gen-check-both-package.md' ]"

check "a name that is not kebab-case is refused" prints "kebab" generate published Bad "x" node
check "an unknown kind is refused" prints "valid list value" generate public gen-check-bad "x" node
check "a refused package writes nothing" refuses ls "$COPY/packages/Bad" "$COPY/packages/gen-check-bad"

check "the generated packages and edited shared files are formatted" bash -c "cd '$COPY' && pnpm exec oxfmt --check \
  packages/gen-check-node packages/gen-check-web packages/gen-check-both-internal packages/publish/src/guards.ts .fallowrc.json"
check "pnpm format leaves the handlebars templates as written" bash -c "cd '$COPY' &&
  { pnpm exec oxfmt --write turbo/generators/templates >/dev/null 2>&1; true; } &&
  diff -r '$REPO/turbo/generators/templates' '$COPY/turbo/generators/templates'"
check "the generated packages typecheck, lint and build" bash -c "cd '$COPY' && pnpm exec turbo run typecheck lint build \
  --filter=@conciv/gen-check-node --filter=@conciv/gen-check-web --filter=@internal/gen-check-both"
check "the published package passes publint and attw" bash -c "cd '$COPY' && pnpm exec turbo run publint attw \
  --filter=@conciv/gen-check-node"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
