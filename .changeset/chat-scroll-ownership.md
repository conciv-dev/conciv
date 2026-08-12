---
'@conciv/ui-kit-chat': patch
'@conciv/solid-stick-to-bottom': patch
---

Chat transcript scrolling is now owned by @conciv/solid-stick-to-bottom, a faithful Solid port of use-stick-to-bottom: the viewport only moves for pinned streaming follow, the scroll-to-bottom button, and sending a message. Chain-of-thought/reasoning cards auto-close once when their own content completes, and user toggles after that are permanent. Tool approval force-opens the tool card once. User card toggles never shift the viewport. Chain content defaults to grow, with a `grow` prop for the capped pane.
