---
'@conciv/plugin-design': patch
---

The design plugin reads a Figma frame: `design_get` takes a Figma link and returns the design tree (nodes, implied groups, reflow, text roles, components, variable names), over the Figma REST API with the `figma.token` option, or from the REST document the agent passes when no token is set.
