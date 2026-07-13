# Plan 022: README, AGENTS.md, and site docs describe the current stack (hono, @conciv/embed, libSQL) not the pre-migration one

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- README.md AGENTS.md apps/site/content/docs`
> If any changed since this plan was written, re-verify the "Current state" line references before editing; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

Three recent migrations left the project's front-door and agent-facing docs describing a stack that no longer exists:

- The server engine migrated from **h3/srvx to hono** (the `@conciv/serve` wrapper uses `@hono/node-server`).
- The browser half stopped being a `packages/widget` package and became the **`apps/conciv`** app bundled by **`@conciv/embed`**; `packages/widget` no longer exists.
- The whiteboard migrated from a **Jazz CRDT** to **libSQL/drizzle + TanStack DB**.

`AGENTS.md` is the worst case: it instructs agents to rebuild `@conciv/widget` (a package that doesn't exist, so the command silently no-ops and the agent tests stale code) and reason about a Jazz CRDT the code abandoned. README and the published site docs point users at a `@conciv/widget/global` bundle that doesn't resolve, breaking the webpack/rspack quick-start. Stale docs that are actively wrong are worse than missing ones. This plan corrects the confirmed-wrong references. One sub-item (the exact self-host bundle artifact for webpack/rspack) is genuinely unresolved and is handled as a STOP condition rather than guessed.

## Current state

Confirmed wrong references (verified at this commit):

**`AGENTS.md`**:

- `:49` — "Widget integration tests load the PREBUILT bundle (`packages/widget/dist/conciv-widget.global.js`)". `packages/widget` does not exist. The IIFE global bundle is built by `packages/embed/vite.global.config.ts` from a **test fixture** entry (`packages/embed/test/fixtures/global-entry.ts`), output `conciv-widget.global.js` under `packages/embed/dist`.
- `:50` — "rebuild the widget (`pnpm turbo run build --filter=@conciv/widget`)". No `@conciv/widget` package exists; this filter matches nothing. The real package is `@conciv/embed` (its `build` script runs the global config).
- `:114` — "Whiteboard (Jazz CRDT): never write to the db inside a `subscribe`/`useAll` callback…". The whiteboard uses libSQL/drizzle + TanStack DB now (`packages/extensions/whiteboard/package.json` depends on `@libsql/client`; zero Jazz references in the tree). The _landmine_ (don't write inside a subscription/effect/render) is still real for TanStack DB collections — only the "Jazz CRDT" framing and `subscribe`/`useAll` API names are wrong.

**`README.md`**:

- `:69` — "boots a framework-free **h3** engine (`@conciv/core`)". Now hono.
- `:125` — whiteboard "on a self-hosted **Jazz CRDT**". Now libSQL/TanStack DB.
- `:142` — packages table: `@conciv/core` = "The framework-free h3 + srvx engine". Now hono.
- `:145` — packages table row `@conciv/widget` linking to `./packages/widget` (dead path). The browser half is `@conciv/embed` (`./packages/embed`) inlining the `apps/conciv` app.
- `:177` — footer "Built with h3, Solid, …". Now hono.

**Site docs** (`apps/site/content/docs`):

- `packages.mdx:28` — `@conciv/core` "The framework-free engine" (fine) — but `:29` row `@conciv/widget` links to `tree/main/packages/widget` (404).
- `quick-start/webpack.mdx:36` and `quick-start/rspack.mdx:36` — "The widget bundle ships as `@conciv/widget/global`." `@conciv/widget` is unpublished/nonexistent, and `@conciv/embed` currently exports only `.` → `dist/mount.js` (no `/global` subpath). **This reference is wrong, but the correct replacement depends on an unresolved question** (does a self-hostable global bundle ship, and under what name?) — see STOP conditions.
- `extending/tool-contract.mdx:104` — describes an "[h3](https://h3.dev) sub-app mounted under your extension's API namespace". The engine is hono; the extension custom-route sub-app is a hono app now.

Facts to use in replacements:

- Server framework: **hono** (`@hono/node-server` via `@conciv/serve`).
- Browser bundle package: **`@conciv/embed`** (`packages/embed`), which inlines the private **`conciv`** app (`apps/conciv`). Its published export is `@conciv/embed` → `dist/mount.js`.
- Whiteboard storage: **libSQL/drizzle + TanStack DB**.

### Repo conventions to follow

- Docs writing style (from the repo's docs-style guidance): no em dashes, concise, example-first.
- Do not invent product claims; only correct stack/technology/path references to match reality.

## Commands you will need

| Purpose                            | Command                                                                                                                         | Expected on success                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Find stale refs                    | `grep -rn "packages/widget\|@conciv/widget\|Jazz\|h3\.dev\|srvx\|framework-free h3" README.md AGENTS.md apps/site/content/docs` | after edits: only intentional/remaining lines |
| Site typecheck (docs build sanity) | `pnpm exec turbo run typecheck --filter=site`                                                                                   | exit 0                                        |

## Scope

**In scope**:

- `README.md`
- `AGENTS.md`
- `apps/site/content/docs/packages.mdx`
- `apps/site/content/docs/quick-start/webpack.mdx`
- `apps/site/content/docs/quick-start/rspack.mdx`
- `apps/site/content/docs/extending/tool-contract.mdx`

**Out of scope**:

- Any source code. This is docs-only.
- `apps/site/content/docs/configuration.mdx` / `troubleshooting.mdx` — they already correctly state "on webpack/rspack the widget is not injected; set `widgetUrl`". Leave them.
- The still-true whiteboard landmine _content_ (no writes in subscriptions/effects/render) — keep the rule, only fix the "Jazz CRDT"/`subscribe`/`useAll` wording.
- Rewording that changes product claims or feature lists beyond the stack corrections.

## Git workflow

- Branch: `advisor/022-doc-drift`
- Commit style: `docs: correct stack references (hono, @conciv/embed, libSQL) across README, AGENTS, site docs`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Fix `AGENTS.md`

- `:49-50` — replace the `packages/widget` bundle path and the `--filter=@conciv/widget` rebuild command with the `@conciv/embed` equivalents. Concretely: the prebuilt bundle is at `packages/embed/dist/conciv-widget.global.js`, rebuilt via `pnpm turbo run build --filter=@conciv/embed`. Keep the surrounding advice (rebuild before running widget ITs or you test stale code).
- `:114` — reframe the whiteboard landmine for TanStack DB: "Whiteboard (TanStack DB over libSQL): never write to the db inside a collection subscription, effect, or render body — it triggers a re-render storm. Writes go in event handlers only." Keep the intent; drop "Jazz CRDT"/`useAll`.

**Verify**: `grep -n "@conciv/widget\|Jazz\|packages/widget" AGENTS.md` → returns nothing.

### Step 2: Fix `README.md`

- `:69` — "framework-free **h3** engine" → "framework-free **hono** engine".
- `:125` — "self-hosted **Jazz CRDT**" → "self-hosted libSQL store (TanStack DB)" (keep the rest of the whiteboard sentence).
- `:142` — packages table `@conciv/core` description "framework-free h3 + srvx engine" → "framework-free hono engine".
- `:145` — replace the `@conciv/widget` (`./packages/widget`) row with `@conciv/embed` (`./packages/embed`): "The browser half: mounts the conciv Solid app into an open Shadow DOM, with the chat UI, cards, and page-control driver." (The `apps/conciv` app is private; the published package is `@conciv/embed`.)
- `:177` — footer "Built with h3, Solid, …" → "Built with hono, Solid, …".

**Verify**: `grep -n "h3\|srvx\|@conciv/widget\|Jazz" README.md` → returns nothing (or only unrelated matches you can confirm are correct).

### Step 3: Fix the site docs that are unambiguously wrong

- `apps/site/content/docs/packages.mdx:29` — replace the `@conciv/widget` row (dead `packages/widget` link) with an `@conciv/embed` row linking to `tree/main/packages/embed`, same description style as README's new row.
- `apps/site/content/docs/extending/tool-contract.mdx:104` — replace "[h3](https://h3.dev) sub-app" with "[hono](https://hono.dev) sub-app". If the surrounding example shows an h3-specific API (`defineEventHandler`, `eventHandler`, `getQuery`), update it to the hono equivalent (`new Hono()`, `c.req`, `c.json(...)`); if it only names the framework, the link swap suffices. Read the full section before editing.

**Verify**: `grep -rn "h3.dev\|packages/widget" apps/site/content/docs` → returns nothing.

### Step 4: Handle the webpack/rspack self-host bundle references

`quick-start/webpack.mdx:36` and `rspack.mdx:36` claim "The widget bundle ships as `@conciv/widget/global`." This is wrong, but the _correct_ replacement is unresolved: `@conciv/embed` currently exports only `.` → `dist/mount.js`, not a self-hostable global/IIFE subpath. **Do not guess a replacement path.** STOP and report this (see STOP conditions). The maintainer must confirm whether a self-hostable bundle ships and under what specifier before these two lines can be corrected accurately. (Leaving a knowingly-wrong package name is not acceptable, but neither is inventing one — so this sub-item is reported, not silently edited.)

**Verify**: you have reported the webpack/rspack bundle-path question and left those two lines untouched pending the answer.

### Step 5: Site typecheck sanity

**Verify**: `pnpm exec turbo run typecheck --filter=site` → exit 0 (mdx edits didn't break the docs build).

## Test plan

- No unit tests — docs only.
- Verification is the greps in each step returning empty for stale references, plus the site typecheck passing.

## Done criteria

ALL must hold:

- [ ] `grep -rn "@conciv/widget\|packages/widget" README.md AGENTS.md apps/site/content/docs/packages.mdx` → nothing
- [ ] `grep -rn "\bh3\b\|srvx\|h3.dev" README.md AGENTS.md apps/site/content/docs/extending/tool-contract.mdx` → nothing (README footer + engine lines now say hono)
- [ ] `grep -rn "Jazz" README.md AGENTS.md` → nothing
- [ ] `pnpm exec turbo run typecheck --filter=site` exits 0
- [ ] The webpack/rspack `@conciv/widget/global` question is reported (Step 4), not silently edited
- [ ] No source files modified (`git status` shows only the 6 in-scope docs files)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The line references in "Current state" don't match the live files (drift) — the migrations may have moved things again.
- **Step 4 always triggers a report**: you cannot determine the correct self-hostable bundle specifier for webpack/rspack from the code (embed exports only `dist/mount.js`). Report: "webpack.mdx:36 / rspack.mdx:36 reference the nonexistent `@conciv/widget/global`; `@conciv/embed` exports no global subpath — need the correct self-host artifact name or an added `@conciv/embed/global` export before fixing." Leave those two lines unedited.
- Fixing the `tool-contract.mdx` extension sub-app example requires understanding the actual current hono-mount API and it isn't evident from the doc — report; do the safe link swap only.

## Maintenance notes

- The root cause is that docs weren't updated alongside three `!`-breaking migrations (hono, oRPC/embed rename, whiteboard libSQL). A reviewer merging future stack migrations should grep README/AGENTS/site-docs for the old technology name as part of the PR.
- The webpack/rspack self-host story is a real product gap surfaced here and overlaps the "finish or honestly gate the non-Vite bundlers" direction item — track it there. Once the maintainer confirms the bundle specifier, a one-line follow-up fixes those two doc lines.
- Consider adding `packages/widget`, `Jazz`, and `\bh3\b` to a docs-lint grep in CI so this drift can't silently return.
