---
'@conciv/embed': patch
---

Widget data no longer refetches just because it got old: every query stays fresh until the server pushes a change, an action in the widget invalidates it, or the window regains focus. Returning to the chat from settings sends no new request for the harnesses, models or tool catalog, and a change to one session refreshes that session instead of every open one.
