---
name: conciv-self-update
description: Use when your conciv knowledge might be stale — the user says "update conciv skills", "skills are stale", "refresh your conciv knowledge", "conciv APIs changed", "wrong API names", "re-read the conciv skills", "conciv skills are out of date", or a conciv call you just made was rejected because a name/shape this skill pack described no longer matches the installed @conciv/skills. Re-reads the installed pack and reports version drift; does not fetch anything from the network.
metadata:
  package: '@conciv/skills'
  library_version: '0.0.19'
---

# Refreshing conciv skills

## The mechanism, honestly

Every conciv skill you load through `@tanstack/intent` is read straight from the installed
`@conciv/skills` package at load time (`intent load <use>` resolves and prints the file fresh, no
cache) — so a skill loaded through intent is **never stale relative to the installed package**. The
only staleness that can exist is between the installed package version and the running conciv engine
version, or, for a claude-plugin install, a copy of these files that was written into the plugin at
`conciv init` time and has not been refreshed since.

## Steps

1. Run `pnpm dlx @tanstack/intent@latest stale --json` (or `npx`/your package manager's dlx
   equivalent) from the project root. For `@conciv/skills` this reports `currentVersion` (the
   installed package version), `skillVersion` (the `library_version` each skill's frontmatter was
   authored against), and `versionDrift` — read that field, do not guess from the numbers yourself.
2. If `intent stale` reports drift, re-load every skill you rely on with
   `pnpm dlx @tanstack/intent@latest load @conciv/skills#<name>` — this re-reads the current installed
   content, so the drift is resolved by the re-read itself, not by any local caching you do.
3. If the project has no `intent` available, or the drifted content lives inside a claude plugin
   (`.conciv/claude-connect/*/skills/`, written once by `conciv init`), that copy does not
   self-refresh: re-run `conciv init` to regenerate it from the currently installed `@conciv/skills`.
4. Report the `currentVersion`/`skillVersion` pair and which path you refreshed. Do not claim a skill
   is current without having actually re-read or regenerated it in this turn.

## Non-goals

No network fetch, no changing the installed `@conciv/skills` version yourself (that is a normal
dependency upgrade, run by the user's package manager) — this skill only makes sure what is already
installed is what you are actually reading.

## Sources

- `packages/skills/package.json`
- `packages/harness-init/src/claude/pack-skills.ts`
- `packages/cli/src/init/steps/harness/skill-file.ts`
