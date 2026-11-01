# brand/src

## Overview

Source root of `@conciv/brand`. This level holds only Storybook material: five `*.stories.tsx` demo files and the `brand-guidelines.mdx` docs page. The logo components live in the `react/` and `solid/` subdirectories.

## Interface

- [react/README.md](./react/README.md): React `ConcivLockup` and `ConcivMark`, entry for the `./react` export.
- [solid/README.md](./solid/README.md): Solid `ConcivLockup` and `ConcivMark`, entry for the `./solid` export.
- Storybook stories (demos, not public API): `favicons-social.stories.tsx` (`brand/Favicons & Social`), `lockup.stories.tsx` (`brand/Lockup`), `mark.stories.tsx` (`brand/Mark`), `motion.stories.tsx` (`brand/Motion`, uses `storybook/test` interactions), `usage.stories.tsx` (`brand/Usage`). They render the Solid components and files from `../assets`.
- `brand/Guidelines` (`brand-guidelines.mdx`): palette (Crimson `#D7263D`, Deep `#A4133C`, Charcoal `#15161A`, Cream `#F3EEE4`, White), typography (Geist SemiBold outlined to paths), mark anatomy, clear space, minimum size (24px; `mark-16` cut for 16-24px), do/don't rules and motion.

## Invariants

- The guidelines pin the mark fill to `#D7263D` while the wordmark follows `currentColor`; the components match this (`MARK_COLOR` on mark paths, `fill="currentColor"` on the root svg in `react/conciv-lockup.tsx` and `solid/conciv-lockup.tsx`). This is documented, not enforced by a check.

## Side Effects

- None

## Verification

- Run: `cd packages/brand && pnpm test`; stories are type-checked by `pnpm typecheck` through `tsconfig.json` `include`.
