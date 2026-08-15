---
'@conciv/mascot': patch
---

Add the Solid wrapper as `@conciv/mascot/solid`: `<Mascot>` renders the whole robot on its own — head, antenna and eyes layers on a 44px default stage plus the binary effect — and `<Mascot.Head>`, `<Mascot.Eyes>`, `<Mascot.Antenna>` and `<Mascot.Binary>` replace the default they name, restoring it when they unmount. Parts register through context, so fragments, `<Show>` and any child order work; layer depth is fixed by part instead of by DOM order. Root props (`state`, `working`, `follow`, `activity`, `curve`, `skin`) drive the framework-free core service, and `<Mascot.Binary curve="arc">` overrides the curve for that emitter alone. `solid-js` is an optional peer dependency: the core and effect subpaths stay framework-free.
