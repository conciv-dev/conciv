# Ledger: app, composer, triggers, drafts, queue, steer and model prompt

Feature rows come from `features/app.md` (composer section) and the full per-row composer pass. One row per feature: the flow that covers it and the test, or `blocked: <what it needs>`, `e2e` or `story`. A row a test covers only in part says what is left.

Status words: `done` (committed test), `planned` (flow and runner chosen, file not written yet), `blocked: <what it needs>`, `e2e`, `story`, `not a test` (a behaviour no single product line carries, so no test can be seen failing).

## Files, in order

1. `apps/conciv/src/pane/pane-composer.dom.test.tsx`: typing and sending, the placeholder, Escape.
2. `apps/conciv/src/pane/queue-strip.dom.test.tsx`: send while running, the queue strip, Remove, Steer, Stop with a queue.
3. `apps/conciv/src/pane/trigger-sources.dom.test.tsx`: the `/` and `@` lists, picks, `/model`.
4. `apps/conciv/src/composer/session-model-prompt.dom.test.tsx`: the model menu and effort.
5. `apps/conciv/src/pane/draft-storage.dom.test.tsx`: the draft follows the session, Send clears it.
6. `apps/conciv/src/pane/pane-attachments.dom.test.tsx`: text attachments, the send caps.
7. `apps/conciv/src/composer/note-card.dom.test.tsx`: plugin notes and composer pills from a fixture plugin.
8. `apps/conciv/src/composer.browser.test.tsx`: real focus hand-offs and IME.

## Typing and sending (`pane/pane-composer.dom.test.tsx`)

| feature                                                                                   | flow                                          | test                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type and send with Enter: the message shows, the reply streams in, the agent got the text | type, Enter, read the reply                   | `apps/conciv/src/pane/pane-composer.dom.test.tsx` › sending with the keyboard › Enter sends the typed message, the composer empties and asks for the next instruction. Send by click: `chat.dom.test.tsx` |
| Placeholder "Ask a question…" on an empty thread, "Add an instruction…" after a turn      | same flow                                     | same test                                                                                                                                                                                                 |
| Placeholder "Add an instruction…" while running                                           | none                                          | not a test: the thread is no longer empty once the prompt shows, so `chat-pane.tsx` already names it; breaking the running branch in `pane-composer.tsx` changes nothing a user sees                      |
| Placeholder "Queue another instruction…" with a queue                                     | send while running                            | planned, file 2                                                                                                                                                                                           |
| Empty composer: Enter sends nothing                                                       | none                                          | not a test: the composer's `canSubmit`, `checkSend` and `@tanstack/ai`'s own `sendMessage` each refuse empty text; with the first two broken the test still passed                                        |
| Escape in the composer stops the run                                                      | send with Enter, Escape while the reply waits | `apps/conciv/src/pane/pane-composer.dom.test.tsx` › stopping with Escape › Escape in the composer stops a reply that is still working                                                                     |
| Stop (^C) and "Stopping…", the Stopped divider                                            | same flow                                     | same test (the Stopped divider); Stop by click: `chat.dom.test.tsx`. "Stopping…": planned: verify whether the label can be read before the stop settles                                                   |
| Send refused while the engine is unreachable                                              | none                                          | blocked: dropping the engine socket during a test                                                                                                                                                         |
| Composer locked while logged out or revoked                                               | revoke, then try to send                      | planned: `engine.revokeBrowsers()`                                                                                                                                                                        |
| Send while a compaction runs: refused silently, the text stays                            | none                                          | blocked: the quick harness has `compaction: false`                                                                                                                                                        |

## Queue and steer (`pane/queue-strip.dom.test.tsx`)

| feature                                                                   | flow                                | test                                                                             |
| ------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| Send while running: "Queue", "1 waiting · runs in order", it runs after   | gate the first reply, send a second | planned                                                                          |
| More than 3 queued: three rows plus "+N more"                             | same flow, five sends               | planned                                                                          |
| "Remove from queue": the item never reaches the agent                     | same flow                           | planned                                                                          |
| Steer: the item leaves the queue and interrupts the run                   | a hanging reply, Steer              | planned                                                                          |
| Stop with queued messages: their text comes back to the composer in order | gate, queue two, Stop               | planned                                                                          |
| Queue lost when the chat stream fails                                     | none                                | blocked: failing the chat stream (transport), which is not a run error           |
| Steer the engine refuses                                                  | none                                | blocked: making the interrupt send's engine answer fail                          |
| Stop pressed before the engine has the run                                | none                                | blocked: holding the engine's answer to the send (the gate holds only the model) |

## Triggers (`pane/trigger-sources.dom.test.tsx`)

