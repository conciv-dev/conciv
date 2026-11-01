# Zoom-out lens (BRAINSTORM)

Bottom line: most parts exist or are not needed for "build this page according to this image". Missing: about a page of skill text plus one fix in `design_target`. No new tool, stages, scores or SQLite for v1.

## What the code already does

1. `design_target` defaults route and width: `input.route ?? liveRoute(page)`, width falls back to the live viewport (src/tool/steps/target.ts). Most of `design_start` is here.
2. Adapter contract exists: `TargetAdapter {accepts, load}`, registry `[imageAdapter]`. Figma needs no contract change.
3. Loop instructions already ship: packages/harness-init/src/agent-guide.ts line 20 (target, edit, diff, fix top components, diff again, stop at done) goes into the `conciv` SKILL.md. Missing: description never mentions designs/images/mockups so the request never triggers it; no route finding, page creation or round budget; assumes `--route`/`--width` needed. Real problem: width is the live viewport and is passed to `adapter.load`, so the image is fitted to the viewport. The image's width should set the viewport. This is the one server change.
4. Server knows routes: `FrameworkServerCore.manifest.routes()` (packages/protocol/src/framework-types.ts). Agent can read the pages folder. App facts need no new tool.

## Ranked findings

1. Blocker: cut `design_start`. Registering is `design_target`; route resolution is the agent's judgment from the sentence and repo; app facts already available. Skill text: "If the user named a route, navigate there. If not, list the routes and ask unless only one is plausible. If the page does not exist, create it and navigate. Then `design target <image>`."
2. Blocker: the skill is the whole feature. New `conciv-design` skill next to packages/skills/skills/conciv-* or extend `skillFile()`/`SKILL_DESCRIPTION` in harness-init. Triggers: build/match this page to this image/design/mockup/screenshot. Steps: navigate or create, viewport to image width, target, loop diff, fix top 3, diff. Stop: `done`, N rounds (8), or two rounds without progress; report what is left. "Do not eyeball the screenshot."
3. Major: cut text-based route matching. Speculative; needs crawler or cache, threshold, and a fallback that asks anyway. Agent asks when unsure.
4. Major: defer stages. Diff already ranks by impact. One sentence in the skill ("fix missing and unmatched components and geometry before color and text") gets the same order. Add `stage` only if runs show thrashing.
5. Major: defer scores, history, approval. `status` plus budget is enough to stop. Approval UI contradicts the "no UI" non-goal. If a number is wanted, `diff` returns delta count and residual ratio inline.
6. Major: SQLite is a separate feature. Nothing queries it yet; migration has its own risks. packages/db (drizzle) is there when needed.
7. Nit: `prompt?` has no consumer.
8. Nit: "agent reads the repo once" is skill guidance.

## Keep / defer / cut

Keep: skill with design triggers; viewport follows image width; optional delta count and residual inline in `diff`.
Defer: stage field and briefs; scores and history; route matching; Figma adapter.
Cut: `design_start` and `prompt`; SQLite move; approval tracking and its UI.

## Smallest version to try next week

1. Skill text with design trigger words.
2. Viewport follows image width when `--width` absent.
3. Three real cases: named existing route, new page, image without route. Count rounds, see where the agent sticks, let that decide stages, matching, scores.
