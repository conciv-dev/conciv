---
'@conciv/embed': patch
'@conciv/ui-kit-system': patch
---

The panel has a settings page: a gear in the session header opens it, a Back to chat button leaves it, and it reopens on the tab you used last. Each tab (General, Views, Shortcuts, Advanced) is its own route, so Back, reload and links land on the same tab. A narrow panel shows the tabs on top; a wider panel shows them as a left rail, and they glide between the two as the panel resizes. General sets color mode, skin, launcher, open on page load and close on outside click; Views shows, hides, pins and reorders (drag or Alt + arrow keys) the views in the tab bar; Shortcuts records new keys for each command and asks before taking keys another command uses; Advanced resets one part or everything. Settings are kept per project; values the project sets in `conciv({...})` show locked with the reason. The kit exports `FieldPrimitive`, `CheckboxPrimitive` and `RadioGroupPrimitive` for building custom controls on Ark.
