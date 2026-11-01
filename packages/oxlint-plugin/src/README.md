# oxlint-plugin rules

## Overview

The oxlint JS plugin `conciv`: `plugin.js` registers twelve rules, each in its own file. Rules use oxlint's `createOnce(context)` visitor API; two share the vocabulary matcher in `vocabulary.js`, and `ast-walk.js` holds the generic AST walker.

## Interface

- `plugin.js:default` - `{meta: {name: 'conciv'}, rules}` with rule ids `banned-vocabulary`, `core-purity`, `lucide-per-icon`, `no-comments`, `no-locator-poll`, `no-predicate-waits`, `no-signal-ref`, `no-timers-in-tests`, `router-idioms`, `solid-test-render`, `test-file-budget`, `tool-card-shell`.
- `vocabulary.js:makeVocabularyRule` - builds a rule from `{terms, allowedNames, exemptFiles, allowedTermPaths, message}`; splits identifiers into camel-case segments and reports declarations containing a term.
- `ast-walk.js:walk`, `ast-walk.js:isNode`, `ast-walk.js:isIdentifier` - recursive AST traversal that skips `parent` keys and stops on a `'skip'` return.
- `banned-vocabulary.js:REWRITE_BANNED_TERMS` - `bridge`, `pipeline`, `maintenance`, `manager`, `sendWhenAvailable`, `holdAndFlush`, `veto`, `epoch`, `snapshotKey`, `externalRev`, `forceSend`, `adopt`, `attach`, `presence`.
- `core-purity.js:CORE_FOREIGN_TERMS` - `terminal`, `verdict`.
- `test-file-budget.js` - the only rule with options: schema `{max: integer >= 1}`, default `DEFAULT_MAX = 2`.

## Invariants

- `no-comments.js:default` reports every comment except directives matched by `DIRECTIVE_RE` (`eslint-`, `oxlint-`, `@ts-`, `@__PURE__`, `prettier-ignore`, `@license`, `sourceMappingURL` and others) and autofixes by removing it.
- `no-locator-poll.js:WEB_FIRST_REPLACEMENTS` maps a locator read inside `expect.poll` (`textContent`, `isVisible`, `count`, `getAttribute`, `inputValue` and others) to the web-first assertion to use instead.
- `no-predicate-waits.js:default` flags an exported declaration whose parameter type is a function returning `boolean`, a boolean union or `Promise<boolean>` (`BOOLEAN_TYPE_CHECKS`).
- `no-timers-in-tests.js:TIMER_NAMES` (`setTimeout`, `setInterval`, `setImmediate`) are reported wherever referenced, except as a member object or a non-computed property key; the rule has no filename filter and relies on config scoping.
- `no-signal-ref.js:default` flags a `createSignal` whose setter is only used as `ref={setter}` and whose getter is never read from a reactive scope.
- `router-idioms.js:default` reports bare `useSearch`/`useNavigate`/`useParams`/`useLoaderData` imports in files matching `ROUTE_FILE` (`src/routes/`), `useRouterState` selects that read `matches`, and `validateSearch` / `*SearchSchema` zod fields without `.catch(...)`.
- `solid-test-render.js:default` reports `render`/`hydrate` imported from `solid-js/web` in files matching `TEST_FILE`, except `EXEMPT_FILE` (`test/fixtures/host/main.tsx`).
- `tool-card-shell.js:default` reports a `CollapsibleCard` import from `@conciv/ui-kit-chat` (`FORBIDDEN_SOURCE`) in any file outside `packages/ui-kit-chat/` (`ALLOWED_FILE`).
- `lucide-per-icon.js:default` reports value imports from the `lucide-solid` barrel; it autofixes only when every per-icon path resolves, else reports `barrelImportUnresolved` without a fix.
- `test-file-budget.js:default` counts `*.test.{ts,tsx,js}` files under the nearest `package.json` directory, skipping `IGNORED_DIRECTORIES` (`node_modules`, `dist`, `__screenshots__`, `fixtures`, `host`), nested packages and `apps/examples`; it reports once, on the first sorted file, when the count exceeds `max`.
- `banned-vocabulary.js:default` exempts whole files listed in `PREEXISTING_MODULES` and allows specific terms at paths in `PREEXISTING_TERM_SITES`.

## Side Effects

- `lucide-per-icon.js:tryResolve` resolves `lucide-solid/icons/<name>` from disk with `createRequire(filename).resolve` and caches results per directory.
- `test-file-budget.js:testFilesUnder` reads the package tree with `readdirSync`/`existsSync` and caches file lists per package in `testFilesByPackage`; `displayDirectory` reads `process.cwd()`.
- All other rules are pure AST visitors with no I/O.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/oxlint-plugin` from the repo root (turbo builds the package and its dependencies first)
