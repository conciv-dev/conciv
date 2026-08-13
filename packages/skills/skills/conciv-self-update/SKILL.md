---
name: conciv-self-update
description: Use when your conciv knowledge might be stale — the user says "update conciv skills", "skills are stale", "refresh your conciv knowledge", "conciv APIs changed", "wrong API names", "re-read the conciv skills", "conciv skills are out of date", or a conciv call you just made was rejected because a name/shape this skill pack described no longer matches the installed @conciv/skills. Re-reads the installed pack and reports version drift; does not fetch anything from the network.
metadata:
  package: '@conciv/skills'
  library_version: '0.0.19'
---

# Refreshing conciv skills

## Two different problems, two different fixes

"My conciv knowledge is stale" is actually one of two distinct problems — tell them apart before
picking a fix, because only one of them is fixable in this turn:

1. **Your own cached knowledge is stale.** The installed `@conciv/skills` package is internally
   consistent (its skill files match its own package.json version) but you are working from a
   memory of an older read, or from training data. Fixed by rereading: every conciv skill loaded
   through `@tanstack/intent` is read straight from the installed package at load time (`intent
load <use>` resolves and prints the file fresh, no cache), so a reread always wins over memory.
   This resolves immediately, in this turn.
2. **Version drift.** The installed package's own skill files disagree with its own package.json
   version — `currentVersion` (from package.json) and `skillVersion` (the `library_version` each
   skill's frontmatter was authored against) do not match. This is a defect in what was published,
   not in what you remember: rereading the same mismatched file changes nothing. It persists until
   the project installs a newer `@conciv/skills` version where the mismatch is corrected — a normal
   dependency upgrade run by the user's package manager, not something this skill can do for you.

There is also a third, narrower case: a claude-plugin install keeps a copy of these files written
into the plugin at `conciv init` time (`.conciv/claude-connect/*/skills/`). That copy does not
self-refresh on its own and needs `conciv init` re-run to regenerate it from the currently
installed `@conciv/skills`, independent of whether case 1 or case 2 applies.

## Steps

1. Run `pnpm dlx @tanstack/intent@latest stale --json` (or `npx`/your package manager's dlx
   equivalent) from the project root. For `@conciv/skills` this reports `currentVersion`,
   `skillVersion`, and `versionDrift` — read `versionDrift`, do not guess from the numbers yourself.
2. If `versionDrift` is false, this is case 1: rereading fixes it. Re-load every skill you rely on
   with `pnpm dlx @tanstack/intent@latest load @conciv/skills#<name>` and continue — the fresh read
   is authoritative over anything you remembered.
3. If `versionDrift` is true, this is case 2: tell the user the installed `@conciv/skills` package
   has an internal version mismatch (quote `currentVersion` and `skillVersion`) and that it needs a
   package upgrade to fix, not a reread. Do not re-load skills expecting the drift to clear.
4. If the project has no `intent` available, or the stale copy lives inside a claude plugin, use
   the claude-plugin path from "Two different problems" above: re-run `conciv init` regardless of
   which case (1 or 2) triggered this.
5. Report the `currentVersion`/`skillVersion` pair, which case applied, and which path you took.
   Do not claim a skill is current without having actually re-read or regenerated it in this turn.

## Non-goals

No network fetch, no changing the installed `@conciv/skills` version yourself (that is a normal
dependency upgrade, run by the user's package manager) — this skill only makes sure what is already
installed is what you are actually reading, and tells you plainly when rereading cannot help.

## Sources

- `packages/skills/package.json`
- `packages/skills/src/check-references.ts`
- `packages/harness-init/src/claude/pack-skills.ts`
- `packages/cli/src/init/steps/harness/skill-file.ts`
