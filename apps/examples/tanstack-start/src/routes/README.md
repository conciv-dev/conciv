# routes

## Overview

File routes for the TanStack Start example: root document, home, about and a TanStack Form demo.

## Interface

- `Route` (`__root.tsx`): `createRootRoute` with head meta, stylesheet link and `RootDocument` shell
- `/` (`index.tsx`): `createFileRoute('/')`, component `App`
- `/about` (`about.tsx`): `createFileRoute('/about')`
- `/form` (`form.tsx`): `createFileRoute('/form')`, component `FormDemo` built with `useForm` from `@tanstack/react-form`

## Invariants

- `form.tsx:FormDemo`: field validators require a `role` (`Pick a role`) and accepted terms (`You must accept the terms`) before submit

## Side Effects

- `__root.tsx:THEME_INIT_SCRIPT`: inline script reads `localStorage['theme']` and sets the theme class on `<html>` before hydration
- `form.tsx:FormDemo`: `onSubmit` stores the submitted value in component state only; no network call

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=tanstack-start-example` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
