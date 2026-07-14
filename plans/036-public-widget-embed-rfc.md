# Plan 036: Public widget embeds for conciv.dev and demo pages

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MEDIUM
- **Depends on**: the `@conciv/embed` self-host/public-bundle decision from plan 022
- **Category**: product/docs/demo
- **Planned at**: issue #58, 2026-07-15

## Why this matters

The product is an in-page dev agent, but the public site currently describes it instead of letting visitors see it as a product surface. The landing page has a polished scripted demo component, and the example apps dogfood the widget in dev, but neither gives the website visitor a real conciv widget frame mounted into the page they are browsing.

A public embed should make three things visible immediately:

1. the floating conciv entry point inside an actual page,
2. the chat/panel UI shape that users will install,
3. a safe interaction model that does not expose an unfunded live harness or a writable sandbox to anonymous traffic.

## Decision

Ship this in two phases.

### Phase 1: public replay widget

Mount the real `@conciv/embed` widget shell on conciv.dev and selected demo pages, backed by a replay/scripted transport rather than a real harness.

The replay mode should:

- render the same panel, composer, message stream, grab references, permission/tool cards, and page-control affordances as the dev widget,
- use a fixed transcript/scenario bundle checked into the site or demo app,
- make the composer explain that this is a public demo replay when a visitor types,
- avoid network calls to a model provider,
- avoid write access to the public site repo or filesystem,
- work on static hosting for the marketing site.

### Phase 2: opt-in live sandbox

Add a hosted live demo only after there is an explicit backend boundary for abuse controls, cost limits, per-session sandboxes, logging/redaction, and teardown. This phase is not required for the first public embed.

## Scope

### In scope

- `apps/site`: mount the public replay widget on the landing page after hydration.
- `apps/site`: add a short "Try the widget on this page" callout near the existing demo section.
- One hosted/example demo route or app: mount the same replay widget, default-open on desktop.
- `@conciv/embed` or a sibling demo harness module: add a documented replay/demo entry point if the current mount API cannot accept a fake transport cleanly.
- Tests that verify the site route includes the widget entry and the replay mode does not start the core engine.

### Out of scope for Phase 1

- Anonymous live LLM calls.
- Running user-authored commands.
- Persistent public sessions.
- Public write access to a real repo checkout.
- Replacing the existing animated landing-page mock demo. The replay widget complements it; it does not need to absorb all marketing animation work.

## Current state

- `apps/site/src/components/landing/demo/*` implements a local scripted demo, not the shipped widget.
- The Vite plugin can inject the dev widget into apps during local development.
- `@conciv/embed` mounts the private `apps/conciv` app into an open shadow root.
- `apps/site` uses TanStack Start and already has the Solid/dedupe groundwork from the site embedding fixes.
- Non-Vite self-hosting remains unresolved in plan 022: the old `@conciv/widget/global` docs reference was wrong, and the correct public global artifact still needs a product/API decision.

## Proposed architecture

### Public replay contract

Add a small replay transport surface that is independent from the dev core server. The replay transport should expose enough of the chat/session shape for the widget UI to render scripted states without booting `@conciv/core`.

Suggested shape:

```ts
type PublicReplayScenario = {
  id: string
  title: string
  initialMessages: ReplayMessage[]
  steps: ReplayStep[]
  grabs?: ReplayGrab[]
}
```

The replay layer should be data-only. It should not import testkit internals, real harness adapters, or filesystem-backed server code.

### Site integration

Create a client-only `PublicWidgetDemo` component in `apps/site` that:

1. lazy-loads the public embed/replay entry,
2. passes the selected scenario data,
3. mounts after the page is interactive,
4. respects reduced motion and mobile viewport constraints,
5. leaves the existing landing demo section intact.

### Demo-page integration

Pick one canonical demo page first, preferably the TanStack Start example because it matches the site stack and current `pnpm dev` dogfood path. Mount the replay widget there with the same scenario data so visitors see the widget in a less marketing-heavy app surface.

## Abuse and safety model

Phase 1 has no live provider and no command execution, so the public attack surface is mostly client-side rendering and bundle size. The replay data must be static and sanitized.

Phase 2 must not start until these controls exist:

- per-session sandbox lifecycle and hard timeout,
- command/tool allowlist,
- provider spend cap,
- rate limiting by IP/session,
- transcript retention/redaction policy,
- no repo secrets in the runtime environment,
- visible disclosure that the agent is live.

## Implementation steps

1. Confirm or add the public mount API.
   - If `@conciv/embed` can accept a replay transport without pulling in `@conciv/core`, use that.
   - Otherwise add a separate public demo entry that reuses UI packages without server dependencies.
2. Add a static replay scenario under `apps/site/src/components/landing/public-widget-demo` or a shared demo-data package.
3. Mount the replay widget on the landing page with a short callout and a "Reset demo" control.
4. Add the same replay widget to one demo/example app route.
5. Add a regression test that the site build includes the public demo component and that no core server boot path is imported into the replay entry.
6. Document the public replay vs. live sandbox distinction in the site copy.
7. Revisit Phase 2 only after the backend controls are designed.

## Verification

- `pnpm exec turbo run typecheck --filter=site`
- `pnpm exec turbo run build --filter=site`
- `pnpm exec turbo run test --filter=site`
- Browser smoke on the site landing page: widget appears, opens, replays messages, resets, and does not make model/core API calls.
- Browser smoke on the selected demo page: widget appears and opens without interfering with the app.

## Done criteria

- Public site shows a real widget shell, not only the bespoke animated mock.
- At least one demo/example page shows the same replay widget.
- Replay mode is static and safe for anonymous traffic.
- The code path is documented clearly enough that live-provider work cannot accidentally ship behind the replay UI.
- Issue #58 can be closed by the Phase 1 PR, with Phase 2 tracked separately if desired.
