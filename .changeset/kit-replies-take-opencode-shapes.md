---
'@conciv/simulation': patch
'@conciv/backend-test-utils': patch
---

Test replies take the reply shapes of opencode's test model. `replies` is a list of `TestLLM` replies (`TestLLM.text`, `TestLLM.toolCall`, `TestLLM.hangAfter`) instead of strings, a request with no reply left fails the run instead of getting a fallback answer, and `engine.gate()` holds the next model request until the test releases it. plugin-testkit's `createEngine` also takes a `harness` option, a real adapter from `@conciv/harness`, which it passes straight to the engine.
