# api

## Overview

JSON server route: docs search.

## Interface

- `/api/search` (`search.ts`): GET, `createFromSource(source, {language: 'english'})` fumadocs search

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=site` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
