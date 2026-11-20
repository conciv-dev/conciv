# CI reds: run 44537686715 (main 58b649460)

Red jobs: Test shard-1 (135607879288), Test shard-3 (135607879207), Test shard-4 (135607879262), Test shard-7 (135607879646), Test shard-8 (135607879396), E2E shard-1 (135607857030), E2E shard-2 (135607856785), Repo checks (135607715369), Storybook browser tests (135607714969)

## Counts

| Package                               | Job                     | Kind      | Failing cases     |
| ------------------------------------- | ----------------------- | --------- | ----------------- |
| @conciv/app                           | Test shard-1            | test      | 25 (26 in report) |
| @conciv/db                            | Test shard-3            | test      | 1                 |
| @conciv/cli                           | Test shard-3            | test      | 9                 |
| @conciv/core                          | Test shard-4            | test      | 14                |
| @conciv/ui-kit-chat-tools             | Test shard-8            | test      | 1                 |
| @conciv/ui-kit-chat                   | Test shard-8            | test      | 2                 |
| site                                  | E2E shard-1             | test      | 5                 |
| conciv-storybook (apps/storybook)     | Storybook browser tests | test      | 3                 |
| conciv-e2e-nextjs                     | E2E shard-2             | test      | 1                 |
| nextjs-app (apps/examples/nextjs-app) | Repo checks             | build     | 1                 |
| site (apps/site)                      | Test shard-7            | typecheck | 1                 |

Total failing test cases: 61; non-test failures: 2.

## @conciv/app

Job: Test shard-1 (135607879288). Likely cause: cause unknown (report counts 26 failed: the "ctx.ui.Menu radio and checkbox entries" name has two failing results, listed once below with both errors; 22 of 25 names are the "a fixture plugin driven like a user" describe: the fixture plugin tab/buttons never render, so its plugin likely does not load; log does not say why)

- **test/conciv.browser.test.tsx** :: chat history paging › scrolling up loads the older page well before the top, and the messages in view stay where they were
  ```
  Error: expect(element).toBeInViewport()
  Received element is not in viewport (actual ratio: 0.000):
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:2953:68
  at test/conciv.browser.test.tsx:2922:9
  ```
- **test/conciv.browser.test.tsx** :: chat history paging › the replies on screen are kept, not rebuilt, when the page before them lands
  ```
  Error: expect(element).toBeInViewport()
  Received element is not in viewport (actual ratio: 0.000):
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:2953:68
  at test/conciv.browser.test.tsx:2936:9
  ```
- **test/conciv.browser.test.tsx** :: settings page › a journey through every settings tab that saves, applies, survives a reload and resets
  ```
  Error: expect(element).toBeChecked()
  Received element is not checked:
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:8643:74
  ```
