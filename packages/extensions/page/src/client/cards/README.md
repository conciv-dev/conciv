# page/src/client/cards

## Overview

`GrabCard` (`grab-card.tsx`) is the attachment card for a grabbed element: it decodes a GrabPayload and shows a dom/image preview, a source label, and a Dialog with a toggle between snapshot and agent text. `GrabSnapshotFrame` (`grab-snapshot-frame.tsx`) renders grabbed HTML inside a sandboxed iframe in an SVG foreignObject. The page tool cards live in `@conciv/builtin-plugins` (`src/page/cards`).
