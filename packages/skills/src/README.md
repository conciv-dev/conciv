# skills/src

## Overview

Reference checker for skill markdown across the repo. It confirms that each SKILL.md has a '## Sources' list of existing files, and that each backticked `path:line` citation resolves, stays inside the repo, is within the file's line range, and has a nearby identifier from the citing paragraph.

## Interface

- `runCheck(repoRoot)` (`check-references.ts`): returns a `CheckOutcome` over all skill globs plus their references/*.md
- `formatReport(outcome)` (`check-references.ts`): one 'all clean' line, or '[kind] file: detail' lines
- `CheckOutcome` type (`check-references.ts`): {findings, skillCount, checkedFiles, checkedCitations}
- `FindingKind` (`check-references.ts`, internal): dead-source, dead-citation, unmatchable-citation, out-of-range-citation, empty-glob, missing-sources, escaping-citation
- CLI (`cli.ts`): resolves the repo root three levels up from src, runs the check and prints the report

## Invariants

- `skillGlobs` (`check-references.ts`): packages/skills/skills/_/SKILL.md, packages/client/skills/_/_/SKILL.md, packages/harness/plugins/claude/skills/_/SKILL.md; a glob that matches nothing is an empty-glob finding
- `citationPattern` (`check-references.ts`): only backticked `path.(ts|tsx|js|jsx|json|md|mdx|yaml|yml):N[-M][,N[-M]]` counts as a citation
- `missingSourcesFinding` (`check-references.ts`): a missing '## Sources' heading is an error only under packages/skills/skills/
- `checkSourcesSection` (`check-references.ts`): each '- `path`' line under ## Sources must exist relative to the repo root
- `resolveCitationPath` (`check-references.ts`): a bare filename must resolve by basename against the skill's Sources, otherwise unmatchable-citation
- `withinRepoRoot` (`check-references.ts`): a path outside the repo root is an escaping-citation
- `outOfRangeFinding` (`check-references.ts`): requires 1 &lt;= start &lt;= end &lt;= lineCount
- `identifiersMatch` (`check-references.ts`): one paragraph token (length &gt;= 4, not a stopword, not part of the path) must appear within 30 lines of the range; passes when there are no candidate tokens

## Side Effects

- `runCheck` (`check-references.ts`): reads markdown and cited source files (globSync, readFileSync, existsSync)
- `cli.ts`: console.log when clean; console.error and process.exit(1) on findings

## Verification

- Run: `cd packages/skills && pnpm test`
- Typecheck and lint: `cd packages/skills && pnpm typecheck && pnpm lint`
