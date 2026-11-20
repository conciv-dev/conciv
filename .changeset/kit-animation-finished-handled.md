---
'@conciv/plugin-testkit': patch
---

The happy-dom setup marks an animation's `finished` promise as handled when the animation is canceled, as the Web Animations spec does, so canceling an animation no longer raises an unhandled AbortError. A caller awaiting `finished` still gets the rejection.
