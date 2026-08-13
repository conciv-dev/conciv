# Sources for conciv-self-update

Derived by re-reading `SKILL.md` and verifying the intent CLI's own behavior directly (`@tanstack/intent`
`stale`/`load` commands, run against this repo) rather than assuming it from the package name.

## Two different problems, two different fixes

- `packages/skills/package.json` — `intent:stale` / `intent:validate` scripts this skill's steps run.
- `packages/skills/src/check-references.ts` — the CI gate that keeps case 2 (version drift) from
  ever shipping in the first place, by failing the build when a skill's `metadata.library_version`
  disagrees with `packages/skills/package.json`.

## Steps

- `packages/harness-init/src/claude/pack-skills.ts` — the claude-plugin copy of this pack's
  content, regenerated via `conciv init` regardless of which case (reread or version drift)
  triggered the refresh.
- `packages/cli/src/init/steps/harness/skill-file.ts` — NOT a copy of this pack's content: it
  writes the generated conciv code-mode entry skill (`conciv/skill.md`), a different, single-file
  skill from `entry-skill.ts`. Cited here only because it is the other file `conciv init` writes
  that this skill's steps can end up regenerating.

## Unverified

- The exact `intent stale --json` field names (`currentVersion`, `skillVersion`, `versionDrift`) were
  confirmed by running the command in this repo at authoring time, not by reading `@tanstack/intent`'s
  own source as a committed dependency of this repo — a future `@tanstack/intent` release could rename
  them.
