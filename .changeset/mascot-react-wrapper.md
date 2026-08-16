---
'@conciv/mascot': patch
---

Add the React wrapper as `@conciv/mascot/react`, the same compound API as the Solid one: `<Mascot>` renders the whole robot on its own — head, antenna and eyes layers on a 44px default stage plus the binary effect — and `<Mascot.Head>`, `<Mascot.Eyes>`, `<Mascot.Antenna>` and `<Mascot.Binary>` replace the default they name, restoring it when they unmount. Parts claim their slot from a layout effect, so fragments, conditionals and any child order work, and a second child claiming a taken slot throws instead of rendering two of a part. Root props (`state`, `working`, `follow`, `activity`, `curve`, `initialSkin`) drive the framework-free core service; `follow` on the eyes or antenna opts one gaze channel out and `curve` on `<Mascot.Binary>` overrides the curve for that emitter alone. Consumer `style` is a plain React style object, merged over the core one except for the geometry the rig depends on, and refs compose with the wrapper's own.

`react` and `react-dom` are optional peer dependencies and `./react` is the only entry that reaches them, so the core, effect and Solid subpaths stay unaffected: a packed install with only React present imports the subpath and server-renders the whole robot. Under `<StrictMode>` the double-invoked mount leaves exactly one rig, one gaze listener and one emitter.

The stage-size sheet and the geometry blocklist both wrappers need moved into the framework-free core (`core/stage-sheet.ts`, `core/style-merge.ts`) instead of being copied.
