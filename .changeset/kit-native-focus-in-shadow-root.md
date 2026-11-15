---
'@conciv/ui-kit-system': patch
---

Keyboard focus works inside a shadow root: menus open on Enter and arrow keys, selects open on arrow keys, tabs move with arrows, Home and End, a number input commits its value when you Tab away, a hover card opens on keyboard focus, and switches, checkboxes and radio items show their focus ring, even when focus arrives from another control in the same shadow root. Before, these only worked when focus came from outside the widget.
