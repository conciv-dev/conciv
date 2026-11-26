# @internal/test-utils

Private, never published: the fake engine (`createFakeEngine()`), its scripted model (`FakeLLM`) and the story
connection helpers. The fake engine implements the real rpc contract from `@conciv/protocol` over an in-memory link
and answers like the real engine. It depends on no app, kit or defaults package, so any of them can use it in its
tests and stories.
