---
'@conciv/protocol': patch
'@conciv/core': patch
'@conciv/client': patch
'@conciv/ui-kit-chat': patch
---

Run lifecycle: stop now acknowledges immediately and the session badge and timer read the run record.

The server publishes a run-lifecycle event on the session stream when a run starts, when a stop is
requested, and when the run driver settles it, and replays the last one to every new subscriber. Stop
marks the run cancel-requested and acknowledges before waiting for settlement, and the transcript read
that computes context occupancy moved off the settlement path into a later usage update.

The widget shows a disabled "Stopping…" control from the click until the run settles, with a timeout
fallback. FAILED now derives only from a run that ended with a terminal error, carrying that error as
the chip's title; a denied or nonzero-exit tool call stays in the per-turn rollup and no longer flags
the session. The elapsed timer keys on the persisted run id, so it survives a reload or a snapshot
that re-keys every message.
