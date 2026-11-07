---
'@conciv/page': patch
'@conciv/extension-page': patch
---

The agent now acts on the page the way a person would. While it clicks, hovers, fills, selects, checks, presses or scrolls, a glowing mask covers the page and the agent's cursor glides to each target and ripples on press. The action then runs as a full pointer and keyboard sequence, so menus that open on pointerdown and fields that need focus behave as they do for a person. Two clicks on the mask stop the run. A hidden or disabled target is refused, and page tools never pick the widget's own elements. Every page query now carries the `agentId` it acts for.
