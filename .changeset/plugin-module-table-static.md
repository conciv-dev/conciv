---
'@conciv/app': patch
---

The table of modules a runtime plugin bundle shares with the widget now imports them statically, so host builds no longer print five `INEFFECTIVE_DYNAMIC_IMPORT` warnings. A plugin bundle still gets the widget's own instances of these modules.
