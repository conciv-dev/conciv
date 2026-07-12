# 002 — Fix broken `anim-spin` class: inline tool spinner never spins

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: HIGH
- **Category**: Purpose & frequency (state indication, silently broken)
- **Estimated scope**: 1 file, 1 line

## Problem

`packages/ui-kit-chat-tools/src/styled/tools/inline-tool.tsx:30` uses the class `anim-spin`, which is defined nowhere — `packages/uno-preset/src/motion.ts` defines `anim-tool-spin` / `anim-compact` / `anim-test-rot`, and the wind4 built-in utility is `animate-spin`. The class emits no CSS, so the LoaderCircle icon shown while any inline tool runs (Read/Edit/Grep/Glob/WebSearch/WebFetch and every other inline tool card) is a **frozen static icon**. The running state has no motion indicator at all.

```tsx
// packages/ui-kit-chat-tools/src/styled/tools/inline-tool.tsx:30 — current
class="text-[color:var(--chat-text-3)] anim-spin shrink-0 motion-reduce:[animation:none]"
```

## Target

```tsx
// target
class="text-[color:var(--chat-text-3)] anim-tool-spin shrink-0 motion-reduce:[animation:none]"
```

`anim-tool-spin` = `animate-spin animate-duration-[0.7s]` (already defined at `packages/uno-preset/src/motion.ts:29` and used by the chat now-line spinner at `packages/ui-kit-chat/src/styled/now-line.tsx:12` and `tool-fallback.tsx:55`).

## Repo conventions to follow

- Spinners use the `anim-tool-spin` shortcut with a `motion-reduce:[animation:none]` gate — exemplar: `packages/ui-kit-chat/src/styled/tool-fallback.tsx:55`.

## Steps

1. In `packages/ui-kit-chat-tools/src/styled/tools/inline-tool.tsx:30`, replace `anim-spin` with `anim-tool-spin`. Nothing else on the line changes.
2. Rebuild: `pnpm turbo run build --filter=@conciv/widget`.

## Boundaries

- Do NOT touch any other class on that element or any other file.
- If line 30 no longer contains `anim-spin`, STOP and report drift.

## Verification

- **Mechanical**: `grep -rn "anim-spin\b" packages/ | grep -v anim-tool-spin | grep -v dist` returns nothing; widget build passes.
- **Feel check**: in the dev app ask the agent to read a file; while the Read tool is running its inline card shows a spinning LoaderCircle at 0.7s/turn. With DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, the icon is static.
- **Done when**: the running-state spinner visibly rotates in the live app.
