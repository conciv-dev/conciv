---
'@conciv/ui-kit-chat': patch
---

Fix double-constructed JSX props and tighten composer state handling.

- `ToolChip`'s `tip` and `Terminal`'s `rail` resolve their JSX prop through a `children()` memo, so a
  component passed as that prop is built once instead of two or three times.
- The model selector no longer disappears when the model list fails to load: it renders a retry
  affordance, announces the failure, and restores the picker once the retry succeeds.
- Thread auto-scroll runs off an explicit machine, and reactive-scope listeners and timers go through
  solid-primitives so they clean themselves up with their owner.
