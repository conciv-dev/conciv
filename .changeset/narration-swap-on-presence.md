---
'@conciv/ui-kit-chat': patch
---

Rebuild the narration label swap on Ark's Presence so the outgoing activity unmounts after its exit instead of lingering, and cut straight to the latest title when activities churn faster than the animation. The swap is now a vertical slide inside a clipped line box, so two labels can never overlap into unreadable text. Drops the blurred keyframe that animated `filter` on text, and moves the fallback narration into the transcript flow so it sits tight to the last content instead of far below it.
