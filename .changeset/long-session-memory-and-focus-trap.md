---
'@conciv/ui-kit-system': patch
'@conciv/app': patch
---

A long chat session no longer leaks memory through truncated text and icon button tooltips: the shared tooltip group kept one reactive slot for every row that ever mounted, so a tab driven by an outside agent grew by about 50 slots per page call. The chat panel's focus trap now lets go while focus sits on the host page, so Tab on the host page moves through the host page instead of jumping into the panel, and the trap no longer rescans the panel on every chat update while an agent drives the page.
