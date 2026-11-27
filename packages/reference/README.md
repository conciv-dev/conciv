# @internal/reference

## Overview

Generated API reference data for every published package. The data is TypeDoc JSON read from each package's
BUILT `.d.ts`, one file per package, plus the CLI command tree and the harness list. The docs site reads it.

## Invariants

- Private to conciv and never published. Only `apps/site` may depend on it.
- Its `@conciv/*` devDependencies are exactly the published packages (`test/it/packages.it.test.ts`), so a new
  public package cannot be left out.
- The entry points of a package are the `types` of each subpath in its `exports`. In the JSON, a module is named
  after its subpath (`.`, `./vite`, ...). A package with one subpath has no module level: its exports are the
  project's children.
- Types that come from another workspace package or from `node_modules` are kept as references and never expanded
  (`excludeExternals` with `externalPattern`), so each package's file holds only its own API.
- TypeDoc drops a re-export whose declaration is external. The generator adds each one back to the module that
  exports it, so every public export is present: a declaration with `flags.isExternal`, the target's kind, no
  children, and a `type` that is a reference to the original symbol (`type.package`, `type.target.qualifiedName`).
- TypeDoc supports TypeScript 6 at most, so this package alone is on `catalog:ts6`.

## Side Effects

- `build` (`node src/generate.ts`) rewrites `dist/`: `<package>.json` per package (name without the `@conciv/`
  scope), `index.json` (each package's file and subpaths), `harnesses.json` and `commands.json` (copied from
  `@conciv/cli/commands.json`). Each file is exported at `@internal/reference/data/<file>`. `dist/` is gitignored.

## Verification

- `pnpm turbo run build --filter=@internal/reference`, then `turbo run test --filter=@internal/reference`.
- The JSON types are `JSONOutput` (re-exported from `typedoc`), `PackageIndex` and `Harness`.