- **test/conciv.browser.test.tsx** :: installed plugins › a plugin that never loaded is listed with its error, and disable, enable and reload act through the store
  ```
  AssertionError: expected [ { id: 'page', …(2) }, …(8) ] to deeply equal [ { id: 'page', …(2) }, …(7) ]
  @@ -15,10 +15,15 @@
        "id": "tanstack-card",
      },
      {
        "builtin": true,
  at test/conciv.browser.test.tsx:10982:49
  at test/conciv.browser.test.tsx:11075:3
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its engine ref reads the event connection: down while the engine is offline, up again when it returns, and a keyed run attaches again
  ```
  VitestBrowserElementError: Cannot find element with locator: getByText('Engine attached: 1')
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:11657:77
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its dialogs stack and return focus, its composer writes wait for the chat, its opened and renamed tabs show, an unlisted tab goes back to the chat, and its draft opens a new session with its prompt in the composer
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Fixture tools' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:11671:65
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its notes go from the composer cards to the sent message and stay after a reload
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('button', { name: 'Attach two notes' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:11789:72
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its notes written while the draft still loads stay with that session when the user switches to another
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Fixture tools' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:11983:65
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its notes written while the draft still loads never replace a saved draft that could not be read
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Fixture tools' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12036:65
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its notes come back to the composer as notes, with the typed text, whenever a draft is put back
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('button', { name: 'Attach two notes' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12055:72
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its ctx.ui.Popover › opens beside its anchor and leaves the page usable, closes on Escape with focus back on the anchor and on a click outside, and focuses the field it names
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Fixture popovers' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12253:69
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its ctx.ui.RelativeTime, ctx.ui.Avatar and ctx.ui.Chip › show how long ago a time was, a person by name with their initials when there is no image, a chip whose tooltip opens on hover, and a clipped chip whose tooltip shows its full value with the tooltip text
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Fixture people' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12296:67
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its ctx.ui.Menu radio and checkbox entries › a radio entry and a checkbox entry stay checked, and the app's MentionField from @conciv/ui-kit-tap sends a mention
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Fixture people' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12335:67
  ```
  ```
  Error: expect.poll() function didn't resolve in time.
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12387:67
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its overlay draws a widget-styled label above the page, takes a click on a control that opts back into pointer events, follows the color mode chosen in Settings, applies its own styles, and goes away on dispose and when the plugin is turned off
  ```
  Error: expect.poll() function didn't resolve in time.
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12431:65
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › a plugin that throws from its panel focus, its panel list or its reactive slot loses only that contribution, shows the failure in Settings, and the chat and the other plugin keep working
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('button', { name: 'Write a held note' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12491:55
  at test/conciv.browser.test.tsx:12516:3
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its panel reads the routed session idle, then running once a turn starts, and its interrupt stops the run and answers whether one was going
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Fixture tools' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12537:65
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › a cold link to its tab shows the tab, and a cold link to its old tab key ends on the renamed tab
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('button', { name: 'Write a plain note' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12558:74
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › a cold link to its tab while its bundle is still being read waits, then shows the tab
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('button', { name: 'Write a plain note' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12579:74
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its session store read cut off by a lost engine shows loading until the engine is back and the read is retried, and an engine error on that read leaves it loading
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Fixture tools' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12605:65
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › a cold link to a tab no panel lists ends on the chat, and a cold link to its tab with the engine unreachable keeps its address under the lost connection notice and opens the tab once the engine is back
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Fixture tools' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12640:65
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its tool card body comes back after the thread evicts it, and its store survives a reload and refuses a bad write
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Fixture tools' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12687:65
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › its tab shows once trusted, through a revoke, a lost connection and trust dropped before its enable state, and its tab and settings page keep their place through a revoke and a reopen
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Fixture tools' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12749:65
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › turning it off in Settings removes its tab and slot, turning it on brings them back, and turning it off elsewhere closes its open tab
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Fixture tools' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12828:65
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › a page overlay that hides the chat takes the chat out of reach by role and by Tab, and closing it brings the composer back
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('button', { name: 'Open the hiding overlay' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12855:60
  ```
- **test/conciv.browser.test.tsx** :: a fixture plugin driven like a user › on a phone its mobile views are status bar entries drawn in place of the chat, a cached one keeps its state, and the address survives a reload and a desktop width
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('tab', { name: 'Count' })
  Caused by: Error: Matcher did not succeed in time.
  at test/conciv.browser.test.tsx:12875:57
  ```

## @conciv/db

Job: Test shard-3 (135607879207). Likely cause: plain from log: migration 20261118184653_drop_old_page_tables has a prevIds/parent chain break and the latest snapshot lacks column drafts.items

- **test/db.test.ts** :: db › migrations folder › is one chain whose latest snapshot holds every column the schema declares
  ```
  AssertionError: expected [ { …(3) } ] to deeply equal []
  - []
  + [
  +   {
  +     "name": "20261118184653_drop_old_page_tables",
  +     "parent": [
  at test/db.test.ts:410:32
  ```
  ```
  AssertionError: expected [ 'drafts.items' ] to deeply equal []
  - []
  + [
  +   "drafts.items",
  + ]
  at test/db.test.ts:422:30
  ```

## @conciv/cli

Job: Test shard-3 (135607879207). Likely cause: cause unknown (CLI arg-parsing and derived-command help text no longer match the test expectations)

- **test/cli.test.ts** :: cli › cli arguments › conciv CLI argument rejection › rejects a mistyped kebab spelling of a real flag and keeps accepting the real one
  ```
  AssertionError: expected 1 to be +0 // Object.is equality
  - 0
  + 1
  at test/cli.test.ts:226:11
  ```
- **test/cli.test.ts** :: cli › cli arguments › conciv CLI argument rejection › still accepts an envelope flag placed before a nested subcommand
  ```
  AssertionError: expected 1 to be +0 // Object.is equality
  - 0
  + 1
  at test/cli.test.ts:247:83
  ```
- **test/cli.test.ts** :: cli › cli arguments › conciv CLI argument rejection › rejects a positional passed as a flag and says how to pass it
  ```
  AssertionError: expected +0 to be 1 // Object.is equality
  - 1
  + 0
  at test/cli.test.ts:268:87
  ```
- **test/cli.test.ts** :: cli › cli arguments › conciv CLI argument rejection › rejects an extra positional instead of dropping it
  ```
  AssertionError: expected '{"ok":false,"error":{"kind":"user","m…' to contain '#b'
  Expected: "#b"
  Received: "{"ok":false,"error":{"kind":"user","message":"Unexpected argument '#a' for conciv tools acme click.","hint":"run conciv tools acme click --help to see the arguments it accepts"}}"
  at test/cli.test.ts:278:31
  ```
- **test/cli.test.ts** :: cli › cli derived commands › the dev-server reload command is gone › tools offers no server group and tools server reload is an unknown command
  ```
  AssertionError: expected 'tools\ninspect & drive the live dev s…' not to match /^\s+server\s/m
  /^\s+server\s/m
  "tools
  inspect & drive the live dev server: every tool group it serves (page, react,
  ...)
  Usage:
  at test/cli.test.ts:424:57
  ```
- **test/cli.test.ts** :: cli › cli derived commands › the CLI reads its commands from the tool declarations › serves a group from an extension the CLI has never heard of
  ```
  AssertionError: expected 'tools acme\nthe acme tools the runnin…' to contain 'raise the acme beacon over the page'
  - raise the acme beacon over the page
  + tools acme
  + the acme tools the running dev server serves; run --help for every capability
  +
  + Usage:
  at test/cli.test.ts:484:61
  ```
- **test/cli.test.ts** :: cli › cli derived commands › the CLI reads its commands from the tool declarations › clears a field when the value is explicitly empty
  ```
  AssertionError: expected 1 to be +0 // Object.is equality
  - 0
  + 1
  at test/cli.test.ts:558:91
  ```
- **test/cli.test.ts** :: cli › cli derived commands › the CLI reads its commands from the tool declarations › still refuses a required flag that was never passed at all
  ```
  AssertionError: expected +0 to be 1 // Object.is equality
  - 1
  + 0
  at test/cli.test.ts:565:76
  ```
- **test/cli.test.ts** :: cli › cli derived commands › the CLI reads its commands from the tool declarations › describes a verb by what it does, never by the verb's own command path
  ```
  AssertionError: expected 'tools acme\nthe acme tools the runnin…' to contain 'type a value into a form field'
  - type a value into a form field
  + tools acme
  + the acme tools the running dev server serves; run --help for every capability
  +
  + Usage:
  at test/cli.test.ts:573:22
  ```

## @conciv/core

Job: Test shard-4 (135607879262). Likely cause: cause unknown (approvals / code-mode / attachments over the rpc wire and engine-boot cleanup expectations no longer hold)

- **test/core-api.it.test.ts** :: rpc wire › chat › approvals › only tools declared to ask ever ask: mutating and read tools run straight through the sandbox
  ```
  AssertionError: expected '{"success":true,"result":[{"echoed":"…' to contain '[{"echoed":"hi"},{"value":7},"undefin…'
  - [{"echoed":"hi"},{"value":7},"undefined"]
  + {"success":true,"result":[{"echoed":"hi"},{"value":7},"function"],"logs":[]}
  + {"echoed":"hi"}
  + {"value":7}
  at test/core-api.it.test.ts:2693:57
  ```
- **test/core-api.it.test.ts** :: rpc wire › chat › approvals › a risky tool is refused until approved, a denial re-runs the turn refused once, and a one-time approval runs once
  ```
  AssertionError: expected '[{"type":"CUSTOM","name":"run.accepte…' to contain 'needs the user'
  Expected: "needs the user"
  Received: "[{"type":"CUSTOM","name":"run.accepted","value":{},"timestamp":1795096507259},{"type":"RUN_STARTED","runId":"ask-run","threadId":"conciv_c1569211-c63c-4363-b985-bfa521d2edd0","timestamp":1795096507262},{"type":"CUSTOM","name":"conciv.run-lifecycle","value":{"runId":"ask-run","phase":"runn
  at test/core-api.it.test.ts:2701:43
  ```
- **test/core-api.it.test.ts** :: rpc wire › chat › approvals › an unanswered ask never times out and a stop leaves it waiting
  ```
  AssertionError: expected [] to deeply equal [ 'conciv:tool:fixture_ask' ]
  - [
  -   "conciv:tool:fixture_ask",
  - ]
  + []
  at test/core-api.it.test.ts:2727:100
  ```
- **test/core-api.it.test.ts** :: rpc wire › chat › approvals › approving for the session lets repeats through, except a command that could hide another
  ```
  Error: no pending approval
  at test/core-api.it.test.ts:2734:9
  ```
- **test/core-api.it.test.ts** :: rpc wire › chat › approvals › the widget calling a tool is the approval, while agents and malformed callers are refused
  ```
  Error: fixture_ask is not on /api/mcp
  at test/core-api.it.test.ts:4609:35
  at test/core-api.it.test.ts:2758:23
  ```
- **test/core-api.it.test.ts** :: rpc wire › chat › approvals › a call refused for a disconnected client, at the outside admission or at the ask reaches the extension middleware
  ```
  AssertionError: promise resolved "{ done: 'asked' }" instead of rejecting
  - Error {
  -   "message": "rejected promise",
  + {
  +   "done": "asked",
    }
  at test/core-api.it.test.ts:2809:28
  ```
- **test/core-api.it.test.ts** :: rpc wire › chat › approvals › a caller outside the widget is refused, shows the ask, and one approval runs one retry
  ```
  AssertionError: promise resolved "{ done: 'x' }" instead of rejecting
  - Error {
  -   "message": "rejected promise",
  + {
  +   "done": "x",
    }
  at test/core-api.it.test.ts:2846:29
  ```
- **test/core-api.it.test.ts** :: rpc wire › chat › attachments and images › an attachment is stored as sent, expanded once for the model only, and the CLI gets the expansion
  ```
  AssertionError: expected -1 to be greater than 115
  at test/core-api.it.test.ts:2897:50
  ```
- **test/core-api.it.test.ts** :: rpc wire › chat › code mode › a turn and agents over MCP get the same tools: run code, discover tools, and the asking tools
  ```
  AssertionError: expected [ 'execute_typescript', …(2) ] to deeply equal ArrayContaining{…}
  - ArrayContaining [
  + [
      "execute_typescript",
      "discover_tools",
  -   "fixture_ask",
  at test/core-api.it.test.ts:3730:25
  ```
- **test/core-api.it.test.ts** :: rpc wire › chat › code mode › discover_tools shows a tool output shape and declared error codes; the catalog lives on execute_typescript
  ```
  AssertionError: expected '"{\"tools\":[{\"name\":\"external_fix…' to contain 'Returns JSON matching'
  Expected: "Returns JSON matching"
  Received: ""{\"tools\":[{\"name\":\"external_fixture_fail\",\"description\":\"Fail with a declared error.\",\"typeStub\":\"interface External_fixture_failInput {\\n  spaced: boolean;\\n}\\n\\n/** Fail with a declared error. */\\ndeclare function external_fixture_fail(input: External_fixture_failInpu
  at test/core-api.it.test.ts:3858:23
  ```
- **test/core-api.it.test.ts** :: rpc wire › chat › code mode › errors keep their declared code, other failures stay plain errors, and huge results are capped
  ```
  AssertionError: expected [Function] to throw error matching /"code":"PROBE_BROKE"/ but got '{"error":{"message":"PROBE_BROKE: the…'
  /"code":"PROBE_BROKE"/
  "{\"error\":{\"message\":\"PROBE_BROKE: the probe broke\",\"name\":\"Error\"}}"
  at test/core-api.it.test.ts:3871:83
  ```
- **test/core.test.ts** :: engine boot writes .conciv/mcp-endpoint.json › releases the port when the endpoint file cannot be written
  ```
  Error: Test timed out in 30000ms.
  If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
  at test/core.test.ts:1353:3
  ```
- **test/core.test.ts** :: engine boot writes .conciv/mcp-endpoint.json › a failed endpoint write fails start with its own error even when a plugin cleanup also fails
  ```
  AssertionError: expected '' to contain 'conciv: cleanup after a failed start …'
  - conciv: cleanup after a failed start also failed
  at test/core.test.ts:1400:27
  ```
  ```
  AssertionError: expected '' to contain 'plugin cleanup failed'
  - plugin cleanup failed
  at test/core.test.ts:1401:27
  ```
- **test/core.test.ts** :: engine boot writes .conciv/mcp-endpoint.json › a request that reaches the engine while its app is failing to build fails instead of hanging, and the port is released
  ```
  AssertionError: expected [] to deeply equal [ toBeOneOf{…} ]
  - [
  -   toBeOneOf<Array [
  -   500,
  -   "dropped",
  - ]>,
  at test/core.test.ts:1436:41
  ```

## @conciv/ui-kit-chat-tools

Job: Test shard-8 (135607879396). Likely cause: cause unknown (file name now rendered twice: tooltip trigger + <bdi> full path)

- **test/ui-kit-chat-tools.browser.test.tsx** :: tool row projections › projects a Write call as a write row and an Edit call as an edit row
  ```
  Error: strict mode violation: getByText('new-file.ts', { exact: false }) resolved to 2 elements: 1) <span dir="ltr" data-part="trigger" data-state="closed" data-scope="tooltip" data-ownedby="tooltip-cl-192" id="tooltip:tooltip-cl-192:trigger" class="truncate flex-1 min-w-0 truncate text-chat-sm lead
      2) <bdi>/repo/src/new-file.ts</bdi> aka getByText('/repo/src/new-file.ts', { exact: false })
  Caused by: Error: Matcher did not succeed in time.
  at test/ui-kit-chat-tools.browser.test.tsx:804:73
  ```

## @conciv/ui-kit-chat

Job: Test shard-8 (135607879396). Likely cause: cause unknown (label casing "Show less" vs "show less"; missing "Copy failed" button)

- **test/cards.browser.test.tsx** :: tool trace row › clamps a long body and reveals the rest from the frame footer
  ```
  AssertionError: expected 'Show less' to be 'show less' // Object.is equality
  Expected: "show less"
  Received: "Show less"
  at test/cards.browser.test.tsx:923:33
  ```
- **test/composer.browser.test.tsx** :: assistant action bar reveal › says the copy did not land when the clipboard refuses a keyboard-activated copy
  ```
  VitestBrowserElementError: Cannot find element with locator: getByRole('button', { name: 'Copy failed' })
  Caused by: Error: Matcher did not succeed in time.
  at test/composer.browser.test.tsx:238:75
  ```

## site

Job: E2E shard-1 (135607857030). Likely cause: cause unknown (built-site widget never shows connect steps / Try it live CTA; same job set has site#typecheck TS2554 in src/lib/mount-live-widget.ts:69, plausibly related)

- **test/site.it.test.ts** :: live connect › widget-native live connect on the built site › opens the panel for a click that lands before the widget bundle has mounted
  ```
  Error: expect(page).toHaveURL(expected) failed
  Expected pattern: /[?&]try=1/
  Received string:  "http://127.0.0.1:46295/"
  Timeout: 5000ms
  Call log:
    - Expect "toHaveURL" with timeout 5000ms
  at test/site.it.test.ts:212:33
  ```
- **test/site.it.test.ts** :: live connect › widget-native live connect on the built site › boots the widget into connect steps and hands off in place to live chat
  ```
  Error: expect(locator).toBeVisible() failed
  Locator: getByRole('dialog', { name: 'conciv chat agent' }).getByText('Drive this page with your agent.')
  Expected: visible
  Timeout: 20000ms
  Error: element(s) not found
  Call log:
  at test/site.it.test.ts:177:78
  at test/site.it.test.ts:238:21
  ```
- **test/site.it.test.ts** :: live connect › widget-native live connect on the built site › remembers a pre-connect dismissal, and ?try=1 forces the panel open again
  ```
  Error: expect(locator).toBeVisible() failed
  Locator: getByRole('dialog', { name: 'conciv chat agent' }).getByText('Drive this page with your agent.')
  Expected: visible
  Timeout: 20000ms
  Error: element(s) not found
  Call log:
  at test/site.it.test.ts:177:78
  at test/site.it.test.ts:289:21
  ```
- **test/site.it.test.ts** :: live connect › widget-native live connect on the built site › the button reopens the panel after a dismiss-then-reload re-entry
  ```
  Error: expect(locator).toBeVisible() failed
  Locator: getByRole('dialog', { name: 'conciv chat agent' }).getByText('Drive this page with your agent.')
  Expected: visible
  Timeout: 20000ms
  Error: element(s) not found
  Call log:
  at test/site.it.test.ts:177:78
  at test/site.it.test.ts:299:21
  ```
- **test/site.it.test.ts** :: mobile gating › landing gates the dev-only demo behind a non-mobile pointer › mounts the live widget and shows the install + try-it CTAs on desktop
  ```
  Error: expect(locator).toBeVisible() failed
  Locator: getByRole('link', { name: /Try it live/i })
  Expected: visible
  Timeout: 5000ms
  Error: element(s) not found
  Call log:
  at test/site.it.test.ts:320:75
  ```

## conciv-storybook (apps/storybook)

Job: Storybook browser tests (135607714969). Likely cause: cause unknown (three story play functions miss expected text)

- **../../../packages/ui-kit-chat/src/styled/markdown.stories.tsx** :: With Provider
  ```
  TestingLibraryElementError: Unable to find an element with the text: a chart the provider declines. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.
  >
    >
        The chart reads
        >
  at ../../../packages/ui-kit-chat/src/styled/markdown.stories.tsx:97:64
  ```
- **../../../packages/ui-kit-chat-tools/src/styled/tools/bash-card.stories.tsx** :: Complete
  ```
  AssertionError: expected '\n  \n    \n  \n  \n    \n  \n  \n   …' to contain 'pnpm test'
  >
        Vitest Browser Tester
    >
      >
  at ../../../packages/ui-kit-chat-tools/src/styled/tools/bash-card.stories.tsx:33:20
  ```
- **../../../packages/ui-kit-chat-tools/src/styled/tools/discovered-apis-card.stories.tsx** :: Detail
  ```
  TestingLibraryElementError: Unable to find an element with the text: /Promise/. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.
    >
      >
        >
          >
  at ../../../packages/ui-kit-chat-tools/src/styled/tools/discovered-apis-card.stories.tsx:69:36
  ```

## conciv-e2e-nextjs

Job: E2E shard-2 (135607856785). Likely cause: plain from log: next build under Turbopack refuses a webpack config with no turbopack config

- **e2e/nextjs/test/widget.spec.ts** :: a workspace-linked @conciv/it under next dev and then next build › next dev boots the engine without a dangling conciv bin link, and next build passes
  ```
  Error: <node> .../linked-app/node_modules/next/dist/bin/next build failed in .../linked-app
  ⨯ ERROR: This build is using Turbopack, with a `webpack` config and no `turbopack` config.
  at e2e/nextjs/test/widget.spec.ts:107:3 (test)
  at e2e/nextjs/test/widget.spec.ts:120:7
  at packages/vitest-config/src/pack.ts:115:11
  ```

## nextjs-app (apps/examples/nextjs-app)

Job: Repo checks (135607715369). Likely cause: plain from log: next build under Turbopack refuses a webpack config with no turbopack config

Note: check-changesets, check-catalog, check-typecheck-coverage passed. tanstack-start-example#build and site#build show "[ELIFECYCLE] Command failed." with no code: stopped by turbo after nextjs-app failed (Tasks: 48 successful, 51 total), not failures of their own.

- **build** :: step "turbo run build --filter=./packages/* ... --filter=./apps/examples/*" -> nextjs-app#build (next build)
  ```
  ⨯ ERROR: This build is using Turbopack, with a `webpack` config and no `turbopack` config.
  [ELIFECYCLE] Command failed with exit code 1.
  at apps/examples/nextjs-app/next.config.ts
  ```

## site (apps/site)

Job: Test shard-7 (135607879646). Likely cause: plain from log: tsc TS2554 at src/lib/mount-live-widget.ts(69,31), a call passes 2 args to a function that takes 0-1

Note: the only red task in shard-7 (Tasks: 74 successful, 75 total); every test suite in the shard passed.

- **typecheck** :: site#typecheck (fumadocs-mdx && tsc --noEmit)
  ```
  src/lib/mount-live-widget.ts(69,31): error TS2554: Expected 0-1 arguments, but got 2.
  at apps/site/src/lib/mount-live-widget.ts:69:31
  ```

## Flaky (failed, then passed on retry)

No case failed-then-passed: vitest reports carry no retries and every Playwright case has retries 0; no "(retry x" in any log.
