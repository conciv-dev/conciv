# Test plan: plugins

Format and rules: `docs/specs/test-rewrite-after-port.md`. Old tests are cited as `<file>:<line>` at `9d4f4834f`
(`git show 9d4f4834f:<file>`). This file holds the recorder first, as the shape sample; the other plugins follow once
the maintainer has seen it.

## @conciv/plugin-recorder

Old tests: `packages/plugins/recorder/test/recorder.it.test.ts` (12 tests, 834 lines, real browser) and
`packages/plugins/recorder/test/recorder.test.ts` (40 tests, 1,752 lines, node). Each old test strings many behaviours
together; the Covers lines below name the part of the old test each journey takes over.

### Files

| file                                   | runner              | what is in it                                                 |
| -------------------------------------- | ------------------- | ------------------------------------------------------------- |
| `src/recorder.browser.test.tsx`        | vitest browser mode | journeys B1-B5: page capture, the Recorder tab, send to agent |
| `src/plugin-experimental.dom.test.tsx` | vitest happy-dom    | journeys D1-D2: the plugin in settings, tab restore           |
| `src/tools.test.ts`                    | vitest node         | journey N1: the four tools over `createEngine`                |
| `src/recordings.test.ts`               | vitest node         | journey N2: the recording store on `recordingStoreLayer(dir)` |
| `src/video.test.ts`                    | vitest node         | journey N3: video export and read back                        |
| `src/render.test.ts`                   | vitest node         | journey N4: keyframes                                         |
| `src/renderer-cache.test.ts`           | vitest node         | journey N5: one shared Chromium renderer                      |
| `src/distill.test.ts`                  | vitest node         | table T1: action log rows                                     |
| `src/*-machine.test.ts` (6 files)      | vitest node         | tables T2-T7: one per state machine                           |
| `src/<model>.test.ts` (7 files)        | vitest node         | M1-M7: each model on its timers, with fake timers             |

Browser mode is used only where capture or the rrweb player must run in a real page (both need real layout and an
iframe that renders). Everything the user does around them that needs no player is happy-dom.

The host page content a journey clicks (the "Press me" buttons) is rendered by the test with Testing Library `render`
before `mount`. **Decision needed**, see the end of this file.

### Browser mode: `src/recorder.browser.test.tsx`

**B1. The user acts on the page and watches it replay live in the Recorder tab.**
Start: `createEngine({plugins: ['@conciv/plugin-recorder']})`, host content: a "Press me" button and a "Not pressed"
output. Steps:

1. Open the chat, click the Recorder tab. Sees "Loading recording…", then "No recording yet: interact with the page
   first."
2. Click "Press me" on the page. The replay shows the pressed button; the replay does not show the widget (no Recorder
   tab inside it).
3. Press twice more. Sees "LIVE", the "Toggle playback", "Toggle fullscreen" and "Timeline" controls; each press shows up
   in the replay.
4. Focus the Timeline and press ArrowLeft. "GO LIVE" shows, the last press leaves the replay. Click "GO LIVE": "LIVE"
   shows and the last press is back.
5. Click "Toggle playback" (pause), press again: the replay does not show it. Click "Toggle playback": it shows, and
   "LIVE" is back.

Covers: `recorder.it.test.ts:109` (Recorder tab loading, nothing recorded yet, replays the page without the widget);
`:171` (follows live appends); `:653` (LIVE badge, labelled controls, scrub and GO LIVE, pause and catch up).

**B2. The agent records what the user does.**
Start: as B1, host content: "Press while idle", "Press me", "Press after the stop", "Press after the run" buttons, a
"Fixture input" field, an inline script, a large conciv font style.
Steps:

1. Click "Press while idle". `engine.session.tool('recording_pull').call({secondsBack: 120, keyframes: 0})` answers
   "No recorded activity in this window."
2. `recording_start`, click "Press me", type "sampling" into "Fixture input", press Tab, `recording_stop`. The stop
   answer holds `[click] clicked button "Press me"`; `recording_pull` holds it too, and the typing as one sampled
   value.
3. Click "Press after the stop", then `recording_start`, send one chat turn (`engine.session.send('hello')`), click
   "Press after the run", `recording_stop`: the answer holds the "Press after the run" click and none of the idle or
   after-stop clicks.

