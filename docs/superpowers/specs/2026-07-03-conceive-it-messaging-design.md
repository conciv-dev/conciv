# "Conceive it." messaging pass — design

Date: 2026-07-03
Status: Approved
Owner: Omri

## Context

The package name `@conciv/it` reads out loud as "conceive it". That pun is the pitch —
you conceive UI/features inside your running app and the agent makes them real — and it
locks the pronunciation of the brand (kon-SEEV). Today the line appears nowhere: the
landing hero, READMEs, docs intro, npm descriptions, and site metadata all lead with the
descriptive headline only.

This is a copy/messaging pass on top of the just-shipped landing redesign (PR #14).
No layout or visual redesign, no new sections, no new components.

## Decisions

- **Prominence:** tagline above headline. "Conceive it." is a short brand kicker; the
  descriptive headline ("An AI dev agent that lives inside your running app.") stays
  and keeps doing the explaining.
- **Surfaces:** landing hero, root README, `packages/it` README, docs intro
  (`index.mdx`), `@conciv/it` npm description, site `<title>`/OG metadata.
- **Pun explanation:** one wink, once. A single aside in the root README footer and one
  sentence in the docs intro. The landing stays implicit — the install command sitting
  under the tagline does the work. No pronunciation-guide page.
- **CLI package:** `conciv` CLI `description` unchanged (agent-facing, not a marketing
  surface).

## Changes by surface

### 1. Landing hero — `apps/site/src/components/landing/hero.tsx`

Insert a display kicker between the existing beta Badge and the `<h1>`:

```
[Beta · Dev-only · Open source]   ← Badge, unchanged
CONCEIVE IT.                      ← new kicker
An AI dev agent that lives inside your running app.   ← h1, unchanged
Add one plugin. Then chat, …      ← subhead, unchanged
[npm i -D @conciv/it]             ← InstallChip, unchanged
```

Kicker style: reuse the badge's typography family (font-mono, uppercase, wide tracking,
primary color) but larger and borderless, so it reads as brand voice rather than another
chip. Roughly 5 lines added, no new component.

### 2. Root `README.md`

In the centered hero block, add the tagline line above the existing `<strong>` headline:

```
✦ conciv

Conceive it.
An AI dev agent that lives inside your running app.
```

Add the single wink near the footer:

> **conciv** · as in `@conciv/it` — say it out loud.

### 3. `packages/it/README.md`

Open with the tagline above the current first line (this README is the npm page for
`@conciv/it`):

```
# @conciv/it

Conceive it. The conciv dev agent, one install. …
```

### 4. Docs intro — `apps/site/content/docs/index.mdx`

Append one sentence to the first paragraph:

> The name is the pitch: `@conciv/it` — conceive it.

No other docs pages change.

### 5. npm description — `packages/it/package.json`

```
"description": "Conceive it. The conciv dev agent, one install. Plugin for vite, webpack, rspack, rollup, esbuild, nextjs."
```

(Keep the `@conciv/it/plugin/*` re-export detail out of the description; the README
covers it.)

### 6. Site metadata — `apps/site/src/routes/__root.tsx`

```
TITLE = 'conciv — Conceive it. An AI dev agent inside your running app'
```

`DESCRIPTION` unchanged. The TITLE constant feeds `<title>`, `og:title`, and
`twitter:title` — one edit covers all three.

## Out of scope

- Layout/visual redesign of any page (PR #14 just shipped one)
- New sections, pronunciation-guide page, logo work
- `conciv` CLI package description
- Per-page docs tagline repetition

## Verification

- Landing: run the site app, confirm kicker renders above the h1 at desktop and mobile
  clamp sizes, light and dark themes.
- README: preview rendered markdown (GitHub-flavored) for the hero block and footer wink.
- Metadata: view page source, confirm `<title>` and `og:title` carry the new TITLE.
- npm description: `packages/it/package.json` diff only; shows on next publish.
