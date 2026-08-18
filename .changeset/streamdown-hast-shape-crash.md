---
'@conciv/solid-streamdown': patch
---

Fix a crash (`TypeError: Reflect.ownKeys called on non-object`) that could occur mid-stream when markdown structure changes character by character (an unclosed `**bold**`/link/inline-code marker completing, or paragraphs splitting/merging). The hast tree built for each block is now normalized to a uniform node shape (`children`/`properties` always present, even on text nodes) before being handed to `createImmutable`, so a position that changes from a text node to an element (or back) between parses never hands the reactive wrapper's internal traps a value it can't call `Reflect.ownKeys` on. Node identity and style stability are unchanged.
