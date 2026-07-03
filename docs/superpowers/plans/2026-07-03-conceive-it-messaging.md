# "Conceive it." Messaging Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread the "Conceive it." tagline (the `@conciv/it` pun) through landing hero, READMEs, docs intro, npm description, and site metadata.

**Architecture:** Pure copy/markup pass, no new components, no layout changes. One display kicker added to the landing hero; every other change is a text edit. Spec: `docs/superpowers/specs/2026-07-03-conceive-it-messaging-design.md`.

**Tech Stack:** React/TanStack Start site (`apps/site`, package name `site`), Tailwind utility classes, MDX docs (fumadocs), GitHub-flavored markdown READMEs.

## Global Constraints

- Tagline is exactly `Conceive it.` (capital C, period). Uppercase on the landing kicker comes from a CSS class, not the source text.
- Docs content (`apps/site/content/docs/**`) uses no em dashes (project docs style rule). READMEs keep the em-dash style they already use.
- The `conciv` CLI package description is out of scope; do not touch `packages/cli`.
- No layout or visual redesign; PR #14 just shipped one.
- Every commit uses an explicit pathspec (`git commit -- <paths>`) and `git diff --cached --stat` is checked first; parallel sessions share this worktree.
- Build/verify through turbo from the repo root, never manual dist rebuilds.

---

### Task 1: Landing hero kicker

**Files:**

- Modify: `apps/site/src/components/landing/hero.tsx:9-17`

**Interfaces:**

- Consumes: existing `Badge` block and `h1` in `Hero`.
- Produces: a `<p>` kicker with visible text `Conceive it.` rendered between the badge and the `h1`. Task 5 greps the built client bundle for this string.

- [ ] **Step 1: Add the kicker**

In `apps/site/src/components/landing/hero.tsx`, the hero currently reads:

```tsx
        <Badge
          variant="outline"
          className="mb-5 gap-2 border-primary/30 font-mono text-[11.5px] uppercase tracking-[0.12em] text-primary"
        >
          <span className="size-1.5 rounded-full bg-primary" /> Beta · Dev-only · Open source
        </Badge>
        <h1 className="od-display mb-5 text-[clamp(40px,5.2vw,62px)] font-bold leading-[1.02] tracking-[-0.03em]">
```

Change the badge margin `mb-5` to `mb-4` and insert the kicker between badge and `h1`, so the block becomes:

```tsx
        <Badge
          variant="outline"
          className="mb-4 gap-2 border-primary/30 font-mono text-[11.5px] uppercase tracking-[0.12em] text-primary"
        >
          <span className="size-1.5 rounded-full bg-primary" /> Beta · Dev-only · Open source
        </Badge>
        <p className="mb-3 font-mono text-[13px] font-semibold uppercase tracking-[0.3em] text-primary">
          Conceive it.
        </p>
        <h1 className="od-display mb-5 text-[clamp(40px,5.2vw,62px)] font-bold leading-[1.02] tracking-[-0.03em]">
```

Borderless, mono, tracked wide: reads as brand voice, not another chip.

- [ ] **Step 2: Verify the site builds and renders the kicker**

Run from the repo root:

```bash
pnpm turbo build --filter site
grep -rl "Conceive it." apps/site/dist --include="*.js" | head -3
```

Expected: build passes; grep prints at least one bundle file. If the user has a `site` dev server running, do NOT start a second one or kill theirs; the grep on `dist` is the evidence.

- [ ] **Step 3: Commit**

```bash
git add apps/site/src/components/landing/hero.tsx
git diff --cached --stat
git commit -m "feat(site): add Conceive it kicker to landing hero" -- apps/site/src/components/landing/hero.tsx
```

---

### Task 2: Site metadata TITLE

**Files:**

- Modify: `apps/site/src/routes/__root.tsx:7`

**Interfaces:**

- Consumes: the `TITLE` constant, already wired to `<title>`, `og:title`, and `twitter:title`.
- Produces: new TITLE string checked by Task 5's grep.

- [ ] **Step 1: Update the constant**

In `apps/site/src/routes/__root.tsx` replace:

```tsx
const TITLE = 'conciv — an AI dev agent inside your running app'
```

with:

```tsx
const TITLE = 'conciv — Conceive it. An AI dev agent inside your running app'
```

`DESCRIPTION` stays unchanged.

- [ ] **Step 2: Verify**

```bash
pnpm turbo build --filter site
grep -rl "Conceive it. An AI dev agent" apps/site/dist | head -3
```

Expected: build passes; grep prints at least one file.

- [ ] **Step 3: Commit**

```bash
git add apps/site/src/routes/__root.tsx
git diff --cached --stat
git commit -m "feat(site): carry Conceive it tagline in page title and OG meta" -- apps/site/src/routes/__root.tsx
```

---

### Task 3: READMEs + npm description

**Files:**

- Modify: `README.md` (hero block + footer)
- Modify: `packages/it/README.md:1-3`
- Modify: `packages/it/package.json:4`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: rendered-markdown surfaces only; nothing downstream consumes these.

