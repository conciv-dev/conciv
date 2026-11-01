# Brainstorm input: the design driver for the conciv design extension

Repo: `/Users/omrikatz/Public/web/aidx-text` (conciv monorepo, branch `design-text-layer`, PR #683). The design extension is `packages/extensions/design`; its README (`packages/extensions/design/README.md`) and design docs (`docs/superpowers/specs/2026-11-01-design-text-layer.md`) describe what exists today: `design_target` registers a PNG for a route and width, `design_diff` compares the live page against it and returns ranked component deltas with source provenance, `design_status` says whether every width is `done`, the x-ray page shows the last run. Targets, runs and reports are JSON and PNG files under `.conciv/design/`. The server already has SQLite for other state.

## The problem

Nothing drives these tools. A user wants to say to their coding agent: "build this page according to this image" (or "make /invoices match this image"), and have the agent register the image, find or create the page, and iterate with the diff tools until the page matches, quickly and without setup beyond the app already running conciv. Today the agent must know the route and width, call two tools by hand, and nothing tells it the order in which to fix things or when to stop.

## Anchored hypothesis

1. A conciv **skill** the agent's harness picks up when the user asks to build or match a page from a design, plus one new tool **`design_start`**.
2. `design_start({ref, prompt?, route?, width?})` takes a design reference. Today a PNG path; later a Figma URL or another design tool, through the existing adapter contract: every adapter produces the same `TargetModel` (raster, viewport, node tree with text, fills, typography, layout), and everything downstream reads only that model. For an image, OCR and color sampling fill the model; a Figma adapter would fill it from nodes and skip them.
3. It registers the target, then **finds the route**: if the user named one, use it; otherwise match the model's text against the text of routes the server knows (captured before, or crawled); if no route matches with confidence, or several do, **ask the user**. If the user says the page does not exist, the agent creates it.
4. It returns **app facts** the server already knows (framework plugins present, known routes, source roots) so the agent does not rediscover them; the agent reads the repo for the rest (pages folder, component library) once.
5. The agent then runs the **loop**: diff, fix, diff. The diff report gains a **stage** and a short brief: structure first (unmatched regions, missing components, then box geometry: inset, gap, fill, align), then text (`text`, font size, line height, weight), then paint (background, foreground, radius), then residual (tiles above `tileGate` with no measured delta, shown as a diff image). Each round fixes the few top-ranked deltas of the current stage. Stops at `done` or at a round budget.
6. **Score, not a boolean**: every run records residual mismatch, deltas left per stage, rounds taken; a target records who approved it and when (the user, from the x-ray). All of this, plus targets and runs, moves into **SQLite** so it can be queried; the x-ray and `design_status` show it.

Non-goals for now: the Figma adapter itself (only the contract must hold), multiple design references per route, any UI beyond the x-ray additions named above.

Constraints: Node server, Vite plugin, no network at runtime, functions not classes, no new runtime services. Agents are LLM harnesses (Claude Code and others) speaking MCP to the conciv server.

## Addition after the reviewers were dispatched (not yet reviewed)

7. **Live rounds through HMR.** While a loop is active for a target, every HMR update the Vite plugin sees triggers a debounced diff of the open target. The x-ray shows each round as a step: score before and after, deltas removed and added, a regression flagged when a component's mismatch grew. The HMR payload names the changed module; components whose `source.file` matches are outlined in the live overlay and get a before/after thumbnail. Runs already persist per target (20 kept), so the x-ray gains a scrubber across rounds. Off outside an active loop so ordinary development does not pay for a capture on every save.
