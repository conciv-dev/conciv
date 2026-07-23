---
'@conciv/grab': patch
---

Make the grab contract host-neutral: replace `StagedGrab.snapshot: ElementSnapshot` with `preview: GrabPreview`, a `dom | image` discriminated union so non-web hosts can emit a grab without a live `HTMLElement`, and add optional `GrabApi.grabbable`.