- [ ] **Step 1: Root README hero block**

In `README.md`, the hero paragraph currently reads:

```html
<p>
  <strong>An AI dev agent that lives inside your running app.</strong>
  <br />
  Add one plugin. Then chat, let it drive the page, and run your tests —
  <br />
  without ever leaving the thing you're building.
</p>
```

Add the tagline as the first line of that paragraph:

```html
<p>
  <em>Conceive it.</em>
  <br />
  <strong>An AI dev agent that lives inside your running app.</strong>
  <br />
  Add one plugin. Then chat, let it drive the page, and run your tests —
  <br />
  without ever leaving the thing you're building.
</p>
```

- [ ] **Step 2: Root README footer wink**

The footer currently reads:

```html
<div align="center">
  <br />
  <sub>Built with h3, Solid, and a real coding agent living in the page.</sub>
</div>
```

Add the wink line above the existing sub:

```html
<div align="center">
  <br />
  <sub><strong>conciv</strong> · as in <code>@conciv/it</code> — say it out loud.</sub>
  <br />
  <sub>Built with h3, Solid, and a real coding agent living in the page.</sub>
</div>
```

- [ ] **Step 3: packages/it README opener**

In `packages/it/README.md`, the opener currently reads:

```markdown
# @conciv/it

The conciv dev agent, one install. Re-exports the unplugin under conciv/plugin/\* (vite, webpack, rspack, rollup, esbuild, nextjs).
```

Change to:

```markdown
# @conciv/it

**Conceive it.** The conciv dev agent, one install. Re-exports the unplugin under conciv/plugin/\* (vite, webpack, rspack, rollup, esbuild, nextjs).
```

- [ ] **Step 4: packages/it package.json description**

In `packages/it/package.json` replace the `description` line:

```json
  "description": "The conciv dev agent, one install. Re-exports the unplugin under @conciv/it/plugin/* (vite, webpack, rspack, rollup, esbuild, nextjs).",
```

with:

```json
  "description": "Conceive it. The conciv dev agent, one install. Plugin for vite, webpack, rspack, rollup, esbuild, nextjs.",
```

- [ ] **Step 5: Verify**

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/it/package.json','utf8')); console.log('json ok')"
grep -c "Conceive it." README.md packages/it/README.md packages/it/package.json
```

Expected: `json ok`; grep counts `1` for each of the three files (README.md hero has it once; the footer wink says "say it out loud", not the tagline).

- [ ] **Step 6: Commit**

```bash
git add README.md packages/it/README.md packages/it/package.json
git diff --cached --stat
git commit -m "docs: lead READMEs and npm description with Conceive it tagline" -- README.md packages/it/README.md packages/it/package.json
```

---

### Task 4: Docs intro sentence

**Files:**

- Modify: `apps/site/content/docs/index.mdx:7-9`

**Interfaces:**

- Consumes: nothing.
- Produces: docs copy only.

- [ ] **Step 1: Append the name-lock sentence**

The first paragraph of `apps/site/content/docs/index.mdx` currently reads:

```markdown
conciv puts an AI dev agent inside the app you are already running. Add one plugin, and a conciv button
appears in your dev build. Open it to chat with an agent that sees the page you are on, drives and
edits it, and runs your tests, without leaving the app.
```

Append one sentence (no em dash; docs style):

```markdown
conciv puts an AI dev agent inside the app you are already running. Add one plugin, and a conciv button
appears in your dev build. Open it to chat with an agent that sees the page you are on, drives and
edits it, and runs your tests, without leaving the app. The name is the pitch: say `@conciv/it` out
loud, and conceive it.
```

- [ ] **Step 2: Verify docs still build**

```bash
pnpm turbo build --filter site
```

Expected: build passes (fumadocs compiles the MDX during the site build).

- [ ] **Step 3: Commit**

```bash
git add apps/site/content/docs/index.mdx
git diff --cached --stat
git commit -m "docs: explain the @conciv/it name in the docs intro" -- apps/site/content/docs/index.mdx
```

---

### Task 5: Full verification sweep

**Files:**

- None (verification only).

**Interfaces:**

- Consumes: all previous tasks' strings.

- [ ] **Step 1: One build, all greps**

```bash
pnpm turbo build --filter site
grep -rl "Conceive it." apps/site/dist --include="*.js" | head -3
grep -rl "Conceive it. An AI dev agent" apps/site/dist | head -3
grep -l "Conceive it." README.md packages/it/README.md packages/it/package.json apps/site/content/docs/index.mdx || true
```

Expected: build green; first two greps non-empty; last grep lists `README.md`, `packages/it/README.md`, `packages/it/package.json` (index.mdx says "conceive it" lowercase mid-sentence, so its absence from the exact-case grep is correct).

- [ ] **Step 2: Visual spot check (only if a site dev server is already running or user asks)**

Confirm on the landing page: kicker above the h1, both themes, mobile clamp width. Never start a second dev server next to the user's; never kill by port without `-sTCP:LISTEN`.