Covers: `recorder.it.test.ts:491` (idle captures nothing; click and typing right after start; pulled log; typing
sampled; quiet after stop; live across a finished run). The script-body and conciv-style stripping and the event size
cap move to T1/N2 tables on the distilled events (they are not visible to a user).

**B3. The user sends a recording to the agent.**
Start: as B1, host content: "Press me".
Steps:

1. Open Recorder, click "Press me", wait for the replay to show it.
2. Click "Send to agent". Lands on the Chat tab; the composer shows a "Screen recording" note with "N actions · Ns" and
   a "Remove Screen recording" button.
3. Click the note's "Play": the "Screen recording replay" dialog shows the summary, "Export video", "Toggle playback" and
   "Timeline"; play shows the pressed button. Close.
4. Press Enter in the composer. The note moves to "Notes on this message"; the reply "Hello from conciv" shows; the
   transcript does not show the "The user referenced the screen recording …" line the agent got.
5. Play the sent note again: the dialog opens. Unmount and `mount` again on the same engine (the reload): the sent note
   is still there and still plays.

Covers: `recorder.it.test.ts:238` (send lands on chat with the note, replay dialog, sent note, hidden reference, plays
after a reload). Its unwritable-folder, missing-recording and send-during-batch parts: see B4, N2 and Not carried.

**B4. The recording cannot be saved.**
Start: as B3, with a file written where `.conciv/recorder/recordings` belongs (`createEngine({files})`).
Steps: click "Press me", click "Send to agent": sees "Could not write the recording to the project folder. Try
again." and stays on the Recorder tab.

Covers: `recorder.it.test.ts:238` (unwritable folder message).

**B5. The player cannot load.**
Not planned until a way exists to make the player chunk fail without a connection fault (faults are out of the kit).
See Not carried.

### happy-dom: `src/plugin-experimental.dom.test.tsx`

**D1. The recorder is listed as an active plugin.**
Start: `createEngine({plugins: ['@conciv/plugin-recorder']})`, `mount({engine})`. Open the chat, Settings, Plugins tab:
the "recorder" switch is on and its "Server" part is shown; "Back to chat" shows the Recorder tab.
Covers: `recorder.it.test.ts:109` (active plugin with a browser part); `recorder.test.ts:252` (is active).

**D2. A Recorder tab left open restores to the chat once the recorder is gone.**
Start: an engine with the recorder; open the Recorder tab; stop that engine. A second engine on the same project files
without the recorder, `mount` on it: the chat dialog opens on the Chat tab, the composer is there, no Recorder tab.
Covers: `recorder.it.test.ts:793`.

### Node: tools, store, video, render

**N1. `src/tools.test.ts`: the tools without a page.**
`createEngine({plugins: ['@conciv/plugin-recorder']})`. `recording_start` with no page attached fails with "no page
client attached within 5s" (the attach deadline is a product option the test shortens); `recording_get` of an unknown
id fails; the skill is loadable and names `recording_start`, `recording_stop`, `recording_pull`, `recording_get`; a
refused stop is a tool error.
Covers: `recorder.test.ts:513` (tools offered, start fails without a page client, get until gone); `:912` (skill);
`:1026` (refused stop as a tool error); `recorder.it.test.ts:716` (start outlasting the attach deadline answers as
unattached).

**N2. `src/recordings.test.ts`: the store, on `recordingStoreLayer(tempDir)`.**
One journey: save, read back, keep within the size cap (also with a fresh full snapshot at its tail), keep the newest
50 when saves race, keep every racing save, report a save as saved when pruning an old one fails, read a corrupt or
pruned file as missing, report an unwritable folder, sweep stray partial files on start, read a recording as expired
after the seven day retention (clock as a product option), and read a saved recording after the store reopens the same
folder.
Covers: `recorder.test.ts:260` (store parts: project folder, size cap, newest 50, corrupt/pruned, unwritable, sweep,
reopen); `:583` (retention); `:727` (fits the size cap); `:814`, `:839` (concurrent saves, prune failure).

**N3. `src/video.test.ts`.** Export a short recording once into `<id>.webm` beside its json; several exports of one
recording started at once all get a complete video; a video larger than the cap reads back byte-identical in pieces; a
read past the end is empty and done; an unknown recording is refused.
Covers: `recorder.test.ts:757`, `:767`, `:788`.

