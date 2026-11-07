# Chat column: no magic numbers (type, size, motion)

Follows `chat-column-gap-layout.md` on the same branch (`fix/permission-card-overflow`). Spacing is already tokens and
gap only. This sweep does the same for everything else that is still a raw value.

## Scope

The files of the chat column:

- `packages/ui-kit-chat/src/styled/turn-classes.ts`
- `packages/ui-kit-chat/src/styled/thread.tsx`
- `packages/ui-kit-chat/src/styled/trace/*.tsx` (stories excluded: their `w-[34rem]` demo frames stay)
- `apps/conciv/src/pane/chat-pane.tsx`
- `apps/conciv/src/pane/pending-approvals.tsx`

Raw values to remove there:

- font sizes: `text-[14px]`, `text-[12.5px]`, `text-[12px]`, `text-[11.5px]`, `text-[11px]`, `text-[10.5px]`,
  `text-[10px]`, `text-[9px]`, `text-[0.75rem]`
- line heights: `leading-[1.6]`, `[1.55]`, `[1.5]`, `[1.45]`, `[1.4]`, `[1.75]`
- letter spacing: `tracking-[0.13em]`, `tracking-[0.08em]`
- fixed sizes: `min-w-[38px]`, `w-[9px]`, `size-[9px]`, `size-[3px]`, `max-w-[50%]` (keep if it is a ratio, not a
  length; say which)
- transition durations: every hand-written `120ms` (and other ms) in a `[transition:...]` arbitrary value
- fractional scale steps used to hit a pixel: `pt-2.25`, `pb-2.5`, `before:px-1.25` in the queue strip

Hairline geometry (`1px`/`1.5px` borders) stays px.

## Order of preference (check before adding anything)

1. **The conciv UnoCSS preset first** (`packages/uno-preset/src`). It already has `theme` (`colors`, `radius`, `font`,
   `ease`, `animation`), `motion.ts` (`anim-*` and `trans-*` shortcuts), `density.ts`, `typography.ts`, `effects.ts`,
   `shortcuts.ts`. If a shortcut or theme key already expresses the value (e.g. `trans-color-bg`, `trans-border`,
   `trans-cbb`), use it; never re-spell it as an arbitrary value.
2. **Existing CSS tokens** in `packages/ui-kit-system/src/tokens.css` and the skin contract (`skin-contract.ts`,
   `skin-conciv.ts`, `skin-terminal.ts`): `--chat-space`, `--chat-text-micro`, `--chat-ease`, `--chat-ease-expo`,
   `--chat-radius-*`, `--chat-trace-gutter`, and the motion tokens added on `feat/page-agent-simulator`
   (`--chat-duration-normal`, `--chat-duration-slow`, `--chat-ease-in-out`; if that branch has not landed, add the
   same names with the same values so the two branches agree).
3. **Only then a new token**, and only as a small scale derived from an existing anchor, not one token per value:
   - a chat type scale (a handful of steps, e.g. micro / caption / meta / body-sm / body) with paired line heights,
     derived from one base size so density and skins scale it; map today's sizes onto the nearest step and list
     every value that moves by more than 0.5px;
   - letter spacing steps if more than one is needed;
   - icon/mark sizes as `--chat-space` multiples where possible, else one `--chat-mark` anchor;
   - durations: reuse `--chat-duration-*`; add a `--chat-duration-fast` only if 120ms has no existing token.
     New tokens go through the skin contract, both skins, and `pnpm gen:tokens`, and are exposed as preset `theme`
     keys (`fontSize`, `lineHeight`, `letterSpacing`, `duration`) so classes read `text-chat-meta`, `duration-chat-fast`
     and so on, not `text-[length:var(...)]` arbitrary values.

The preset's own `trans-*` / `anim-*` shortcuts hardcode ms too. Switch the ones the chat column files use onto the
duration tokens. List the rest in the report (not in scope here).

## Rules

- No visual change beyond the rounding to the scale; every moved value is listed with before/after.
- Repo AGENTS.md applies: zero comments, no `as`/`any`/non-null, no em dashes, functions not classes.
- Calm perf gate: `pnpm --filter @conciv/app test:perf` in Chromium and Firefox. Firefox `multi-tool` already fails
  on main (2 of 3); report it, do not hide it.

## Evidence

Headless screenshots before/after at 420px and 1240px, same states as `chat-column-gap-layout.md`, in both skins
(conciv and terminal), and with compact density. A table of every replaced value: file, old, new class, token.
