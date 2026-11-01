---
name: conciv-design
description: Use when the user hands over a design image and asks to build a page from it or make a page match it, such as a PNG mockup, a screenshot of a design or a Figma export. Registers the image as the design target and drives the conciv design diff loop until it stops.
metadata:
  package: '@conciv/skills'
---

# Building a page from a design image

Building or matching a page from a design image ("build this page from this image", "make this page match the design", a mockup, a Figma export): register it with `.conciv/bin/conciv tools design target <image>` (add `--scale 2` for a retina export). When the page is new, build it with the app's own components before the first diff. Then save, run `.conciv/bin/conciv tools design diff`, fix only what its brief lists, and repeat until the report sets `stop`. Never replace an expression with the design's sample text, and never set a width or height to a pixel value to match the image. Do not judge a design match from a screenshot.

## Sources

- `packages/extensions/design/src/shared/defs.ts`
- `packages/extensions/design/src/server/differ.ts`
- `packages/extensions/design/src/server/store.ts`
- `packages/harness-init/src/agent-guide.ts`
