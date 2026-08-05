# conciv

The conciv front door. One command sets a project up; after that the same CLI is what coding agents
use to drive the running app.

## Set a project up

```bash
npx conciv@latest init
```

init detects your bundler, package manager, and installed agent harnesses, then prints the whole
plan and asks once before it writes anything. On approval it installs `@conciv/it`, wires your
config, teaches your agents the conciv CLI through AGENTS.md, and installs the conciv claude plugin.
Anything it cannot do for you comes back as a card with the snippet to paste.

`--yes` approves the plan up front, `--dry-run` prints it and exits. init refuses a dirty git tree;
commit first or pass `--force`.

## Drive the app

```bash
conciv tools --help
```

`conciv tools` is self-describing, and it finds your running dev server itself: no MCP config, no
addresses.

- `conciv tools page` — read and drive the live page: snapshot, click, fill, edit, eval
- `conciv tools react` — inspect and edit live React components
- `conciv tools server` — inspect and nudge the dev server: config, urls, resolve, reload
- `conciv tools open` — open a file in the user's editor

These commands need the dev server running.

Docs: [conciv.dev](https://conciv.dev/docs/quick-start). Part of
[conciv](https://github.com/conciv-dev/conciv).
