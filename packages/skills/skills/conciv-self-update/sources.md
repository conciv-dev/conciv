# Sources for conciv-self-update

Derived by re-reading `SKILL.md` and verifying the intent CLI's own behavior directly (`@tanstack/intent`
`stale`/`load` commands, run against this repo) rather than assuming it from the package name.

## The mechanism, honestly

- `packages/skills/package.json` — `intent:stale` / `intent:validate` scripts this skill's steps run.

## Steps

- `packages/harness-init/src/claude/pack-skills.ts` — the claude-plugin copy this skill tells you to
  regenerate via `conciv init` when it is the stale one.
- `packages/cli/src/init/steps/harness/skill-file.ts` — the non-claude flat-file copy `conciv init`
  writes, the other place a stale copy of this pack's content can exist.

## Unverified

- The exact `intent stale --json` field names (`currentVersion`, `skillVersion`, `versionDrift`) were
  confirmed by running the command in this repo at authoring time, not by reading `@tanstack/intent`'s
  own source as a committed dependency of this repo — a future `@tanstack/intent` release could rename
  them.
