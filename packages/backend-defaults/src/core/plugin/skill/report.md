# Report a conciv issue

Use this skill when the user wants to report a conciv issue or bug. Your job is to turn the user's problem into a
useful GitHub issue with standard diagnostics plus the context needed to reproduce and resolve it.

## Workflow

1. Collect the standard diagnostics below.
2. Ask only for missing details that are necessary to reproduce or understand impact.
3. Draft the issue in the standard format below.
4. Publish it with GitHub CLI after the user confirms the title and body.

Do not publish an issue without user confirmation. If GitHub CLI is not installed or not authenticated, explain
the blocker and provide the exact issue title and body for the user.

Before drafting, fetch <https://conciv.dev/docs/reference/troubleshooting>. If the page covers the problem, tell the user
what it says first; report only if the problem remains or the page is wrong.

## Standard diagnostics

Collect these values when possible. A snapshot captured when this skill was registered is appended below; verify
each value before publishing, and replace any that changed.

- conciv version: the version of `@conciv/it` in the project's `package.json` and lockfile.
- Node version: run `node --version`.
- Package manager and version: the `packageManager` field of `package.json`, or run `pnpm --version`,
  `npm --version` or `yarn --version` for the one the project uses.
- Bundler or framework and version: Vite, Next.js, webpack, Rspack, or other, from `package.json`.
- Operating system: run `uname -a` on Unix-like systems, or `ver` on Windows.
- Browser and version, when the problem is in the widget.
- Harness: which agent CLI is behind the chat, and its version.
- Active plugins.

## What to leave out

Never include secrets: tokens, API keys, the contents of `.conciv/`, environment variable values, private URLs,
or source code the user has not agreed to share. Reduce logs to the lines that show the problem. Ask before
including a file path that names a private project or person.

## Reproduction

Aim for the smallest set of steps that shows the problem on a fresh app:

1. The starting state: which quick start was followed, and what was changed after it.
2. The exact steps, one action per line.
3. What happened, with the exact error text, and where it appeared: the widget, the browser console, or the
   terminal that runs the dev server.
4. What was expected.

If the problem cannot be reproduced on demand, say how often it happens and what was different when it did.

## Issue format

Title: one line that states the defect, not the wish. Name the surface (widget, CLI, engine, install) first.

Body:

```
### What happens

### Steps to reproduce

### What was expected

### Diagnostics

### Anything else
```

## Publishing

After the user confirms the title and body:

```
gh issue create --repo conciv-dev/conciv --title "<title>" --body-file <file>
```

Search first for an existing issue with
`gh issue list --repo conciv-dev/conciv --search "<key words>" --state all`. If one matches, show it to the user
and offer to add a comment with the diagnostics instead of opening a new issue.
