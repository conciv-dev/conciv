# @conciv/plugin-page-testkit

## Overview

Private dev-only package with one fixture: `pageTabs()`, a plugin that opens fake browser tabs on the page plugin's
connection (`experimental.page` attach, state, command, result), so engine and terminal tests drive page tools the way
the widget does, without a browser.

## Interface

- `exports` subpaths (`package.json`): ./page-tabs
- `scripts` (`package.json`): typecheck, lint
- `pageTabs()` returns `{plugin, open}`: list `plugin` in the engine's plugins, then `open(sessionId, answerFor, look?)`
  attaches one tab to that session and answers each command with `answerFor`.

## Invariants

- A tab whose attachment ends (the engine closed it, a plugin reload) attaches again on that end event, with no wake,
  until `end()` is called.
- No core import: core and cli take this package as a dev dependency, so it never depends on them.
