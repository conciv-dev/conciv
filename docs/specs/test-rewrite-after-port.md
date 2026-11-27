# Test rewrite after the plugin port

Status: the rewrite's rules are AGENTS.md's Testing section (where a test lives, the test utilities, how a test is
written, running). This file keeps only what AGENTS.md does not say: where the old tests are and the rulings the
rewrite still carries. Where this file and AGENTS.md disagree, AGENTS.md wins.

## Where the old tests are

Every test from before the port was deleted. The last commit that has all of them is `9d4f4834f`: read an old file
with `git show 9d4f4834f:<path>`, list them with `git ls-tree -r --name-only 9d4f4834f | grep -E '\.test\.|\.spec\.'`.
Paths there are the old layout (`apps/conciv`, `packages/core`, `packages/ai`, `packages/plugin-testkit`,
`packages/harness-testkit`); today's home of each is the package AGENTS.md names for that code.

`docs/specs/test-split/` gives every old test one row with its destination and its journey group, and `worth-it.md` is
the pass that dropped duplicates. A new journey lists the old tests whose behaviour it covers, so git history shows
that nothing was lost. Background: `docs/specs/test-audit/` and `docs/specs/test-research/`.

## Rulings the rewrite carries

- Every user-facing behaviour is proven once, by a journey that does what a user does. A test is never written per old
  test or per spec line.
- Mascot leak guards (effects and wrappers) are kept and asserted through GSAP's public API after work stops and after
  unmount; listener-count and layout-read-count tests are not carried. Reduced motion is kept: happy-dom with reduced
  motion set, plus one browser-mode check of the real media query.
- Real-CLI tests are opt-in by env, as opencode's.
- API kept alive only by its tests is deleted with them.
- Storybook a11y goes from `todo` to `error` (`apps/storybook/src/storybook/preview.tsx`), and the violations found
  then are fixed; it is still `todo`.