| feature                                                                        | flow                       | test                                                                 |
| ------------------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------- |
| `/` opens "Commands": built-in `/model`, the harness `deploy`; typing filters  | type `/`                   | planned                                                              |
| Pick `/model`, or send exactly `/model`: the model menu opens, nothing is sent | type `/model`, Enter       | planned                                                              |
| Pick `/deploy` and send: it reaches the agent as text                          | type `/dep`, pick, Enter   | planned                                                              |
| Plugin slash command: listed, placed by `after`, run with its arguments        | fixture plugin             | planned                                                              |
| `@` lists skills and agents from project files; a pick inserts `@<name>`       | fixture project folder     | planned                                                              |
| `@` lists the session's tools under "Tools"                                    | type `@`                   | planned                                                              |
| `@` lists other sessions of this project by title, ranked; a pick inserts      | `engine.newSession(title)` | planned                                                              |
| `@` session ranking prefers sessions open in a `/quick` pane                   | history with a quick pane  | planned                                                              |
| `@<query>` lists files and folders; a pick inserts `@<path>`                   | fixture project folder     | planned                                                              |
| `/` list with no or other harness commands                                     | none                       | blocked: a command list per test (the quick harness's list is fixed) |
| `@` list stays usable when some catalogs fail                                  | none                       | blocked: making one engine answer fail                               |
| `@` shows a session from another project                                       | none                       | blocked: a session in another project's index                        |

## Model prompt (`composer/session-model-prompt.dom.test.tsx`)

| feature                                                           | flow              | test                                                |
| ----------------------------------------------------------------- | ----------------- | --------------------------------------------------- |
| Open the menu, "Claude" and "Older versions" groups, pick a model | click the prompt  | planned                                             |
| Effort for a model that has efforts; Haiku 4.5 offers none        | same flow         | planned                                             |
| Model menu close returns focus to the composer                    | keyboard          | planned, file 8                                     |
| Model menu with no or other models                                | none              | blocked: a model list per test                      |
| Switch the harness, switch blocked while running, switch refusals | none              | blocked: a second harness on the engine             |
| Model or effort changed from outside shows in the prompt          | `engine.setting`? | planned: verify whether `engine.setting` reaches it |
| Model list or other-harness catalog failed to load                | none              | blocked: making one engine answer fail              |

## Drafts (`pane/draft-storage.dom.test.tsx`)

| feature                                                               | flow                                  | test                                      |
| --------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------- |
| The draft follows the session inside one mount                        | type, open another session, come back | planned                                   |
| Send clears the draft                                                 | send, switch, come back               | planned                                   |
| A typed draft comes back after a reload                               | none                                  | e2e                                       |
| The engine's draft row written elsewhere replaces this browser's copy | none                                  | e2e                                       |
| Draft save fails: "draft unsaved" notice with Retry                   | none                                  | blocked: making one engine answer fail    |
| Deleted session with a draft moves it to the new session              | none                                  | blocked: deleting a session from the test |

## Attachments (`pane/pane-attachments.dom.test.tsx`)

| feature                                                             | flow                      | test                                   |
| ------------------------------------------------------------------- | ------------------------- | -------------------------------------- |
| Attach a text file, see its chip, remove it; Backspace at the start | upload, keyboard          | planned                                |
| Paste a file into the composer adds it                              | user-event paste          | planned                                |
| A sent text attachment reaches the agent                            | upload, Send, requests    | planned                                |
| More than 16 attachments refused, the text stays                    | upload 17 files, Send     | planned                                |
| Message over the socket budget refused                              | upload a large file, Send | planned                                |
| Attach an image and see it as an image chip                         | none                      | blocked: a harness with image input on |

## Notes, pills and actions (`composer/note-card.dom.test.tsx`)

| feature                                                                        | flow           | test                                                              |
| ------------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------- |
| Plugin composer pills: plain, `rows`, `menu`, `order`, `show`                  | fixture plugin | planned                                                           |
| Composer notes from a plugin: "Notes" list, Remove, the plugin `NoteCard`      | fixture plugin | planned                                                           |
| Send with notes: the agent gets the comment sentences, "Notes on this message" | fixture plugin | planned                                                           |
| Plugin `draft` host call and mounted-session draft edits                       | fixture plugin | planned                                                           |
| "..." menu: Start a new session, Compress the conversation                     | click the menu | planned                                                           |
| Connect agents menu and connected agents row                                   | none           | blocked: a hub-capable harness and connection rows in the home db |
| Grab an element, page comments as notes                                        | none           | e2e                                                               |

## Real focus and IME (`composer.browser.test.tsx`)

| feature                                                 | flow                  | test    |
| ------------------------------------------------------- | --------------------- | ------- |
| Closing the overflow menu returns focus to the composer | keyboard              | planned |
| Model menu close returns focus to the composer          | pick, Escape, outside | planned |
| Enter while composing (IME) does not send               | `isComposing` keydown | planned |

## Stories and package tests

| feature                                                           | where                               |
| ----------------------------------------------------------------- | ----------------------------------- |
| ui-kit-chat Composer, QueueItem, Attachment, HarnessModelSelector | story                               |
| ui-kit-chat draft writer: 300 ms batch, flush on unmount          | node test in `packages/ui-kit-chat` |
