# frontend-defaults/src/drive

## Purpose

The widget half of drive mode, the `conciv.simulation.ui` built-in (`./drive`). It answers the `call` events its engine sends over the widget's own engine socket with the DOM (`widget-dom.ts`) and replies through the plugin's `result` method.

## Invariants

- The roles match opencode's: the engine listens on the Drive manifest's `ui` endpoint and a driver dials in; the widget never opens a socket of its own and never listens, because a browser cannot.
- The entry runs only when its engine lists the `conciv.simulation.ui` plugin, which the engine has only with `CONCIV_DRIVE` set.
- Dev builds only: `@conciv/app` adds the entry under `process.env.NODE_ENV !== 'production'`, so production bundles drop it.
- A reload or remount rejoins the engine socket; nothing here reconnects by itself.
