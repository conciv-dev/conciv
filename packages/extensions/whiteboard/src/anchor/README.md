# whiteboard/src/anchor

## Overview

`createReactAnchorResolver` captures an anchor by parsing the file with oxc-parser and fingerprinting the smallest enclosing JSXElement: an FNV-1a hash of its tag structure plus a salt from its ancestor tag path. To resolve, it re-checks the hash at the stored position, then scans every element for the hash and uses the salt to break ties, then maps the line across commits with `git diff -U0`. If all of these fail it reports the anchor as drifted or orphaned. confine.ts checks that paths stay inside the root and redacts secrets in snippets. load-resolver.ts lazy-loads the resolver and caches it per root. Other code imports these files from src/tool/anchor/server.ts, src/tool/comment/anchor-enrich.ts and src/server/enrich-worker.ts.

## Interface

- `createReactAnchorResolver({root})` (`resolver.ts`): returns an `AnchorResolver` with `capture`, `resolve`, `reanchor` and `locate`
- types `Anchor`, `Rect`, `ResolveStatus` ('fresh'|'moved'|'drifted'|'orphaned'|'ambiguous'), `ResolveResult`, `PickedTarget`, `AnchorResolver` (`resolver.ts`)
- `loadResolver(root)` (`load-resolver.ts`): dynamically imports resolver.js and memoizes the Promise per root
- `captureSource({root, file, line, column, commit})` (`oxc-capture.ts`): returns a `SourceAnchor` (file, line, column, component, hash, salt, snippet, commit)
- `hashAt(source, line, column)` (`oxc-capture.ts`): fingerprints the smallest JSXElement covering the position
- `scanElements(source)` (`oxc-capture.ts`): lists an `ElementFingerprint` for every JSXElement
- `confineToRoot(root, file)`, `isSecretPath(file)`, `redactSnippet(text)`, `SNIPPET_LIMIT` = 2048 (`confine.ts`)
- `headCommit`, `fileHash`, `isCommittedClean`, `mapLineAcrossCommits` (`git-track.ts`): git CLI helpers

## Invariants

- `confineToRoot` (`confine.ts`): throws 'refusing non-filesystem path' for URL schemes and `file:` paths. Using realpath, it throws 'path escapes project root' when the target is outside root, so symlinks are resolved
- `redactSnippet` (`confine.ts`): truncates to `SNIPPET_LIMIT` (2048) chars, then replaces sk_/pk_/rk_ keys, ghp_ tokens, AKIA keys, JWTs, Bearer tokens and *SECRET/TOKEN/PASSWORD/API_KEY/PRIVATE_KEY assignments with '[redacted]'
- `isSecretPath` (`confine.ts`): matches .env*, id_rsa, id_ed25519, id_dsa, *.pem, *.key, *.p12 and *.pfx. `captureSource` (`oxc-capture.ts`) and `relocated`/`resolve` (`resolver.ts`) blank the snippet for these paths
- `hashAt` (`oxc-capture.ts`): returns empty hash, salt and snippet with null component when no JSXElement covers the position
- `componentName` (`oxc-capture.ts`): only capitalized FunctionDeclarations, or capitalized VariableDeclarators initialized with an arrow or function expression, count as components
- `resolve` (`resolver.ts`): order is: same hash at the stored position gives 'fresh'; a single hash match gives 'moved'; several matches with exactly one same-salt match give 'moved'; otherwise several matches give 'ambiguous' with candidates (the same-salt pool when it is non-empty). Then, only when `src.commit` is set and `isCommittedClean`, the line is mapped across commits and a matching hash gives 'moved'. Otherwise the result is 'drifted' when there is a DOM selector and 'orphaned' when there is not, with a before/after snippet diff
- `resolve` (`resolver.ts`): an unreadable or unconfinable file gives 'orphaned'
- `mapLineAcrossCommits` (`git-track.ts`): returns null when the git diff fails or when a hunk overlaps the target line. Otherwise it shifts the line by the line-count deltas of hunks above it
- `reanchor` (`resolver.ts`): keeps the previous `instance` when the new target has no selector or rect
- `locate` (`resolver.ts`): picks the first element whose component name matches, falling back to a tag-name match, and returns null on confinement or read failure

## Side Effects

- `captureSource` / `resolve` / `locate` (`oxc-capture.ts`, `resolver.ts`): read source files from disk with fs/promises `readFile` and `realpath`
- `git` via `execFile` (`git-track.ts`): spawns `git rev-parse HEAD`, `git hash-object`, `git diff --quiet HEAD` and `git diff -U0 <commit> HEAD` in root, with a 16 MiB maxBuffer
- `cache` (`load-resolver.ts`): module-global Map holding one resolver Promise per root for the life of the process

## Verification

- Run: `cd packages/extensions/whiteboard && pnpm test`
