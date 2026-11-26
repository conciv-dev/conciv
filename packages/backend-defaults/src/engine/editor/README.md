# backend-defaults/src/engine/editor

## Overview

Opens source locations in an editor (`open.ts`); `createBackend` builds the opener from its `launchEditor` option.

## Invariants

- `makeEditorOpener` (`open.ts`): skips repeat opens of the same file:line:column within `windowMs`

## Side Effects

- `makeEditorOpener` (`open.ts`): calls `launch`, which opens an editor
