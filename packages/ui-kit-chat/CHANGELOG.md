# @conciv/ui-kit-chat

## 0.0.23

### Patch Changes

- [#1016](https://github.com/conciv-dev/conciv/pull/1016) [`81007d1`](https://github.com/conciv-dev/conciv/commit/81007d1f6e3b584203e56f85db1ad38d1a6dc97c) Thanks [@omridevk](https://github.com/omridevk)! - The captured element in a page action card sits in a frame that fits it, instead of a fixed-height frame with an empty grey band under a small element.

- [#999](https://github.com/conciv-dev/conciv/pull/999) [`5724db1`](https://github.com/conciv-dev/conciv/commit/5724db197a3f71c050123dd34a82416031a1ecbb) Thanks [@omridevk](https://github.com/omridevk)! - A style change in a plugin or kit that the widget's stylesheet reads now rebuilds that stylesheet, instead of the build reusing an older copy that lacked the new styles.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - The composer saves its pending draft as soon as focus leaves it, so an edit made just before closing the panel survives a reload in a browser that refuses site storage.

- [#972](https://github.com/conciv-dev/conciv/pull/972) [`21a5651`](https://github.com/conciv-dev/conciv/commit/21a56511c8515b565617f163cd5c336cb462ddff) Thanks [@omridevk](https://github.com/omridevk)! - A message action bar reached with Tab keeps keyboard focus when the pointer moves off its turn, instead of hiding and dropping focus to the page.

- [#1145](https://github.com/conciv-dev/conciv/pull/1145) [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344) Thanks [@omridevk](https://github.com/omridevk)! - A plugin can add a notice to a session with `session.synthetic({sessionID, text, ...})`, as opencode's: the notice waits in the session's inbox, wakes an idle session into a turn (unless `resume: false`), goes in with the next run when a run is live or stopped, and the same `id` twice stores one notice. The model gets the notice text as a user message, a resumed CLI session included; the chat shows the notice as its own row labelled with its description, and hides one whose description is missing or only spaces, unless the notice failed (metadata `state: 'error'`, or a shell notice that completed with a non-zero exit or a timeout), which shows under its text. A notice is never a session's title: a session takes its first typed message as its title.

- [#1142](https://github.com/conciv-dev/conciv/pull/1142) [`84ea7e3`](https://github.com/conciv-dev/conciv/commit/84ea7e3fe676a4c875535e2f20ca3bc6ffa84c93) Thanks [@omridevk](https://github.com/omridevk)! - A plugin declares its own icons as SVG documents in `Plugin.define({icons})`, and names them through `ctx.icons` in every SDK icon field and in `ctx.ui.Icon`, as opencode's plugins do: `IconName` is now `AppIconName | PluginIconName`. The app draws every icon name through one `Icon` from `@conciv/ui-kit-chat`, and tool cards show an icon in their header (the TanStack cards and the inspector chip show the TanStack logo).

- [#969](https://github.com/conciv-dev/conciv/pull/969) [`bc6656b`](https://github.com/conciv-dev/conciv/commit/bc6656b7e91418c54f7eee94fa08bcf5ed434d5b) Thanks [@omridevk](https://github.com/omridevk)! - A refused attachment shows why on its chip.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A reply that runs a tool before it writes text keeps its place on screen when the text arrives: the trace the user hid stays hidden, opened tool cards stay open and focus stays on the control the user pressed. The chat library renames the reply's message when its text starts, and the thread no longer treats that as a new reply.

- [#907](https://github.com/conciv-dev/conciv/pull/907) [`64c2f50`](https://github.com/conciv-dev/conciv/commit/64c2f5051d0558d7d1a7cb43a9e68f3970709c6b) Thanks [@omridevk](https://github.com/omridevk)! - A new session that has not run anything yet no longer says DONE in the status bar or LAST TASK in the header. The bar shows no status until the first message runs, and the header reads just CONCIV. After the first turn they read as before, and a session that ran reads DONE as soon as it opens, before its conversation loads.

  Every session row (`sessions.get`, `sessions.list`, `sessions.search`) now carries `lastRunAt`: when its newest run started, or `null` before the first run. `sessions.create` now answers `{sessionId, session}`, the new session's row, so a new session draws at once.

- [#986](https://github.com/conciv-dev/conciv/pull/986) [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf) Thanks [@omridevk](https://github.com/omridevk)! - A thread resting on its end lands on its end again when its viewport shrinks, such as when a strip appears above the composer or the composer grows. Before, the shrink moved no scroll offset, so the last message slid under the viewport's bottom edge.

- [#998](https://github.com/conciv-dev/conciv/pull/998) [`20b7c05`](https://github.com/conciv-dev/conciv/commit/20b7c05ecc0a1d1d4778fdf3ace6494f0433a5e4) Thanks [@omridevk](https://github.com/omridevk)! - A turn the agent started that fails before any reply keeps your message in the conversation and shows its error with Retry, instead of a passing "Couldn't load this conversation" and the text back in the composer.

  "Couldn't load this conversation" shows only when the conversation's history failed to load: a first message the engine refuses shows its error row with the text back in the composer and a notice that says why, like a later refused message.

- [#1158](https://github.com/conciv-dev/conciv/pull/1158) [`04c64fe`](https://github.com/conciv-dev/conciv/commit/04c64fe96e59c8363a72b11ed58f4fa63e2f04cf) Thanks [@omridevk](https://github.com/omridevk)! - An icon root that loses its last icon releases its sprite.

- [#977](https://github.com/conciv-dev/conciv/pull/977) [`cde9c35`](https://github.com/conciv-dev/conciv/commit/cde9c350ae4966ae66258f25661a7ad3de485dcd) Thanks [@omridevk](https://github.com/omridevk)! - An image in a message given as a data or blob URL is named "image" instead of by its encoded data.

- [#1114](https://github.com/conciv-dev/conciv/pull/1114) [`9682389`](https://github.com/conciv-dev/conciv/commit/9682389739ca98d316d202e3a5abd54828a79b43) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/ui-kit-chat` exports `AttachmentCardProps`, the props an attachment card receives, next to `AttachmentCardSlot`.

- [`e97f7c2`](https://github.com/conciv-dev/conciv/commit/e97f7c2440c6a3946ca3594c692e566305f4e953) Thanks [@omridevk](https://github.com/omridevk)! - An attached text file part no longer carries a blank line in front of it. The composer puts one blank line between the text parts it sends, so typed text and a file stay separate paragraphs and a message with only an attachment starts with the attachment.

- [#935](https://github.com/conciv-dev/conciv/pull/935) [`0b7f78a`](https://github.com/conciv-dev/conciv/commit/0b7f78acc061692acdca35cc2e5462c75a02e2a3) Thanks [@omridevk](https://github.com/omridevk)! - A patch header with no file name after `File:` no longer shows the next line as the file, on the patch card or in the turn summary, and a header followed only by spaces or tabs no longer adds a nameless file to the patch card. Very long tool names no longer freeze the chat while their label is worked out.

- [`956c20d`](https://github.com/conciv-dev/conciv/commit/956c20dfcbfed72523bb38f8c8632f06e2c6df59) Thanks [@omridevk](https://github.com/omridevk)! - The kit Chip's `maxWidth?: 'full' | 'compact'` prop becomes `compact?: boolean`, and `ctx.ui.Chip` takes the same `compact` prop: a compact chip is capped at a short width, cut with an ellipsis, and shows its full value in a tooltip.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The session status chip says WAITING while a permission card is open. `SessionStatusInput` takes `approvalPending`, and the chat pane sets it from the session's pending approvals, as opencode marks a session with an open permission request as waiting for approval.

- [#1022](https://github.com/conciv-dev/conciv/pull/1022) [`35347d2`](https://github.com/conciv-dev/conciv/commit/35347d2abd0aeb696eaa04e8df49ca7bc1d44fa9) Thanks [@omridevk](https://github.com/omridevk)! - Code in tool cards sits on the same sunken surface as the JSON and console bodies. The preset gains a `rounded-chat-sm` radius token for the small chat corner.

  A file's name is now the header of its code block, set apart from the code by a line. Every code and diff block has a copy button, in the header when the block names a file and at the top right otherwise, and a block cut short by its height limit shows how many lines are hidden and opens to show them all.

  A bash call shows one box: its command is the header row, with copy and the expand control on that same line, and the output below. A long block shows exactly eleven lines (seventeen for logs and files) and its expand control names the true number of hidden lines; the trace row no longer clamps a code block a second time. Search matches, code-run output and a finished code fence in a chat message use the same header. Every icon in a kit button is a block box, so it centres with its label at any line height.

- [#1192](https://github.com/conciv-dev/conciv/pull/1192) [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980) Thanks [@omridevk](https://github.com/omridevk)! - Code blocks draw in their card while a reply streams, name their language with a code icon, highlight every shiki language and sit apart from each other; thread rows re-measure after a skin change; a tab opened while its session is deleted is closed; the hub answers tasks.

- [#827](https://github.com/conciv-dev/conciv/pull/827) [`f2d65ca`](https://github.com/conciv-dev/conciv/commit/f2d65ca836ddf7ff5cdd79bcd56a4f7aab86bb00) Thanks [@omridevk](https://github.com/omridevk)! - Code highlight and diagram caches free the entries they drop, so a long chat with many code blocks no longer keeps one tracking signal per block it ever rendered.

- [#989](https://github.com/conciv-dev/conciv/pull/989) [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae) Thanks [@omridevk](https://github.com/omridevk)! - A composer draft can hold structured items beside its text, attachments and quote: each item is a key and a JSON value. The chat kit's composer keeps them by key (`addItem` keeps the existing item when its key is already there, `updateItem` and `removeItem` change or drop one), and they come back after a failed send and after a reload. The engine's draft row stores them in a new nullable `items` column (an additive migration); a draft saved before this reads back with no items. The item's one shape is `DraftItemSchema` (type `DraftItem`) in `@conciv/types/chat-types`, which the draft row, the engine table and the kit's composer all read.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A file path in a chat message that the host confirmed exists now shows in opencode's code-path blue (`#2c47c8` in light mode, `#c3d4fd` in dark mode, the new `--chat-code-path` token), fading into it once the check answers (no fade under reduced motion). When the host can open files, the path shows a pointer and underlines on hover with opencode's underline (the path's blue at 40%, offset 2px) and shows the kit's accent focus ring on keyboard focus, and a local file link shows a pointer. `@conciv/solid-streamdown`'s `styles.css` no longer styles local links or confirmed paths; the chat theme does.

- [#986](https://github.com/conciv-dev/conciv/pull/986) [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf) Thanks [@omridevk](https://github.com/omridevk)! - The composer takes an optional `draftWriter` (type `ComposerDraftWriter`, synchronous, returns nothing). When it is set, every draft change, attachments included as `File`s, is handed to it at once, and the composer's own debounced storage write is not used.

  Attachments carry an optional `blob: {id, url}`, a host's reference to where it stored the attachment's bytes, as opencode's image attachment part does. The kit never reads it; it travels with the attachment through upsert, a refused send's put-back and restore.

  A new entry, `@conciv/ui-kit-chat/draft-storage`, exports `encodeAttachments`, the encoder the composer uses to store draft attachments, and it loads under node.

  An attachment whose bytes cannot be read is still left out of the stored draft, and the encoder now logs it with `console.error`, naming the file, instead of dropping it silently.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - A composer draft write that started earlier no longer stores after a later one: a draft with a file, flushed just before the message was sent, used to land after the cleared draft and bring the sent text back on the next load.

- [#876](https://github.com/conciv-dev/conciv/pull/876) [`d8c2c1b`](https://github.com/conciv-dev/conciv/commit/d8c2c1b3850be01ab52fa35f998ef247c6bd5671) Thanks [@omridevk](https://github.com/omridevk)! - The text you typed in the chat is still there when you switch views quickly and come back.

- [#976](https://github.com/conciv-dev/conciv/pull/976) [`f5f2ac4`](https://github.com/conciv-dev/conciv/commit/f5f2ac4b2e9ca100f61137af484128824ad377ea) Thanks [@omridevk](https://github.com/omridevk)! - Each chat message is an article named by who wrote it and the prompt it belongs to.

- [#1150](https://github.com/conciv-dev/conciv/pull/1150) [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/ui-kit-chat/tools` no longer exports `ElementPreview` or the `ELEMENT_CAPTURE_FIXTURE_*` samples, and no longer depends on `rrweb-snapshot`: nothing drew the preview, and the page plugin's stories keep the two samples they use.

- [#816](https://github.com/conciv-dev/conciv/pull/816) [`564dd14`](https://github.com/conciv-dev/conciv/commit/564dd148e0dd2f8b7b7b252211f00b5349bab101) Thanks [@omridevk](https://github.com/omridevk)! - The widget bundles are now small classic-script loaders over shared, code-split ES chunks in `dist/widget/`, so mermaid, katex, shiki grammars, xterm and the chat highlight worker load only when used, and the IIFE source maps are gone (the embed `dist` drops from 152 MB to about 30 MB). Serve `dist/widget/` next to `conciv-widget.global.js`; the native page serves it automatically.

- [#848](https://github.com/conciv-dev/conciv/pull/848) [`8d57382`](https://github.com/conciv-dev/conciv/commit/8d57382a4365e2031bc484478b5b8950bd45cca9) Thanks [@omridevk](https://github.com/omridevk)! - The ui-kit-chat composer no longer sends a second stop when Escape is pressed while the run is already stopping. `useComposer().canCancel()` is now false while the run is stopping, and the new `useComposer().isRunning()` keeps the Stop control on screen (disabled) until the run ends.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The status bar's changed-files cell no longer counts an Edit, Write or apply_patch call that failed: a failed call changed no file.

- [#968](https://github.com/conciv-dev/conciv/pull/968) [`1780a56`](https://github.com/conciv-dev/conciv/commit/1780a5662afcdb273b2ac2d212ba49487f1b1216) Thanks [@omridevk](https://github.com/omridevk)! - A tool call with no card of its own now reads "Called <tool>" with its main input and up to three other arguments, and its trace row shows that input instead of the tool name.

- [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa) Thanks [@omridevk](https://github.com/omridevk)! - A Claude Code or Gemini command that asks now waits on its permission card through conciv's permission service instead of being refused and retried on the next turn: allow runs it, reject denies it with the reason. An ask ends with its run, and its card leaves every open widget when the run stops, the CLI gives up on the prompt, or a waiting caller leaves. Cards replay from the permission service's pending asks; the old per-session approval grants and the "Approved: ..." re-send are gone, and `chat.permissionDecision` answers `{ok: true}`.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - `MarkdownProvider` hands `openLocalFile`, `localFileExists` and code block content to every `Markdown` below it, as opencode's markdown context does; `codeBlocks={false}` turns the content off below.

  A fence whose code block content declines, fails or throws shows the normal highlighted code block, as opencode does.

- [#868](https://github.com/conciv-dev/conciv/pull/868) [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af) Thanks [@omridevk](https://github.com/omridevk)! - Names ending in "Of" are gone from conciv code: every function, type and member is named with a verb first that says what it does, and the `conciv/no-of-suffix` lint rule keeps it that way. Renamed public exports: `@conciv/types/chat-event-types` `approvalAskOf` is now `readApprovalAsk` and `approvalSettledOf` is now `readApprovalSettled`; `@conciv/extension` `ConfigOf` is now `InferConfig` and `SettingsOf` is now `InferSettings`; `@conciv/db` `modelOf` is now `readModel`; `@conciv/ui-kit-chat` `parentToolCallIdOf` is now `readParentToolCallId`, and `rowMarkOf` (`@conciv/ui-kit-chat/tools`) is now `resolveRowMark`; `@conciv/ui-kit-chat-tools` `patchTextOf` is now `readPatchText`. Renamed public members: `@conciv/ai/client` `ChatSession.harnessOf` is now `readHarness`, and the `@conciv/ai/server` `drizzleChatStores` option `harnessOf` is now `readHarness`; `@conciv/mascot-react` `MascotContextValue.claimOf` is now `readClaim`; `@conciv/ui-kit-system` `VirtualListProps` `sizeOf` and `keyOf` are now `readSize` and `readKey`.

- [#989](https://github.com/conciv-dev/conciv/pull/989) [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae) Thanks [@omridevk](https://github.com/omridevk)! - The host always draws a note's frame: a plugin's `NoteCard` draws only the inside, now shown framed like the host chip, and a taller inside grows the frame. Every staged card that can be removed (a note, a grab card, an image or file chip, a chip that failed to attach) has the same remove button, as opencode draws it: a small round grey badge with a thin white outline and a white X, sitting on the card's top end corner, outside the card's flow, so it takes no room in the card. It shows when the pointer is over the card or focus is inside it, fades in, stays shown on a device without hover, has no tooltip (its accessible name is "Remove" and the card's name), and shows the focus ring around it when reached by keyboard. Public surface: `@conciv/ui-kit-chat` exports `CornerRemoveButton` (`label`, `onRemove`), that remove button; its parent must be a positioned `group`. The button takes its handler from its caller, never from the composer context: `AttachmentByMime` and `AttachmentUI` take `onRemove?: (id: string) => void` in place of `removable` (present means removable, and the badge calls it with the attachment's id), and the styled `Composer`'s `AttachmentComponent` gets that `onRemove` from the composer. An attachment card renderer gets that same handler, never a pre-built button: `AttachmentCardProps`, now exported from `@conciv/ui-kit-chat`, is `{onRemove?: (id: string) => void}` in place of `remove?: JSX.Element`, and each card draws `CornerRemoveButton` itself and calls `onRemove` with its attachment's id, as opencode's cards own their remove button. A card from an old extension (`@conciv/extension`) is drawn without a remove button.

- [#989](https://github.com/conciv-dev/conciv/pull/989) [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae) Thanks [@omridevk](https://github.com/omridevk)! - A note a plugin attaches now shows as a card in the composer, before the attachments: the plugin's own `NoteCard` for its origin when it draws one, and the host's card (the comment, and the note's icon with its subtitle or label) when it draws nothing or fails. Each card has a remove button. When the message is sent, the model reads one sentence per note after the typed text, and the message's metadata carries `displayText`, `comments` and `attachments` at its top level, as opencode does, so a plugin's `prompt` hook reads the notes from it. The conversation and the session title show what the user typed, with every note as a card under it, as opencode does, also after a reload; a first message of notes alone titles the session with its first note's label (such as `Screen recording`), never the sentence written for the model. A refused send keeps the notes in the composer, and a queued message that comes back (Stop, a failed stream, a refused Steer, also while its pane is closed) returns as the typed text with its notes as cards again, so a resend sends each sentence once. A message of notes alone is still an article named `You: N notes` with its time. New session from a deleted session carries its notes. A saved note that no longer decodes is dropped when the draft is restored, so that note cannot keep Send enabled unseen; other saved items are restored as they were. A widget command typed with notes staged (such as `/model`) runs instead of reaching the model, and the notes stay staged. The chat kit's `onSend` handler now receives the draft beside the content, and a draft of items alone can be sent.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The chat's now line (the status row that says what the agent is doing) is named "Agent activity", so assistive technology and tests can tell it apart from the trace row that shows the same title.

- [`8690874`](https://github.com/conciv-dev/conciv/commit/869087424d55eb15e5b623314569e7ecefbf6b5a) Thanks [@omridevk](https://github.com/omridevk)! - The last pieces of the old extension system are gone. The plugin host no longer keeps a list of mounted extension names (it was always empty), so a plugin can register any rpc id. The tool list no longer carries an `extension` field nothing set, and a crashed plugin is logged as a plugin. The ui-kit-system token contract for third-party UI is now the plugin author contract (`docs/plugin-tokens.md`), and the READMEs describe plugins instead of extensions.

- [`0bc80ef`](https://github.com/conciv-dev/conciv/commit/0bc80ef1b0ded255ab9e66a84baf6b5724f2d59f) Thanks [@omridevk](https://github.com/omridevk)! - Leftovers of the old extension system are gone: the Combobox `ModelSelector`, the permission expiry chip, the terminal rail and `inject`, the dialog `layer` prop and `DialogApi`, `StagedGrab`, the `./tokens` subpath and the window React bridge global.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - A session whose harness fails to list its models no longer fails the whole model menu or the terminal. The session models answer still carries the harness, with `modelsFailed` set, so the menu keeps the other harnesses and shows a retry row for the one that failed, and the terminal tab still shows for a harness with a terminal.

- [#1034](https://github.com/conciv-dev/conciv/pull/1034) [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563) Thanks [@omridevk](https://github.com/omridevk)! - The composer and the Terminal share one model selector from the chat kit. The Terminal's selector says Models… while it reads the model list, and after a failed read it offers Retry inside the selector, as the composer does. The selector keeps one width while it loads, fails or has no models, so the tabs beside it stay still. The composer's model prompt stays enabled when the session's harness lists no models, so it still opens and another harness can be picked; only the Terminal's pill turns disabled then.

- [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b) Thanks [@omridevk](https://github.com/omridevk)! - A page tool that asks, called from outside the widget, now waits on its card until the user answers it instead of being refused with a retry; a widget call runs with the click as its approval, and `Permission.Unattended` settles asks that nobody is present to answer.

  A permission answer is opencode's reply, `once`, `always` or `reject`, in place of approve or deny with a session scope. The "Allow for session" button is gone: a card offers Approve and Deny, plus "Always allow" (a saved project rule) only when the ask can be saved. A call for a missing or deleted session is refused with `session "<id>" does not exist` before the tab check.

- [#814](https://github.com/conciv-dev/conciv/pull/814) [`5fd874f`](https://github.com/conciv-dev/conciv/commit/5fd874fb09d5bfda28ce4954506e0abcf7a6f796) Thanks [@omridevk](https://github.com/omridevk)! - Each outside agent call is now its own turn in the chat panel, so a tab driven by an outside agent no longer grows one ever larger turn the panel can never unload. Consecutive outside calls still read as one open list with no fold and one continuous trace line; under the last call of the list a Copy action copies the calls (no Retry).

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Remove the Copy text built for outside agent runs. As in opencode, a turn with only tool calls has no action row, so that text could never be copied. `AssistantActionBar` no longer takes `copyText`.

- [#988](https://github.com/conciv-dev/conciv/pull/988) [`bac0cc2`](https://github.com/conciv-dev/conciv/commit/bac0cc25711bd1a985813f860a40ff743ab94f51) Thanks [@omridevk](https://github.com/omridevk)! - The chat draws the page tools' cards, the page session card and the grabbed element card from the built-in page plugin instead of the old page extension; they look the same as before. The widget no longer mounts the old page extension. When a user plugin and a built-in plugin both draw a card for the same tool, the user plugin's card is shown.

  `nowTitle` in `@conciv/ui-kit-chat` no longer takes a third argument.

- [#1040](https://github.com/conciv-dev/conciv/pull/1040) [`6794c37`](https://github.com/conciv-dev/conciv/commit/6794c3729dd895e2eba89b52484628962ff9d738) Thanks [@omridevk](https://github.com/omridevk)! - The page plugin's cards use the kit's loader, chips and status dots, and share one count label helper.

  A cut pill chip ends in an ellipsis, and a cut chip still opens its tooltip on hover.

- [#1150](https://github.com/conciv-dev/conciv/pull/1150) [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f) Thanks [@omridevk](https://github.com/omridevk)! - The chat kit no longer knows the page plugin: `Thread.Messages` and `Activity` lose the `pageSession` prop, and `createGrouping`, `createPageSessionGrouper`, `pageSessionCallParts`, `pageSessionThinkingParts` and `PAGE_SESSION_GROUP_KEY` leave `@conciv/ui-kit-chat`. The page plugin owns its grouper (`createPageSessionGrouper` from `@conciv/plugin-page/client`), and a host passes it through the existing `grouping` and `groupEntries` props. `@conciv/ui-kit-chat` exports `stickyGrouper`, which the moved grouper builds on.

- [#861](https://github.com/conciv-dev/conciv/pull/861) [`911a685`](https://github.com/conciv-dev/conciv/commit/911a68571dc434e793541a707a9d81bad670c93e) Thanks [@omridevk](https://github.com/omridevk)! - A plugin's permission card offers "Always allow", which saves the answer for the project; cards for built-in tools keep "Allow for session". A permission card now leaves every open chat once anyone answers it, and a card whose request is already gone leaves when clicked instead of staying on screen. A denied card shows "Denied" in red with a blocked mark, the same tone the chat uses for a failed tool call.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The permission card uses opencode's words: "Allow once", "Allow always" and "Deny" (was "Approve", "Always allow", "Deny"); a decided card reads "Allowed" and the screen reader hears "Allowed the request". The launcher badge while an ask waits reads "Waiting for approval" (was "Waiting for your Allow").

- [#1110](https://github.com/conciv-dev/conciv/pull/1110) [`414d5ea`](https://github.com/conciv-dev/conciv/commit/414d5eaeb08da91e21aa142f107c8949fcb475e4) Thanks [@omridevk](https://github.com/omridevk)! - Plugins render the kit's chip through `ctx.ui.Chip`: a short label in a pill, with a tone and an optional tooltip. A chip with a tooltip whose value is cut shows the full value above the tooltip text.

- [#1068](https://github.com/conciv-dev/conciv/pull/1068) [`4d05601`](https://github.com/conciv-dev/conciv/commit/4d05601bb1b5a30bcb5d96574da8e0aa3af449e9) Thanks [@omridevk](https://github.com/omridevk)! - Plugins draw a tool call's row by adding a render to `ToolRegistry` from `@conciv/frontend-plugin-api`; the most recently loaded plugin wins a tool name. A call no plugin draws reads "Called <tool>" with its input. A failed call opens on the error card, a permission ask waits in the dock above the composer, and each finished call shows the time the engine took, also after a reload. The old `ToolCall` registry is gone.

- [#989](https://github.com/conciv-dev/conciv/pull/989) [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae) Thanks [@omridevk](https://github.com/omridevk)! - A sent message's notes are read in one way everywhere. `@conciv/types/chat-message-types` exports `NoteCommentSchema` (type `NoteComment`) and `PromptPresentationSchema` (type `PromptPresentation`): the user-message metadata `{displayText, comments, attachments}`, where `comments` must be a list (as opencode reads it), a comment or attachment that does not decode is dropped, and a missing `attachments` list reads as empty. The thread's "You: N notes" label now counts only the notes it can show, and the session title reads the first note that decodes.

- [#960](https://github.com/conciv-dev/conciv/pull/960) [`7ef3472`](https://github.com/conciv-dev/conciv/commit/7ef3472787f26155c38128c2a1b8ffcec8ff5bf3) Thanks [@omridevk](https://github.com/omridevk)! - Answering a question card while the page is logged out or its login was revoked shows the same notice Send shows, and while the engine cannot be reached it says "conciv lost connection to the engine. Your answer was not sent." In each case the card takes your answer again instead of staying on "Sending your answer…". An answer the engine itself refuses still says "That question is no longer waiting for an answer." and the card stays as it was.

  For card authors: `addResult` on a tool card (and on the tool view context) now returns a promise, which rejects when the page could not send the answer.

- [#880](https://github.com/conciv-dev/conciv/pull/880) [`412aed2`](https://github.com/conciv-dev/conciv/commit/412aed2365d7d3729be24cd846cd6f0370bfd425) Thanks [@omridevk](https://github.com/omridevk)! - Losing the engine for a few seconds during a run no longer drops your queued message: it comes back to the composer, unsent, as Stop already does, or into that session's draft when you are looking at another session (text only: images in the queue are not kept there). The same holds when the run itself fails with an error while a message waits in the queue; before, the queued message was dropped there too.

  The message already being answered is no longer put back in the composer when the connection or the run fails, so pressing Enter no longer sends it a second time. Use Retry to run it again. A message that had no answer yet when the connection failed comes back to the composer ahead of any queued messages, so neither is lost. The same goes for anything you type while a message is sending: if that send fails before any reply, the failed message comes back first and what you typed stays after it, where before only what you typed was kept.

  Text an extension view inserts into the draft is also kept when the saved draft could not be loaded; before, it was dropped.

- [#916](https://github.com/conciv-dev/conciv/pull/916) [`61ee0c4`](https://github.com/conciv-dev/conciv/commit/61ee0c47f5e3f0bf9c99518281e84f231cb0be9f) Thanks [@omridevk](https://github.com/omridevk)! - A Steer the engine refuses puts the steered text back first in the composer instead of losing it, and is no longer resent silently. `onSteerError` in the composer handlers now receives the queued item as its second argument: `onSteerError?: (error: unknown, item: QueuedMessage) => void`.

- [#916](https://github.com/conciv-dev/conciv/pull/916) [`61ee0c4`](https://github.com/conciv-dev/conciv/commit/61ee0c47f5e3f0bf9c99518281e84f231cb0be9f) Thanks [@omridevk](https://github.com/omridevk)! - A suggestion the engine refuses reports the refusal through the composer's `onSendError` instead of leaving an uncaught rejection in the page.

- [#1034](https://github.com/conciv-dev/conciv/pull/1034) [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563) Thanks [@omridevk](https://github.com/omridevk)! - When the Terminal's model list failed to load while the CLI is busy, the selector still opens and its Retry lists the models; picking a model still waits until the CLI is idle.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A failed run shows its error in one place, the inline row under the conversation. The styled thread no longer repeats the error inside the last reply, and the app no longer raises a toast for a failure that row already shows; a send refused before any run still gets its toast.

- [#1085](https://github.com/conciv-dev/conciv/pull/1085) [`48a2c25`](https://github.com/conciv-dev/conciv/commit/48a2c25d52a8e400f60411ae059c92187337954a) Thanks [@omridevk](https://github.com/omridevk)! - Pins @solid-primitives/timer to 1.4.4 so a fresh install never pulls a version that needs Solid 2 (1.4.5 requires Solid 2).

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A turn stopped before its first word is saved as an empty reply marked stopped, so the Stopped divider stays after the next message and after a reload. An assistant turn with nothing to show renders no reply article.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The @tanstack/ai family moves to ai 1.7.0, ai-client 1.2.0, ai-solid 1.1.0, ai-event-client 1.1.0 and ai-persistence 1.1.0, so the metadata a tool result carries lands on its tool-call part.

- [#1103](https://github.com/conciv-dev/conciv/pull/1103) [`a14cb77`](https://github.com/conciv-dev/conciv/commit/a14cb7704a32edc31189fb344a9bd933949e664e) Thanks [@omridevk](https://github.com/omridevk)! - An attached text file and the plugin instructions update now start their own paragraph in what the model reads. The chat library joins text parts with nothing between them, so each of these parts now carries its own blank line in front, and the sent message bubble shows the typed text, a blank line, then the attachment.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The composer's hidden file input behind Add attachment is no longer read out by screen readers as an unlabelled field; the button stays the one way in, and it still opens the file chooser.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - The model menu says when a harness's CLI is not logged in, under that harness's name, with the command that logs it in.

- [#1034](https://github.com/conciv-dev/conciv/pull/1034) [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563) Thanks [@omridevk](https://github.com/omridevk)! - A harness's model list in the selector shows at most four rows before `N more models, type to search`, also when the default and the picked model are two different models.

- [#1034](https://github.com/conciv-dev/conciv/pull/1034) [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563) Thanks [@omridevk](https://github.com/omridevk)! - The model pill and the Terminal toolbar take their height from their content: padding around the text line, no fixed height, so every state (loading, failed, ready) lays out the same in every browser.

- [#990](https://github.com/conciv-dev/conciv/pull/990) [`63da39e`](https://github.com/conciv-dev/conciv/commit/63da39e4cc44b03dae8923b3f6d2a50a736662be) Thanks [@omridevk](https://github.com/omridevk)! - The Terminal panel is built in. A session whose harness has a terminal command lists a Terminal tab in the status bar; opening it starts the harness CLI in a terminal that survives a reload, and while it is shown the status bar carries a model picker (the pick is remembered) and a New terminal button. `session.panel.end` is ported: a plugin slot drawn at the end of the status bar's view tabs. `HarnessMeta.persistentPty` is new: `meta.models` and `meta.harnesses` say whether the harness has a terminal. The model picker's list keeps its own width and stays on screen when its trigger sits near the edge of the window. The model picker's button and list use the chat sans face and type scale, matching the status bar tabs beside them. The terminal uses the widget's mono font.

- [#1034](https://github.com/conciv-dev/conciv/pull/1034) [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563) Thanks [@omridevk](https://github.com/omridevk)! - Under reduced motion the Terminal and diagrams read each theme colour from its own probe, so a colour transition can no longer hand the terminal its text colour as the background.

- [#1192](https://github.com/conciv-dev/conciv/pull/1192) [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980) Thanks [@omridevk](https://github.com/omridevk)! - `PermissionCard` is gone from `@conciv/ui-kit-chat/tools`: nothing drew it but its own story, and its labels had drifted from the permission card the widget shows.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Older messages load once the reader stops scrolling, so Home reaches the first message.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The thread log takes focus from code, so a keyboard shortcut can move into a thread too short to scroll.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - `ToolCardProps` takes an optional `body`. The catalog tool card (`MetaToolCard`) and the default fallback card (`ToolFallback`) draw it in place of their own body, under their normal header: the headline with the positional value, the badge, the input chips, the duration and the status stay the card's own. Without a `body` both cards draw as before; every other card ignores the prop.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A tool card entry can decline a call through `accepts`, so the next matching entry, the catalog card or the fallback draws it.

- [#1171](https://github.com/conciv-dev/conciv/pull/1171) [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d) Thanks [@omridevk](https://github.com/omridevk)! - A plugin tool's look is only its own tool render: the registry catalog carries no `icon` or `label`, the generic tool card and the live status line show the tool name, and the generic card shows no mutating badge and no asks-approval hint, as opencode does, and `TOOL_ICON_KEYS`, `toolIconRender`, `cardTitle`, `pageToolMeta`, the page catalog special case and `@conciv/plugin-tanstack/client` are gone. The page and TanStack cards keep their words and icons inside their own renders. The app no longer depends on `@conciv/plugin-tanstack`.

- [#1113](https://github.com/conciv-dev/conciv/pull/1113) [`08cfb11`](https://github.com/conciv-dev/conciv/commit/08cfb11d6b7d3f47720e8fe0dd3cd10e0f096a85) Thanks [@omridevk](https://github.com/omridevk)! - A turn's action row sits under its last text part, and a turn without text has none, so no blank row is left between turns.
- Updated dependencies [[`9172bfa`](https://github.com/conciv-dev/conciv/commit/9172bfabc9249dcdc13525a89d778ee02ee7c895), [`c24fe17`](https://github.com/conciv-dev/conciv/commit/c24fe171ca1c26648c3f4336f8656c2c800fc7a8), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344), [`84ea7e3`](https://github.com/conciv-dev/conciv/commit/84ea7e3fe676a4c875535e2f20ca3bc6ffa84c93), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`3c4c575`](https://github.com/conciv-dev/conciv/commit/3c4c575d23931e2c3714b38fa853d2b9942ddade), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23), [`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`35347d2`](https://github.com/conciv-dev/conciv/commit/35347d2abd0aeb696eaa04e8df49ca7bc1d44fa9), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd), [`fcba070`](https://github.com/conciv-dev/conciv/commit/fcba07081e1a4646cd907549728417e88523b7b5), [`26d4021`](https://github.com/conciv-dev/conciv/commit/26d402137561bad75c633c8d51993b1da4ba1a82), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`6d82c57`](https://github.com/conciv-dev/conciv/commit/6d82c5741fd8096c2b554286b7045511ac62a3db), [`fea0ff2`](https://github.com/conciv-dev/conciv/commit/fea0ff2139caf552838a0ed4f4b2f8bf6fd3563d), [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723), [`a3312e3`](https://github.com/conciv-dev/conciv/commit/a3312e303cb721b782442cdb952b10b5c348ec50), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`e7ddc30`](https://github.com/conciv-dev/conciv/commit/e7ddc30247704fa779205cbb8aef14505213b981), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`f2d65ca`](https://github.com/conciv-dev/conciv/commit/f2d65ca836ddf7ff5cdd79bcd56a4f7aab86bb00), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`e67cfba`](https://github.com/conciv-dev/conciv/commit/e67cfba64e8f66b708b16d3e5c1fd031f4984511), [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af), [`8690874`](https://github.com/conciv-dev/conciv/commit/869087424d55eb15e5b623314569e7ecefbf6b5a), [`0bc80ef`](https://github.com/conciv-dev/conciv/commit/0bc80ef1b0ded255ab9e66a84baf6b5724f2d59f), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`25ec2d8`](https://github.com/conciv-dev/conciv/commit/25ec2d81d4559a6afdf531b8fbae38d561eb9656), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1), [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971), [`304b057`](https://github.com/conciv-dev/conciv/commit/304b0571d91cf3a814df3b735798530626ef8607), [`edc5e42`](https://github.com/conciv-dev/conciv/commit/edc5e42998d5dbd33ebe4b1aba7e4e72c4905390), [`0040247`](https://github.com/conciv-dev/conciv/commit/00402478d56e462a750212086ddf5202f7e51316), [`215bcb7`](https://github.com/conciv-dev/conciv/commit/215bcb7ecefe54691fbadb1f8c547001a4266028), [`571d456`](https://github.com/conciv-dev/conciv/commit/571d456cd232387f11dd2e119d1971f409a825c6), [`71a6bb9`](https://github.com/conciv-dev/conciv/commit/71a6bb92305b9b93f3a191c078295c0d4412df80), [`3904487`](https://github.com/conciv-dev/conciv/commit/390448709c8d3ed47aa2a82772c76e7ede6e70c5), [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d), [`35e9999`](https://github.com/conciv-dev/conciv/commit/35e9999ccf358fae142e6d521e0f795ad10862b4), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`7ef3472`](https://github.com/conciv-dev/conciv/commit/7ef3472787f26155c38128c2a1b8ffcec8ff5bf3), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`83c6c31`](https://github.com/conciv-dev/conciv/commit/83c6c31813526758e86b21984b7d224738920fe7), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f), [`48a2c25`](https://github.com/conciv-dev/conciv/commit/48a2c25d52a8e400f60411ae059c92187337954a), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070), [`bb8f33c`](https://github.com/conciv-dev/conciv/commit/bb8f33cb1ddb69d8453d6eb5f8366a04f37e1378), [`63da39e`](https://github.com/conciv-dev/conciv/commit/63da39e4cc44b03dae8923b3f6d2a50a736662be), [`adfc6d7`](https://github.com/conciv-dev/conciv/commit/adfc6d789db2a8f2f12c50eb850e030d112b6369), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`e4edcfb`](https://github.com/conciv-dev/conciv/commit/e4edcfbf56dea09af0261d74e30b85d4ddbadce4), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811)]:
  - @conciv/solid-diffs@0.0.23
  - @conciv/types@0.0.23
  - @conciv/ui-kit-system@0.0.23
  - @conciv/frontend-plugin-api@0.0.23
  - @conciv/solid-streamdown@0.0.23
  - @conciv/storage-history@0.0.23

## 0.0.22

### Patch Changes

- [#741](https://github.com/conciv-dev/conciv/pull/741) [`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679) Thanks [@omridevk](https://github.com/omridevk)! - The server retries a model call when the provider asks to wait before any output. A context overflow now says the conversation is too long for the model and offers to compact it, and a denied or cancelled tool reads as denied or cancelled instead of failed.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - A streamed chunk wakes only the turn and part it changed: turns and each turn's parts are keyed lists, result lookups wake only the row whose result arrives, pane-level readers (dividers, stopped line, harness label, narration, permission asks, older-messages, load failure) stop scanning every message, and tool durations live in one pane-level record that folds only the live turn per chunk, so a row reads its call's duration (`ToolViewCtx.durationFor(toolCallId)`) and wakes only when that entry changes.

- [#752](https://github.com/conciv-dev/conciv/pull/752) [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e) Thanks [@omridevk](https://github.com/omridevk)! - The chat column spaces its rows with one gap from the spacing token, so the "Responding…" line no longer overlaps a permission request or a divider above it, and a reply's action bar has its own row instead of floating over the turn's bottom padding.

- [#752](https://github.com/conciv-dev/conciv/pull/752) [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e) Thanks [@omridevk](https://github.com/omridevk)! - The chat column reads every type size, line height, letter spacing, mark size and transition duration from tokens instead of hand-picked values: a chat type scale (`text-chat-micro` through `text-chat-body`), `--chat-mark` sizes derived from the trace gutter, and duration tokens (`--chat-duration-fast`, `-normal`, `-slow`) behind the preset's transition shortcuts. A reply that is still running no longer leaves an empty strip for its action bar above "Responding…"; the bar's row appears once when the run ends.

- [#742](https://github.com/conciv-dev/conciv/pull/742) [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b) Thanks [@omridevk](https://github.com/omridevk)! - Long chats open with their newest 50 messages and load older pages as you scroll up, without moving the message in view. Harness labels, dividers and stopped markers are keyed by message id so they stay on their messages across pages.

  Chat transcripts are stored one row per message (`chat_messages`), so a page of history reads only that page from the database; existing chats are moved over by a migration.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - The "Context compacted" line stays under the reply it follows once the compaction output arrives, live and after reopening: the server marks compaction output in the message metadata and the chat starts a new turn there.

- [#745](https://github.com/conciv-dev/conciv/pull/745) [`9ea8792`](https://github.com/conciv-dev/conciv/commit/9ea8792e73c9f569e0c7e48b802fe32e597aa877) Thanks [@omridevk](https://github.com/omridevk)! - Streaming a long tool run no longer forces a layout read on every chunk: the last-turn flag and the virtualizer's turn count and keys only notify when their values change, so the trace rail and the thread scroller stop re-measuring each streamed chunk (Firefox dropped frames).

- [#772](https://github.com/conciv-dev/conciv/pull/772) [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e) Thanks [@omridevk](https://github.com/omridevk)! - An older page landing keeps the turns already on screen: a virtual row finds its turn by key instead of by index, so a prepend no longer rebuilds every visible turn and replays its fade-in from blank.

- [#772](https://github.com/conciv-dev/conciv/pull/772) [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e) Thanks [@omridevk](https://github.com/omridevk)! - Older chat history now starts loading while the reader is still three screens from the top, so scrolling up no longer runs into an empty top and a loading row before the earlier messages appear.

- [#792](https://github.com/conciv-dev/conciv/pull/792) [`ce9a173`](https://github.com/conciv-dev/conciv/commit/ce9a173a4850ad3fd2ea7fdc8f9249844d6689f0) Thanks [@omridevk](https://github.com/omridevk)! - When older messages load while the Latest button is still gliding down, the chat now lands at the newest message at once and keeps following the reply, instead of stretching the glide across the newly loaded page.

- [#772](https://github.com/conciv-dev/conciv/pull/772) [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e) Thanks [@omridevk](https://github.com/omridevk)! - The chat's Latest button jumps to just above the newest messages and glides smoothly the rest of the way, and lands following the conversation as before. A wheel, touch or key scroll during the glide stops it where the reader scrolled. With reduced motion it still jumps instantly. Opening a chat and sending a message still land on the end at once.

- [#752](https://github.com/conciv-dev/conciv/pull/752) [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e) Thanks [@omridevk](https://github.com/omridevk)! - A permission request waiting outside the transcript now lines up with the conversation column instead of running past it in a wide panel.

- [#755](https://github.com/conciv-dev/conciv/pull/755) [`3983ead`](https://github.com/conciv-dev/conciv/commit/3983eada7d68d51872d11dc84290480dfd33006a) Thanks [@omridevk](https://github.com/omridevk)! - The message queue now sits directly above the composer instead of under the pane header, and each queued row shows its Steer and Remove buttons at all times, with a visible keyboard focus ring. Stop no longer sends the queued messages as a new turn: it stops the run and puts them back in the composer, in order, unsent. `ChatSession.interruptAndFlush` is removed. While a stop is in flight the composer blocks every send (Enter, the Send button), so the returned draft cannot be re-queued and lost.

- [#782](https://github.com/conciv-dev/conciv/pull/782) [`059da2b`](https://github.com/conciv-dev/conciv/commit/059da2b4f46cccc818223903bbab21f3bd9c99b3) Thanks [@omridevk](https://github.com/omridevk)! - Search matches in the session picker and preview use the shared `chat-accent-20` tint with `chat-text` ink, so matched words read at WCAG AA on every row; the one-off `--chat-highlight` token is gone.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - The session picker previews the highlighted session beside the list: a read-only thread of its transcript, newest messages first with earlier pages loading on scroll, the search words marked, `Alt+ArrowRight` to read it and `Alt+ArrowLeft` back to the search, Escape closing the preview before the picker. Core serves it through the read-only `sessions.preview` procedure. Search marks now come from Ark `Highlight` and zag `highlightWord`, and keyboard hints share one ui-kit-system `Kbd`. `Thread.Messages` takes `readOnly`, which leaves the assistant action bar with Copy only; the preview sets it. With All projects on, another project's hit previews too: `sessions.preview` takes that hit's `cwd`, and the preview header copies its resume command through the same `createResumeCopy` as the row, so both show Copied together. `ClipboardCopyButton` can reflect a shared `ClipboardCopy` instead of its own. Previewing a session from a folder the search index does not cover yet adds that folder to the index in the background. The preview opens after 600 ms, closes when its session leaves the results, and its header copy button keeps its own Copied state with a 44px hit area. Typing in the search closes the preview. `TooltipIconButton` takes `keepOpenOnClick`, and `ClipboardCopyButton` uses it so its Copied tooltip stays visible after the click.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - A session search hit now shows a short excerpt from the line that matched, with the matched words highlighted in the excerpt and the title, so you can tell why a session was found before opening it.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - Streamed tool runs do less work per chunk: a chunk re-runs only the trace row whose part changed (rows keyed by tool-call id, shared group tree, result pairing that only changes when a result arrives), turns are grouped once per chat, trace clamps measure from their resize observer instead of forcing a layout, tooltips mount their content only while open, and every truncated label in the thread shares one tooltip.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - A streamed chunk that only changes a tool's arguments or output no longer re-runs the trace row's collapsible bindings, header line and body frame, and the trace rail redraws inside its resize observer instead of forcing a style and layout flush on the next frame.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - The trace rail's running segment slides with compositor-only translations instead of a clip-path transition, so a streaming run no longer repaints and re-layerizes the whole thread on every frame while the segment travels.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - Tool rows and their result bodies build a fraction of the reactive work they used to. A copy button inside the thread shares the thread's one tooltip and builds its icon swap on first hover or focus, and the row, card and output layers derive each value once.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`f0daa1a`](https://github.com/conciv-dev/conciv/commit/f0daa1a089aa580314962870470eda2a01c396e4), [`123466d`](https://github.com/conciv-dev/conciv/commit/123466d3313ba51a75b8828950c2c96045238abf), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`b96e75c`](https://github.com/conciv-dev/conciv/commit/b96e75cb63d8fab22327016f70976629ef549763), [`6d53b93`](https://github.com/conciv-dev/conciv/commit/6d53b9329faa79d6a9f7f9fec93d0241f07e9c50), [`57aa7f3`](https://github.com/conciv-dev/conciv/commit/57aa7f37cbb18fe3be0a2b6dc341fd612bdbd62c), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`059da2b`](https://github.com/conciv-dev/conciv/commit/059da2b4f46cccc818223903bbab21f3bd9c99b3), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`8a67d39`](https://github.com/conciv-dev/conciv/commit/8a67d39d925d61aaf881a878bdd3c4dfea0193c4), [`b2dfd2b`](https://github.com/conciv-dev/conciv/commit/b2dfd2b279d7ad6bab81c3c99d3c24874de5c257), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09)]:
  - @conciv/protocol@0.0.22
  - @conciv/ui-kit-system@0.0.22
  - @conciv/solid-streamdown@0.0.22
  - @conciv/solid-diffs@0.0.22
  - @conciv/storage-history@0.0.22

## 0.0.21

### Patch Changes

- [#625](https://github.com/conciv-dev/conciv/pull/625) [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade mermaid to 12.2 for chat diagrams (ELK is now the default layout).

- [#672](https://github.com/conciv-dev/conciv/pull/672) [`621c280`](https://github.com/conciv-dev/conciv/commit/621c2802782a5f7420bc0c9b2030a948b793a156) Thanks [@omridevk](https://github.com/omridevk)! - Cut the ui-kit-chat test suites to the component behaviours they own, dropping duplicate, mechanism and library cases.

- [#663](https://github.com/conciv-dev/conciv/pull/663) [`3cff847`](https://github.com/conciv-dev/conciv/commit/3cff847f9737309ef22fcac06fb84ff974d1340a) Thanks [@omridevk](https://github.com/omridevk)! - Fold the ui-kit-chat tests into four browser files and drop the node test project.

- [#623](https://github.com/conciv-dev/conciv/pull/623) [`23c7842`](https://github.com/conciv-dev/conciv/commit/23c78425c6f53b434d4bf3b4e97666b0cbb95103) Thanks [@omridevk](https://github.com/omridevk)! - The thread virtualizer rounds turn height estimates to whole pixels, so a reader who scrolled up no longer shifts by a fraction of a pixel when rows above the viewport get their first real measurement.

- [#665](https://github.com/conciv-dev/conciv/pull/665) [`14fec2c`](https://github.com/conciv-dev/conciv/commit/14fec2caf05dc77879f79055c04ee12f84ea9379) Thanks [@omridevk](https://github.com/omridevk)! - Restore the attachment adapter, run clock and grouping diff node tests in one node test file.

- [#651](https://github.com/conciv-dev/conciv/pull/651) [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3) Thanks [@omridevk](https://github.com/omridevk)! - Warm tooltips: `Tooltip.Group` turns a toolbar's tooltips into one label that pops in on the first trigger, then glides and resizes to the next while the text swaps, with an optional lean and fuse. Ungrouped tooltips get the same pop. `TooltipIconButton` accepts a `shortcut` rendered as a keycap. The chat action bar, composer, terminal actions and whiteboard thread header share one warm tooltip.

  Switch: the thumb travels on a spring, squishes with its velocity, swells on hover and can be dragged; reduced motion jumps.

- [#675](https://github.com/conciv-dev/conciv/pull/675) [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1) Thanks [@omridevk](https://github.com/omridevk)! - Tool result images open in a viewer: click the thumbnail for a fit-to-window dialog, click the image for actual size. Image attachments in the composer and on sent messages open the same viewer.
- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`ad66158`](https://github.com/conciv-dev/conciv/commit/ad66158ab8919dd5a482f30cca45367df5a9566b), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`96acad4`](https://github.com/conciv-dev/conciv/commit/96acad42d70fcb83a2ab535999a1c97ecb34a21f), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3), [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1)]:
  - @conciv/protocol@0.0.21
  - @conciv/ui-kit-system@0.0.21
  - @conciv/solid-streamdown@0.0.21
  - @conciv/solid-diffs@0.0.21
  - @conciv/storage-history@0.0.21

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Retire the `Activity.Now` narration surface: the pin above the composer is rendered from `NowLine`
  fed by the thread grouping store, so the parallel activity-store copy is gone. `useChatSession` now
  exposes a non-suspending `sessionRunning` signal derived from run lifecycle events, so a pane that
  joins a turn another client started narrates it too.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Render the thread through one tree at every length. Crossing the virtualization threshold no longer
  swaps a flat list for a virtualized one, so every turn root keeps its DOM identity as a conversation
  grows. Below the threshold the virtualizer windows nothing; at and above it eviction is unchanged.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
  ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
  ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
  moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
  comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
  renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
  chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
  so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Calm surfaces: a streaming activity now gets one surface that is born once, streams into itself, and settles in place. Completed surfaces stay open and inspectable until the next prompt is sent, page-session grouping is minted once per part and only reclassified once the run settles, and the server keeps the user message id the client minted so a prompt row is never remounted mid-thread.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - The chat thread now has a single owner for its scroll position: the virtualizer. The stick-to-bottom phase machine, the thread pins, the top-anchor reserve and the follow-pause helper are gone, along with the `turnAnchor`, `topAnchorMessageClamp`, `scrollToBottomOn*` and `autoScroll` props on `Thread.Viewport` and the `data-follow` / `data-escaped` attributes. `data-at-bottom` is the remaining scroll attribute, and the only writes are the Latest button and sending a prompt. `@conciv/solid-stick-to-bottom` is deleted: the two non-virtual log scrollers that still used it (the streaming reasoning preview and the activity timeline) now pin to the bottom with a `column-reverse` scroll container, which the platform keeps pinned as content grows and releases when the reader scrolls up.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Chat thread: land on the latest turn with a single scroll write instead of the virtualizer's `scrollToEnd`, which armed a five-second reconcile loop that dragged a reader back whenever they scrolled up right after mount or right after sending.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A settled turn keeps its identity when the server re-broadcasts the transcript. The run-start history snapshot re-mints assistant message ids, which changed the turn key and made the thread destroy and rebuild that row: the settled answer replayed its entrance animation and slid under the reader. Turn reuse now compares a turn's messages by value, so a re-keyed snapshot of the same conversation leaves the rendered turn untouched.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Bind the thread virtualizer to its scroll element only once that element is in the document. A
  virtualized transcript re-entered through a view tab used to come back blank: the virtualizer
  resolved its target window while the subtree was still detached, cached a null one, and never
  recomputed a range. The scroll element is now reported only while connected, and the binding runs
  again whenever it resizes.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Code blocks in chat replies no longer flip between plain and colored text while a reply streams in: lines that are already colored stay colored and only the newly arrived code is added. Selecting text inside a code block now survives the reply re-rendering around it, so you can copy from a block while the agent is still writing.

- [#553](https://github.com/conciv-dev/conciv/pull/553) [`9549d4a`](https://github.com/conciv-dev/conciv/commit/9549d4a6b484da8e40135eb8abd676ade23ba1b2) Thanks [@omridevk](https://github.com/omridevk)! - Collapsible open/close (tool cards, chain-of-thought groups) now animates `grid-template-rows` via CSS keyframes instead of the box-model `height`. `@zag-js/collapsible` determines whether an exit animation exists by reading the content element's computed `animationName`, and waits for `animationend` before letting the state settle; a CSS `transition` on `height` never fires that event, so the earlier attempt to swap in a `transition`-based approach snapped instantly instead of animating. The content element is a CSS grid with a single `1fr`/`0fr` row track; its child wrapper carries `overflow: hidden` and `min-height: 0` so the collapsed track visually and structurally clips to zero. `prefers-reduced-motion` is honored on both variants. Measured in the live-widget rig: toggle-window p99 dropped to 9.3ms versus 16-17.5ms for the prior height-based animation; the worst-case catastrophic frames were independent of which toggle animation was in flight.

  `usePauseFollowOnToggle` previously waited on `animationend` for every toggle, including under `prefers-reduced-motion`, where `motion-reduce:animate-none` means no animation ever starts and no `animationend` ever fires. Thread auto-follow stayed paused for the full 1000ms ceiling on every toggle for reduced-motion readers. The hook now checks the toggled element's computed `animationName` synchronously after the toggle: when it is `none` (no animation running), follow releases immediately instead of waiting on an event that will never arrive.

- [#540](https://github.com/conciv-dev/conciv/pull/540) [`fd6d4ce`](https://github.com/conciv-dev/conciv/commit/fd6d4ce64ab6a3350406c02e462f5b0bc14dd5f1) Thanks [@omridevk](https://github.com/omridevk)! - Composer actions collapse into a shared overflow menu; extensions author buttons through `ComposerActions.ActionButton` (or the `ComposerActions.Action` + `ActionMenuItem` pairing for divergent inline/menu content) and `ComposerActions.Inline` from @conciv/ui-kit-chat, registered with the host via context — no ids, no separate menu-item JSX to author by hand. `ComposerActionsHost` takes `maxInlineAuto` to cap how many unpinned auto actions may stay inline, and the conciv composer caps it at zero: only `visible="always"` buttons sit in the row. Session refresh moved out of the composer into pane chrome. `ComposerActionsHost` reads its regions from the `ComposerActions.Leading`, `ComposerActions.Trailing` and `ComposerActions.Trigger` slot components instead of leading/trailing/triggerContent props.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Removed the unused Claude `attach` slot (`claudeAttach`, `parseLiveSessions`, `meetsReloadFloor`) and
  its `HarnessAttach`/`HarnessLiveSession`/`HarnessAttachInstall`/`HarnessAttachResult`/`HarnessAttachRemoval`
  protocol types. Nothing in the codebase called `harness.attach`, `candidates()`, `install()`, or
  `uninstall()` outside the deleted `claude/attach.ts` and its own test.

  Consolidated the duplicate `chatBusy`/`busyOf` check (identical bodies in `@conciv/ui-kit-chat` and
  `@conciv/client`) into a single `chatBusy` export from `@conciv/protocol/chat-busy`, which both
  packages already depend on.

  `@conciv/client`'s `stopping` state is now derived from the server-published run lifecycle phase
  (`runSource().lifecycle.phase === 'stopping'`) instead of a local 10s-timeout approximation; deleted
  the now-redundant `createStopState`/`isStopping` local timer and its `@solid-primitives/timer`
  dependency.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Delete dead chat-plane code found in a source audit of the calm-chat-plane branch:
  `snapshotToTokenUsage` (only consumer was its own test), the self-referential
  `ChatMessageSchema`/`ChatRequestSchema` (no import site anywhere), and the `replies`
  table plus `writeReply`/`replyFor` (truncated on every boot, no non-test consumer).
  A drizzle migration drops the `replies` table.

  Delete our bespoke `APPROVAL_REQUESTED_EVENT`/`ApprovalRequest`/`aguiApprovalRequestedFor`
  helpers in `@conciv/protocol`; the single emitter in `@conciv/core`'s permission gate now
  builds `@tanstack/ai`'s `ApprovalRequestedEvent` directly and stamps it with tanstack
  run/thread metadata via `withTanstackMetadata`, keeping the event name string sourced from
  `@tanstack/ai-sandbox`'s `APPROVAL_REQUESTED_EVENT` constant.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Prime the diffs highlight worker pool when the thread mounts. Until the pool finished
  initialising, `File` had no plain-text AST to paint, so the first code surface of a run
  appeared empty and then jumped to its real height, shifting every trace row below it.

- [#483](https://github.com/conciv-dev/conciv/pull/483) [`bf64cd8`](https://github.com/conciv-dev/conciv/commit/bf64cd840bb9be69201d7a78b33a7fe3338ac79a) Thanks [@omridevk](https://github.com/omridevk)! - Chat transcript grouping is now derived from message data (assistant-ui groupParts model): unrenderable parts can no longer produce an empty Chain of Thought wrapper, tool cards always show a chevron, and grouped presentations (chain, page session) register through a generic GroupEntry. Every tool card body now renders a data-derived floor — input chips, a state row such as "searching…" or "recording…", or a quiet "no input" row — so no card expands into an empty strip. The page-session card is the one deliberate exception: it is a group summary rather than a single tool call, so it renders its step rail instead of an input row.

- [#570](https://github.com/conciv-dev/conciv/pull/570) [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1) Thanks [@omridevk](https://github.com/omridevk)! - The widget now adapts to the host page's color scheme instead of always rendering dark. It resolves
  the scheme at mount, before first paint, from a computed `color-scheme` on the host root, then a
  `.light`/`.dark` class or `data-theme` attribute, then `prefers-color-scheme`, and re-resolves live
  when the host page toggles its theme. Every color token is declared once as a `light-dark()` pair,
  so a scheme is a single `color-scheme` flip: scrollbars, native controls, Shiki code blocks, the
  diffs component, popped-out windows, and the terminal pane all follow. UnoCSS `dark:`/`light:`
  variants key off the widget's own scheme classes. Extension `chat-accent` / `chat-hue` overrides keep
  working in both schemes.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Rename the mutating tool badge copy from "edits page" to "page edit".

- [#549](https://github.com/conciv-dev/conciv/pull/549) [`e74ef75`](https://github.com/conciv-dev/conciv/commit/e74ef75b8635457db259b32bbad61e08f57f582e) Thanks [@omridevk](https://github.com/omridevk)! - Eliminated a shiki main-thread stall during streaming chat turns by moving syntax highlighting off the main thread entirely into a Web Worker, instead of merely scheduling it.

  Live-rig measurement across five rounds narrowed this down: `requestIdleCallback`-based scheduling shrank the compile burst but could not eliminate it, because once the browser forces the callback to run under sustained streaming load, the compile still executes synchronously on the main thread — deferral relocates the work, it does not remove it. A pre-turn warmup hitch of up to ~226ms remained on fresh sessions whenever the user typed within a couple seconds of the pane mounting.

  The chat markdown renderer now:
  - Runs both shiki highlighter cores (the precompiled+raw-engine core for typescript/tsx/javascript/jsx/json/css/html/markdown, and the regex-engine core for bash) inside a dedicated Web Worker, constructed via `new Worker(...)` behind an inline (`?worker&inline`) Vite worker import so the worker's own bundle — shiki included — ships self-contained, with no separate chunk file to resolve. Verified this survives both packages' real build pipelines: `packages/ui-kit-chat`'s library build and, critically, `packages/embed`'s single-file IIFE bundle which explicitly disables Rollup code-splitting (`output: {codeSplitting: false}`) — an inline worker sidesteps that entirely since it never needs a second output file. The `mount-externals` build test (guarding against a second bundled Solid/Ark copy) passes unchanged.
  - Keeps the main thread doing exactly what it should: the highlight cache, the plain-escaped-fallback rendering path while a highlight is pending, per-language streaming supersession, and the `Markdown` component re-render notification. A cache miss posts `{code, lang}` to the worker and returns the plain escaped fallback immediately; the worker's reply fills the cache and notifies. Warmup — one representative snippet per language — runs as a worker-boot task, off the main thread entirely.
  - Has no main-thread highlighter path anymore: since conciv is a local-only dev tool, a strict-CSP host page and the previous ~170KB fallback-duplication cost were both judged near-irrelevant, and a dead code path that only exists to highlight without a Worker was pure complexity for no real benefit. If `Worker` is unavailable or construction throws, code fences render as plain escaped text permanently — no error, no highlighting, decided once at module init. This removed the entire second shiki import graph (the hybrid dual-core main-thread highlighter construction and its own staggered warmup) that previously shipped independently of the worker's copy.
  - `Thread.Root`'s eager `onMount` hook constructs the worker (or resolves to the permanently-degraded mode) as early as possible, well before any turn can produce a fence.

  All 9 languages remain byte-identical to the original pre-worker single-thread output. Embed bundle size (`conciv-widget.global.js`): pre-worker baseline 14,843.25 kB raw / 3,074.24 kB gzip; with the (now-removed) main-thread fallback, 16,189.98 kB / 3,244.15 kB; with the fallback deleted, 15,215.83 kB / 3,143.65 kB — close to the pre-worker baseline (+372.58 kB raw / +69.41 kB gzip), matching expectations for shipping one self-contained worker copy of shiki instead of a shared main-thread graph.

- [#591](https://github.com/conciv-dev/conciv/pull/591) [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6) Thanks [@omridevk](https://github.com/omridevk)! - Host marker strings renamed off the dead `pw` prefix to `conciv`: the `pw-widget` / `pw-api-base` meta tags, every `data-pw-*` attribute, the `pw-chat-panel` id (and its `aria-controls` references), the `pw-session-` id prefix, the `pw-conciv-model` localStorage key (now `conciv-model`, saved preference intentionally dropped), `pw-grab-pseudo-` capture-clone classes, and the `.pw-fab-*` / `.pw-rig-*` mascot rig classes. Breaking for any host or tooling still targeting the old meta names, data attributes, ids, or storage key.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Mermaid code blocks in chat replies now render as diagrams once the reply finishes streaming. The diagram follows the widget's light or dark scheme, and a block that does not parse stays a plain code block. Mermaid loads only when the first diagram appears, so replies without diagrams pay nothing for it.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Pin model-selector search filtering so disabled options are filtered and restored with the enabled ones.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Keep one narration line mounted for the whole run. It used to be handed off between a row inside the running chain group and a copy below the transcript, so every time streaming moved between a thinking, tool-call, and text part the line unmounted and remounted — the spinner reset and the line appeared to blink. The chain group no longer hosts a narration row at all (`Trace` loses its `now` slot); the single line lives in the transcript flow after the last message, aligned to the trace gutter, and is gated only on whether the run is live.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Rebuild the narration label swap on Ark's Presence so the outgoing activity unmounts after its exit instead of lingering, and cut straight to the latest title when activities churn faster than the animation. The swap is now a vertical slide inside a clipped line box, so two labels can never overlap into unreadable text. Drops the blurred keyframe that animated `filter` on text, and moves the fallback narration into the transcript flow so it sits tight to the last content instead of far below it.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Tool results read as data again. An exec run now shows its console logs and its typed result separately: objects and arrays open as a JSON tree, strings stay strings, and scalars sit on one compact line instead of being flattened into an escaped one-line blob. Meta-driven cards with an object output schema take the same structural path. Page script steps label themselves with the first line of the script they ran, and a long value no longer squeezes the step target out of a narrow session card.

- [#550](https://github.com/conciv-dev/conciv/pull/550) [`a3e61ec`](https://github.com/conciv-dev/conciv/commit/a3e61ec0c47879314362b8b9656bc708b675d313) Thanks [@omridevk](https://github.com/omridevk)! - Fix a long main-thread frame when a pane opens on a session with a large restored transcript: the viewport resize/font-ready estimator reset and virtualizer remeasure now schedule via `requestAnimationFrame` instead of running inline in the resize observer callback, so the expensive text-metrics recompute lands in its own frame instead of blocking alongside the `MESSAGES_SNAPSHOT` websocket handler.

- [#559](https://github.com/conciv-dev/conciv/pull/559) [`436aff0`](https://github.com/conciv-dev/conciv/commit/436aff0ae80ab2d33d06b50128b48e5404dc7b23) Thanks [@omridevk](https://github.com/omridevk)! - Redesign the chat panel as a terminal session log: chronological turns with an execution trace tree, geometric connectors, inline tool bodies for every tool card, themed shiki code surfaces, JSON payloads through the tree viewer, and a single swappable terminal theme owning all chat tokens.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Code blocks the highlighter has no grammar for (for example a `mermaid` diagram), and blocks still waiting for their colors, now show readable code text on the same flat surface as highlighted blocks instead of pale grey text in a grey box.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Restore the narration line to the widget's trace language: a braille spinner glyph in the accent color plus a mono micro label at the trace gutter, with no fill slab. The line now rides as the last row of the running turn's chain group, animates the label swap when the activity changes, and freezes the glyph at `⠿` under `prefers-reduced-motion`. The pinned copy above the composer is kept as the late-join fallback.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Stop the trace clamp from re-laying out inside its ResizeObserver callback, which tripped a ResizeObserver notification loop and deferred the rest of each cycle's measurements during card-heavy scrolling. The trace rail no longer observes the svg it sizes and reads the gutter from its token instead.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Trace rail: the accent now marks the running step and nothing else. Each row owns its inbound connector, liveness is derived from tool status instead of "last part while the turn streams", the scroll reading-band highlight that shared the accent's styling is gone, a collapsed trace draws no rail at all, and a resolved permission request no longer leaves an empty row behind that shifted the rail's arms.

- [#479](https://github.com/conciv-dev/conciv/pull/479) [`5bf76b9`](https://github.com/conciv-dev/conciv/commit/5bf76b9869374877e54ffcde85556d4bfbe2615f) Thanks [@omridevk](https://github.com/omridevk)! - File-read tool cards infer syntax-highlighting language from the filename instead of rendering plain text

- [#555](https://github.com/conciv-dev/conciv/pull/555) [`f178ec8`](https://github.com/conciv-dev/conciv/commit/f178ec87227ebdb60c10b21426e972083f9a1d05) Thanks [@omridevk](https://github.com/omridevk)! - Fixed a `ResizeObserver loop completed with undelivered notifications` window error that fired repeatedly while a thread's turns were virtualized (above the virtualize threshold). The thread virtualizer's viewport-rect observer now defers its handling to the next animation frame (`useAnimationFrameWithResizeObserver`), matching the existing `top-anchor.ts` convention for resize-driven layout writes, instead of recomputing measurements synchronously inside the `ResizeObserver` callback.

- [#593](https://github.com/conciv-dev/conciv/pull/593) [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3) Thanks [@omridevk](https://github.com/omridevk)! - Skin axis: named looks over a 37-anchor token contract, selected with `--conciv-skin`.

  A host page picks the widget's look by declaring one CSS custom property on `html` or `body`:

  ```css
  html {
    --conciv-skin: terminal;
  }
  ```

  Two skins ship in-repo: `conciv` (the default) and `terminal`. Each is a typed object in
  `@conciv/ui-kit-system` that sets only the anchors — surfaces, ink, overlays, accent, status, type,
  radii, shadows, easing and a density unit — as `{light, dark}` pairs or single values, so a skin is
  complete for both colour schemes by construction and omitting anything is a compile error. Every
  other `--chat-*` custom property stays internal and is derived once from the anchors, so hand-tuned
  semantics stay consistent across skins.

  The resolved skin is stamped on every render root the widget owns, including the shadow host (so
  Ark portals follow), the body-level effects overlay and popped-out windows, which now carry both the
  scheme and the skin. An unknown value falls back to `conciv` with one console warning. The skin's
  `--chat-space` scales the spacing base of the thread and composer only; frame geometry does not
  follow it.

  Two contract documents are generated from the same typed source and committed, with a CI drift
  check: `docs/skin-anchors.md` (what a skin may write) and `docs/extension-tokens.md` (what an
  extension may read). Every skin's colour pairs are checked for WCAG contrast in CI.

  BREAKING: the per-extension theme map is removed. `defineExtension({theme})`, the `ThemeTokens` type,
  the runtime theme applier and its injected `style[data-conciv-theme]` element, the catalog's theme
  validation and `overridable` token flag, and the `theme` scaffold kind are all gone. Extensions style
  exclusively through the public `--chat-*` tokens and utilities; derive a bespoke colour locally with
  `color-mix` over a public token instead.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Thread scroll follow is now a cause-driven state machine with a single owner of `scrollTop`.

- [#546](https://github.com/conciv-dev/conciv/pull/546) [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51) Thanks [@omridevk](https://github.com/omridevk)! - Stop streamed text from flickering. Each markdown block is now a keyed node tree held in a store and reconciled by key, so words that have already settled keep their DOM node and never replay their fade; only newly mounted words animate in. The old character-counting animate plugin, its stagger variables, and the `createImmutable` hast wrapper are gone. The streaming answer also drops `text-wrap: pretty`, which re-balanced line breaks as text grew and moved settled words between lines; settled answers keep it.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Gate progressive rendering of both streamed code surfaces: a fenced block inside streamed markdown and the diff body of a tool card.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A code block that streams in mid-line keeps its colored lines on screen while each new chunk arrives, instead of dropping back to plain text and rebuilding every line until the next highlight lands. Streaming a long code block costs far less work per chunk.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A reader parked at the end of the thread keeps following a streaming reply when the reply's layout settles a pixel or two shorter. Only a wheel, touch, key press or pointer drag on the thread now releases the follow; a browser clamp of the scroll position re-lands on the end instead.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A run whose reply streams into the same message as its page acts no longer crashes the widget when the settled grouping moves the page-session card to a new position.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A thread row evicted before its deferred measurement no longer records a zero height, so the latest-turn gesture lands in one write and history prepends keep the real thread height.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - The chat thread survives a viewport re-insertion. When an ancestor of the thread viewport is removed and re-inserted — a Solid `Suspense` above the pane re-suspending on a session switch, for instance — the browser discards the scroll offset, and the reset used to reach the scroll owner looking exactly like a reader dragging to the top. The owner now records a resting anchor (preserve the reader's position, or resume following the end) and restores it through the single landing call site when the viewport comes back.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Scrolling up while a reply streams now lets go of the end right away. Before, a reader sitting at the end of the thread who nudged up with a trackpad was pulled back down on every new chunk, and a reader scrolled into a long streaming reply kept drifting with it. Now a small scroll up is enough to stop following, the text you are reading stays still while the reply keeps growing below it, and a reader who stays at the end still follows the whole stream.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Tool trace rows no longer draw an empty bordered frame around a card that renders nothing: a tool card
  entry can now declare `hasEmbeddedBody`, and `execute_typescript` uses it so a void-returning run keeps
  its row (title, `ok`, status) without an empty output box. Card headers also baseline-align their title
  and metric text, so counts like `4 actions` and durations like `0.1s` no longer sit below the title.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Narrate what the agent is doing instead of going silent: a pinned now-line above the composer names the running tool, thinking-only segments keep a readable trace, and the collapsed trace line reports the current activity while a run streams. The session status bar gains a pulsing running dot and a clearly marked active view tab, and the panel header switches to padding-driven spacing.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Stop re-rendering every settled trace row on each stream chunk: per-row result and duration lookups are value-stable memos, the live-row key and derived row class names are memoized, and the trace rail writes only changed attributes.

- [#564](https://github.com/conciv-dev/conciv/pull/564) [`5b79c2a`](https://github.com/conciv-dev/conciv/commit/5b79c2ac9dc82e91f7ff67bc927f36c575086688) Thanks [@omridevk](https://github.com/omridevk)! - Trace connectors are now a single measured SVG rail per trace (fumadocs-style): one path draws the header junction, spine, row ticks, and end corner; a live accent segment tracks the running step and a reading-line scroll spy highlights the active row on settled traces. The Latest chip becomes an out-of-flow overlay so it no longer shifts the scrollbar.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Estimate settled turn heights from the real answer-row DOM: the metrics probe now mirrors the assistant root, answer row, answer content and prose paragraphs, and the estimator accounts for row padding, root padding and paragraph spacing instead of compensating with a flat extra.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Bump the `@tanstack/ai` family from the 0.48 lockstep to 0.51 (catalog-only, see `pnpm-workspace.yaml`).
  Picks up upstream fix [#1248](https://github.com/TanStack/ai/pull/1248): the client `StreamProcessor`
  dropped the first `TEXT_MESSAGE_CONTENT` delta of an assistant turn that called a tool before
  replying, so every answer that followed a tool call lost its opening text (an opening code fence,
  most visibly).

- [#590](https://github.com/conciv-dev/conciv/pull/590) [`ac969c5`](https://github.com/conciv-dev/conciv/commit/ac969c50f746645d5a5b3bbf51547ed49317c7c3) Thanks [@omridevk](https://github.com/omridevk)! - Lower the thread virtualization threshold from 50 to 15 turns so long sessions virtualize sooner.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Run lifecycle: stop now acknowledges immediately and the session badge and timer read the run record.

  The server publishes a run-lifecycle event on the session stream when a run starts, when a stop is
  requested, and when the run driver settles it, and replays the last one to every new subscriber. Stop
  marks the run cancel-requested and acknowledges before waiting for settlement, and the transcript read
  that computes context occupancy moved off the settlement path into a later usage update.

  The widget shows a disabled "Stopping…" control from the click until the run settles, with a timeout
  fallback. FAILED now derives only from a run that ended with a terminal error, carrying that error as
  the chip's title; a denied or nonzero-exit tool call stays in the per-turn rollup and no longer flags
  the session. The elapsed timer keys on the persisted run id, so it survives a reload or a snapshot
  that re-keys every message.

- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`9549d4a`](https://github.com/conciv-dev/conciv/commit/9549d4a6b484da8e40135eb8abd676ade23ba1b2), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`efef98a`](https://github.com/conciv-dev/conciv/commit/efef98ab991cd2ce4aca49d7696a135ec0894bec), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`478c83b`](https://github.com/conciv-dev/conciv/commit/478c83bdee4d5d7c5e7a27c3586d030907ccf80c), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6)]:
  - @conciv/protocol@0.0.20
  - @conciv/ui-kit-system@0.0.20
  - @conciv/solid-streamdown@0.0.20
  - @conciv/solid-diffs@0.0.20
  - @conciv/storage-history@0.0.20

## 0.0.19

### Patch Changes

- [#437](https://github.com/conciv-dev/conciv/pull/437) [`e628f93`](https://github.com/conciv-dev/conciv/commit/e628f93ed9d4067c6ad164a2af0369e543abd62f) Thanks [@omridevk](https://github.com/omridevk)! - Chat transcript scrolling is now owned by @conciv/solid-stick-to-bottom, a faithful Solid port of use-stick-to-bottom: the viewport only moves for pinned streaming follow, the scroll-to-bottom button, and sending a message. Chain-of-thought/reasoning cards auto-close once when their own content completes, and user toggles after that are permanent. Tool approval force-opens the tool card once. User card toggles never shift the viewport. Chain content defaults to grow, with a `grow` prop for the capped pane.

- [#313](https://github.com/conciv-dev/conciv/pull/313) [`39c6072`](https://github.com/conciv-dev/conciv/commit/39c6072687cdedeabc42dabe798d88fa10dc716b) Thanks [@omridevk](https://github.com/omridevk)! - The widget composer now runs on the TipTap rich text field from @conciv/ui-kit-tap: slash commands and mentions are atomic chips with typeahead popovers, lowering to the same directive strings the server always received. The string-splice trigger layer is removed from @conciv/ui-kit-chat (trigger popover primitives, slash/mention adapters, directive formatter, the styled composer popover slot); ComposerPrimitive.Input remains the plain textarea primitive.

- [#460](https://github.com/conciv-dev/conciv/pull/460) [`23f62c9`](https://github.com/conciv-dev/conciv/commit/23f62c9ad8a810cdf177a53701a1516b191436fe) Thanks [@omridevk](https://github.com/omridevk)! - Transcript virtualization: long threads render through a TanStack virtual-core window with stable turn identity, pretext-based height estimates, and lazy collapsed card bodies; fast-scroll main-thread stalls drop from ~380ms to ~70ms.

- Updated dependencies [[`e628f93`](https://github.com/conciv-dev/conciv/commit/e628f93ed9d4067c6ad164a2af0369e543abd62f), [`6ce79cf`](https://github.com/conciv-dev/conciv/commit/6ce79cf66cb0629ba965af4d4d06b242c673b017)]:
  - @conciv/solid-stick-to-bottom@0.0.19
  - @conciv/ui-kit-system@0.0.19
  - @conciv/protocol@0.0.19
  - @conciv/solid-diffs@0.0.19
  - @conciv/solid-streamdown@0.0.19
  - @conciv/storage-history@0.0.19

## 0.0.18

### Patch Changes

- [#212](https://github.com/conciv-dev/conciv/pull/212) [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd) Thanks [@omridevk](https://github.com/omridevk)! - Fix double-constructed JSX props and tighten composer state handling.
  - `ToolChip`'s `tip` and `Terminal`'s `rail` resolve their JSX prop through a `children()` memo, so a
    component passed as that prop is built once instead of two or three times.
  - The model selector no longer disappears when the model list fails to load: it renders a retry
    affordance, announces the failure, and restores the picker once the retry succeeds.
  - Thread auto-scroll runs off an explicit machine, and reactive-scope listeners and timers go through
    solid-primitives so they clean themselves up with their owner.

- [#175](https://github.com/conciv-dev/conciv/pull/175) [`3f9bf5d`](https://github.com/conciv-dev/conciv/commit/3f9bf5dc25bcf911e788ef53547436f46cab11b6) Thanks [@omridevk](https://github.com/omridevk)! - Load shiki grammars and themes lazily so code-splitting consumers don't hoist doubly-reachable modules.

- [#212](https://github.com/conciv-dev/conciv/pull/212) [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd) Thanks [@omridevk](https://github.com/omridevk)! - ModelSelector no longer drops keystrokes typed right after the trigger is tapped. The combobox open
  state is owned by the machine unless a consumer passes `open`, so the list opens in the same turn as
  the trigger activation instead of after a round trip through Solid.
- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd)]:
  - @conciv/protocol@0.0.18
  - @conciv/solid-diffs@0.0.18
  - @conciv/solid-streamdown@0.0.18
  - @conciv/storage-history@0.0.18
  - @conciv/ui-kit-system@0.0.18

## 0.0.17

### Patch Changes

- [#153](https://github.com/conciv-dev/conciv/pull/153) [`2aa2b01`](https://github.com/conciv-dev/conciv/commit/2aa2b01db001973dd3432253fabc915462b3ec85) Thanks [@omridevk](https://github.com/omridevk)! - Let the composer's model picker shrink so Stop and Send stay reachable at phone widths. While a turn is running the composer shows Stop next to Send, and the action row had nothing that could give up space: the icon buttons are fixed size by design, and the model pill sat inside wrappers that were all sized to their full label. The row overflowed, and on a 320px phone the Send button was pushed off screen entirely. The pill now shrinks and truncates its label ("Claude Sonnet 4.5" becomes "Claude S...") so the whole row fits, which also removes the few pixels of overflow at 393px and on any narrower device.

- [#154](https://github.com/conciv-dev/conciv/pull/154) [`cf6fc75`](https://github.com/conciv-dev/conciv/commit/cf6fc75ddc841c4fd01b331b93568af7283b320a) Thanks [@omridevk](https://github.com/omridevk)! - Touch, wheel, and keyboard scrolling in the thread now detaches auto-follow, so scrolling back through a reply while the assistant is still streaming no longer fights a re-pin that snaps you to the bottom. This was most visible on iOS, where the browser reports scrolling later than the streamed content arrives. Auto-follow resumes as soon as you return to the bottom or press the scroll-to-end button.

- Updated dependencies []:
  - @conciv/protocol@0.0.17
  - @conciv/solid-diffs@0.0.17
  - @conciv/solid-streamdown@0.0.17
  - @conciv/ui-kit-system@0.0.17

## 0.0.16

### Patch Changes

- [#141](https://github.com/conciv-dev/conciv/pull/141) [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4) Thanks [@omridevk](https://github.com/omridevk)! - Render code and tool output through SolidCodeBlock instead of hand-rolled pre blocks, with explicit languages: plaintext for payloads, TypeScript for eval'd page code, and ANSI for terminal streams so command colors render natively.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/protocol@0.0.16
  - @conciv/solid-diffs@0.0.16
  - @conciv/solid-streamdown@0.0.16
  - @conciv/ui-kit-system@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.15
  - @conciv/solid-streamdown@0.0.15
  - @conciv/ui-kit-system@0.0.15

## 0.0.14

### Patch Changes

- [#94](https://github.com/conciv-dev/conciv/pull/94) [`757071f`](https://github.com/conciv-dev/conciv/commit/757071f4bf394cb591b4f45c5bee9fc63c9afb41) Thanks [@omridevk](https://github.com/omridevk)! - Replace the custom busy-send queue with TanStack AI's native FIFO queue, queued-message controls, and interrupt steering.

- Updated dependencies []:
  - @conciv/protocol@0.0.14
  - @conciv/solid-streamdown@0.0.14
  - @conciv/ui-kit-system@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/solid-streamdown@0.0.13
  - @conciv/ui-kit-system@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.12
  - @conciv/solid-streamdown@0.0.12
  - @conciv/ui-kit-system@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies [[`5f76cc2`](https://github.com/conciv-dev/conciv/commit/5f76cc2d14ae93265f8c72b3eb6d5254abe3bb59)]:
  - @conciv/solid-streamdown@0.0.11
  - @conciv/protocol@0.0.11
  - @conciv/ui-kit-system@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.10
  - @conciv/solid-streamdown@0.0.10
  - @conciv/ui-kit-system@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.9
  - @conciv/solid-streamdown@0.0.9
  - @conciv/ui-kit-system@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.8
  - @conciv/solid-streamdown@0.0.8
  - @conciv/ui-kit-system@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.7
  - @conciv/solid-streamdown@0.0.7
  - @conciv/ui-kit-system@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.6
  - @conciv/solid-diffs@0.0.6
  - @conciv/solid-streamdown@0.0.6
  - @conciv/ui-kit-system@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/protocol@0.0.5
  - @conciv/solid-diffs@0.0.5
  - @conciv/solid-streamdown@0.0.5
  - @conciv/ui-kit-system@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.4
  - @conciv/solid-diffs@0.0.4
  - @conciv/solid-streamdown@0.0.4
  - @conciv/ui-kit-system@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.3
  - @conciv/solid-diffs@0.0.3
  - @conciv/solid-streamdown@0.0.3
  - @conciv/ui-kit-system@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.2
  - @conciv/solid-diffs@0.0.2
  - @conciv/solid-streamdown@0.0.2
  - @conciv/ui-kit-system@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.1
  - @conciv/solid-diffs@0.0.1
  - @conciv/solid-streamdown@0.0.1
  - @conciv/ui-kit-system@0.0.1
