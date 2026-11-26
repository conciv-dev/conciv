# clawd

## Overview

Clawd, the Claude mascot, as a static Solid SVG: the neutral front-facing pose only (body, eyes, four front legs, both arms slightly raised), no motion. It marks Claude in the connected agents row.

## Attribution

Ported from `src/clawd.js` and `src/core.js` of [JohnHeibel/ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase), MIT licensed, by way of its flat port in the preview-branches toolbar. The license is in `LICENSE` beside this file. Coordinates keep the source's units: the body spans x -5..5 and y -8..-2, the legs reach the ground at y 0; the view box is cropped to the arms and legs.

## Interface

- `Clawd({class})` (`clawd.tsx`): an `aria-hidden` SVG sized by its class; the width follows from the view box's aspect ratio when only the height is set
