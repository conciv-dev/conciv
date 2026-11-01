# Comprehension lens (BRAINSTORM)

Paraphrase: user in a coding agent says "build this page according to this image" with a PNG; harness loads a conciv skill; agent calls `design_start({ref, prompt?, route?, width?})`; adapter builds a TargetModel (OCR text, sampled colors); server registers target; route resolved (named, text match, or ask; create if missing); `design_start` returns app facts; agent loops `design_diff` → fix → `design_diff`, stages structure → text → paint → residual, fixing top few deltas per round; stops at `done` or budget; score and approval recorded in SQLite, shown in x-ray and `design_status`.

## Findings

1. Blocker: order contradicts the existing tool. `design_target` registers per route and width; you cannot register before the route is known. State the real order or allow an unbound target.
2. Blocker: who asks the user, and how. A server tool cannot talk to the user. Define `design_start` result shapes: resolved, ambiguous (candidates with scores), no match, error. Say which side asks and how the answer returns (second call with `route`?).
3. Blocker: "page does not exist" path unspecified. Who picks the path, what call follows, must the route be served before the first diff, what happens to a target registered without a route.
4. Major: image ref may not exist as a path (pasted images). How does a pasted image reach the server; what relative paths resolve against; error when missing or not PNG.
5. Major: width unclear. Inferred from PNG width? DPR (2x export of 1440 is 2880)? One image = one width? Fit with `design_status` "every width".
6. Major: route matching underspecified. Who crawls, when, from where; confidence threshold; dynamic routes, auth-gated pages; cold start has no captured text so matching always falls through to asking.
7. Major: undefined terms: conciv, x-ray, source provenance, skill (format, triggers, other harnesses), "existing adapter contract", TargetModel schema, tileGate, tile, residual, brief, app facts, framework plugins, source roots, round budget, "few top-ranked", `done`, approved. Glossary or links; concrete defaults.
8. Major: image model claims more than OCR plus color sampling supply (no font family, weight, line height, nesting). State which TargetModel fields the image adapter fills and how stages behave when empty.
9. Major: stage progression ambiguous. Who picks the stage, earliest with deltas left? Regress on a paint fix that breaks structure? May the agent skip? What is in the brief?
10. Major: `done` and stop condition unclear. Zero deltas, residual threshold, or approval? What the user is told on budget exhaustion; who sets the budget.
11. Major: skill/tool split not stated. Order in skill text, in the stage field, or both; two sources of truth drift.
12. Major: SQLite move has no migration story. Existing files migrated or ignored; PNGs stay on disk; tool inputs/outputs unchanged?
13. Nit: prerequisites vague. Dev server running at diff time? Which browser? Fonts? "Quickly" has no target.
14. Nit: `prompt` purpose unstated; is `design_target` still needed; re-running `design_start` on a route with a target replaces?

## Questions before building

1. Exact result shapes of `design_start`; who asks on ambiguity.
2. How a pasted image becomes a `ref`.
3. Order: model, route, register.
4. Create-page path: who chooses the route, what call next.
5. Which TargetModel fields the PNG adapter fills.
6. Stage rules, `done`, budget, "few".
7. Route list on cold start.
8. Migration of files and callers to SQLite.
9. What approval means.
