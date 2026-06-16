# Plan 001: Remove the dead `.outout` output glob from `turbo.json`

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2446924..HEAD -- turbo.json`
> If `turbo.json` changed since this plan was written, compare the "Current state" excerpt against the
> live file before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `2446924`, 2026-06-16

## Why this matters

`turbo.json` declares a build output glob `.outout/**` — a typo. It was originally meant to capture a
Nitro `.output/` directory, but this repo deploys the docs site to Netlify **without Nitro** (Netlify
publishes `apps/site/dist/client`; see `netlify.toml`), so no task produces a `.output/` directory
that turbo needs to cache. The misspelled glob matches nothing and is dead configuration; remove it so
`turbo.json` honestly reflects the one real output root, `dist/**`.

## Current state

- `turbo.json` — turborepo task config at the repo root. The `build` task's `outputs`:

```json
// turbo.json (lines 4-7)
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".outout/**"]
    },
```

- `netlify.toml` confirms the deploy path is `dist`, not `.output`:

```toml
[build]
  command = "pnpm turbo run build --filter=site"
  publish = "apps/site/dist/client"
```

- Repo convention: JSON config is 2-space indented; `oxfmt` does not format `turbo.json` (it's in the
  default ignore set for this repo's formatter), so no formatter run is required for this file.

## Commands you will need

| Purpose                | Command                                           | Expected on success                                     |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| Build (all)            | `pnpm turbo run build`                            | exit 0                                                  |
| Build site only        | `pnpm turbo run build --filter=site`              | exit 0                                                  |
| Re-build (cache check) | `pnpm turbo run build --filter=site` (second run) | exit 0; turbo reports the task as cached / `FULL TURBO` |

## Scope

**In scope** (the only file you should modify):

- `turbo.json`

**Out of scope** (do NOT touch):

- `netlify.toml`, any `vite.config.*`, or `apps/site/**` — the deploy target is correct as-is; this
  plan only removes a dead glob.
- Do NOT add a `.output/**` glob "to be safe" — the project does not use Nitro; adding it re-introduces
  dead config.

## Git workflow

- Branch: `advisor/001-turbo-output-glob`
- One commit. Message style: conventional commits (e.g. `chore(turbo): drop dead .outout output glob`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Remove the `.outout/**` entry

Edit `turbo.json` so the `build` task's `outputs` is exactly:

```json
      "outputs": ["dist/**"]
```

(Delete `, ".outout/**"` — leave `"dist/**"` as the sole entry.)

**Verify**: `node -e "console.log(JSON.stringify(require('./turbo.json').tasks.build.outputs))"` → prints `["dist/**"]`

### Step 2: Confirm builds still work and caching is intact

**Verify**: `pnpm turbo run build` → exit 0 (no "no output files found" error introduced for any task).

**Verify**: run `pnpm turbo run build --filter=site` twice; the second run → exit 0 and turbo reports the
site build as cached (look for `cache hit` / `FULL TURBO` in the summary). If the second run is NOT
cached, that is expected only if source changed between runs — otherwise it's fine; the goal is no
regression, not a guaranteed hit.

## Test plan

No unit tests — this is build config. Verification is the build commands above.

## Done criteria

ALL must hold:

- [ ] `turbo.json` `build.outputs` equals `["dist/**"]` (Step 1 verify passes)
- [ ] `pnpm turbo run build` exits 0
- [ ] Only `turbo.json` is modified (`git status --porcelain` lists just `turbo.json`)
- [ ] `plans/README.md` row for 001 updated

## STOP conditions

Stop and report (do not improvise) if:

- The `turbo.json` `outputs` array no longer matches the "Current state" excerpt (it has been changed
  since this plan was written).
- Removing the glob causes `pnpm turbo run build` to fail or emit a NEW "no output files found"
  warning for any task — that would mean some task really does write to a non-`dist` directory; report
  which task and its output path instead of guessing a replacement glob.

## Maintenance notes

- If the docs site is ever migrated to a Nitro/`.output` build target, re-add `.output/**` to
  `build.outputs` (spelled correctly) so turbo caches it.
- Reviewer: confirm no package's `build` script writes outside `dist/`.
