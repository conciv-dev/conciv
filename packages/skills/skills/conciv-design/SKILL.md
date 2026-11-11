---
name: conciv-design
description: Use when the user hands over a design and asks to build a page from it or make a page match it, such as a Figma frame link or a PNG mockup. Gets the design with conciv design get and drives the conciv design check loop until its verdict is done.
metadata:
  package: '@conciv/skills'
---

# Building a page from a design image

Building or matching a page from a design ("build this page from this Figma frame", "make this page match the design", a Figma link or a PNG mockup): first get the design with `.conciv/bin/conciv tools design get --figma <frame link> --route <path of the page you are building>` (repeat `--figma` with one frame link per width, or pass `--image <png>` for an image); the check measures the page at that route, and without `--route` it measures the page the tab showed when you called it. When the page is new, build it with the app's own components (`.conciv/bin/conciv tools design components`) before the first check. Then save, run `.conciv/bin/conciv tools design check`, fix only what its rows name, and repeat until its verdict is `done`. Never replace an expression with the design's sample text, and never set a width or height to a pixel value to match the design. Do not judge a design match from a screenshot.

## Sources

- `packages/extensions/design/src/shared/defs.ts`
- `packages/extensions/design/src/server/differ.ts`
- `packages/extensions/design/src/server/store.ts`
- `packages/harness-init/src/agent-guide.ts`
