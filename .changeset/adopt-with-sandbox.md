---
'@conciv/core': patch
---

Run chat turns through the library's own `withSandbox` middleware instead of conciv's `withConcivSandbox` copy. The sandbox now tears down when a turn is stopped, so a stopped thread leaves no instance record to resume from. Adopting it needs a vendored patch of `@tanstack/ai-sandbox@0.5.3` (`patches/@tanstack__ai-sandbox@0.5.3.patch`): the middleware declared the workspace-projection capability unconditionally while only providing it for definitions that carry a workspace, which failed every run, and it handed harness projectors a real host path where the sandbox filesystem expects a virtual one.