**N4. `src/render.test.ts`.** Keyframes rendered in Chromium come back as image parts after the untrusted-data note; a
stream with no full snapshot renders none; a failed renderer keeps the text log and no image.
Covers: `recorder.test.ts:600`, `:689`, `:703`.

**N5. `src/renderer-cache.test.ts`.** One renderer shared between uses, disposed after five idle minutes and not before
(fake timers), launched again after a failed launch; closed when the plugin reloads or unloads.
Covers: `recorder.test.ts:1481`; `:989` (renderer closed on reload and unload).

### Node: tables and models

| id  | file                                   | covers                                                                                                                                                                 |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `src/distill.test.ts`                  | `recorder.test.ts:652` (only user-made input is typing); B2's script-body, conciv-style and size-cap parts                                                             |
| T2  | `src/capture-control-machine.test.ts`  | `recorder.test.ts:1095`; `:496` (viewer presence turns capture on, renews, turns off)                                                                                  |
| T3  | `src/visibility-pause-machine.test.ts` | `recorder.test.ts:1197`; `recorder.it.test.ts:540` (pause while hidden, resume)                                                                                        |
| T4  | `src/capture-session-machine.test.ts`  | `recorder.test.ts:1235`; `recorder.it.test.ts:540` (stale resume never attaches a second recorder)                                                                     |
| T5  | `src/boot-machine.test.ts`             | `recorder.test.ts:1284`                                                                                                                                                |
| T6  | `src/flusher-machine.test.ts`          | `recorder.test.ts:1334`; `:864` (bursts split under the cap, event at the cap kept, above dropped); `recorder.it.test.ts:586` (failed flush keeps its events in order) |
| T7  | `src/panel-machine.test.ts`            | `recorder.test.ts:1398`                                                                                                                                                |
| M1  | `src/capture-control.test.ts`          | `recorder.test.ts:1453`; `:1064` (capture sweep: lease runs out, expired capture off once)                                                                             |
| M2  | `src/flusher.test.ts`                  | `recorder.test.ts:1522`                                                                                                                                                |
| M3  | `src/visibility-pause.test.ts`         | `recorder.test.ts:1575`                                                                                                                                                |
| M4  | `src/capture-session.test.ts`          | `recorder.test.ts:1614`; `recorder.it.test.ts:586` (a stop overtaken by a newer start finishes)                                                                        |
| M5  | `src/boot.test.ts`                     | `recorder.test.ts:1657`                                                                                                                                                |
| M6  | `src/player-follow.test.ts`            | `recorder.test.ts:1687`; `recorder.it.test.ts:171` (a failed read resumes from the last cursor)                                                                        |
| M7  | `src/panel.test.ts`                    | `recorder.test.ts:1719`                                                                                                                                                |
| T8  | `src/rings.test.ts`                    | `recorder.test.ts:1431`                                                                                                                                                |

### Not carried

- `recorder.it.test.ts:171`, appends made while the socket was down: needs a connection fault (out of the kit). The
  resume from a cursor is M6.
- `recorder.it.test.ts:238`, a send while a flush batch is still on its way: needed a held socket call. The flush order
  is T6/M2.
- `recorder.it.test.ts:238`, "Recording not found" after the saved file is removed: needs the project folder changed
  in the middle of a test, which the kit does not offer. The store's missing read is N2.
- `recorder.it.test.ts:754`, `:767`, capture or player library failing to load, and Retry: needed failing chunk
  responses. Open until a product seam exists (Decision 2).
- `recorder.it.test.ts:653`, "without a write into a Solid store" console check: an implementation detail; a store write
  in dev throws and B1 fails anyway.
- `recorder.test.ts:260`, `:466`, rpc round trips and rpc events (flush, window, log, since, reset, client ids,
  cursors): wire detail with no user. What the user sees of them is B1-B3; the parts with logic are N2, T2, M1, M6. As
  opencode's plugin-browser, which tests its rpc through its schema and machines, not a client.

### Product options needed

- The page attach deadline (5 s) for N1.
- The retention clock for N2 (or fake timers, if the store reads `Clock`).

## Decisions for the recorder

1. **Host page content.** My pick: the test renders the host page content with Testing Library `render` before
   `mount`, in the same document. Alternative: a `mount` option for host content (a new kit option, needs your yes).
2. **Library load failures (`:754`, `:767`).** My pick: not carried now, listed on the follow-up ledger. Alternative: a
   product option to point the recorder at a chunk URL the test serves broken.
