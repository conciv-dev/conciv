---
'@conciv/embed': patch
---

The session title in the panel header now reads the session list inside its own Suspense boundary. Previously that read sat directly under the route-level boundary, so every time the session-list resource was unresolved the router swapped the whole live panel for the full-pane loading indicator and swapped it straight back. That detached and re-attached the header, chat pane, and status bar as the same DOM nodes, which silently blurred a focused composer and left focus on `document.body`. The title now falls back to a skeleton on its own while the rest of the panel stays mounted, so opening the panel reliably lands focus in the composer.
