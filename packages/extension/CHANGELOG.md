# @conciv/extension

## 0.0.23

### Patch Changes

- [#842](https://github.com/conciv-dev/conciv/pull/842) [`042f5f1`](https://github.com/conciv-dev/conciv/commit/042f5f1dc38120382a7f2f9e780733439b1cfd5b) Thanks [@omridevk](https://github.com/omridevk)! - `useSettings()` returns an extension's settings with this project's values over the values set for all projects, over the defaults. `mergeSettings(project, global)` is exported for hosts that show both.

- [#828](https://github.com/conciv-dev/conciv/pull/828) [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f) Thanks [@omridevk](https://github.com/omridevk)! - Extensions are opt-in. `@conciv/it` no longer installs any extension: add the ones you want by importing them and
  passing them to the plugin, for example `conciv({extensions: [whiteboard(), design({comparator: 'pixelmatch'})]})`,
  or `withConciv(nextConfig, {extensions: [terminal()]})` on Next.js. Each extension package's default export is now a
  function that takes that extension's options, and the name-keyed `extensions: {design: {...}}` option is gone. The
  server extension object moved to each package's `/server` subpath. The TanStack inspector follows the same shape:
  replace the `conciv/extensions/tanstack.tsx` re-export with `extensions: [tanstack()]`. `register()` on Next.js now
  validates `CONCIV_OPTIONS` and fails with a clear error when it is not a valid conciv config.

- [#829](https://github.com/conciv-dev/conciv/pull/829) [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d) Thanks [@omridevk](https://github.com/omridevk)! - Agents can queue a list of page actions in one call; the page plays them in order with the pointer and the results come back when the list is done.

- [#832](https://github.com/conciv-dev/conciv/pull/832) [`ebcb3ac`](https://github.com/conciv-dev/conciv/commit/ebcb3ac7177c5854a31a9480e31aaaf769b18f24) Thanks [@omridevk](https://github.com/omridevk)! - An extension now learns when conciv refuses an outside agent's call to one of its tools. Its `.server()` factory can return an oRPC `middleware` next to `context`, for example `onError((error, {path, context}, input) => ...)`, and conciv runs it around every tool the extension owns. When the user denies an outside agent access to the tab, or does not approve an `approval: 'ask'` tool, the refusal is thrown inside the tool's own procedure, so that middleware sees it with the tool name, the input and the session id.

- [#798](https://github.com/conciv-dev/conciv/pull/798) [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743) Thanks [@omridevk](https://github.com/omridevk)! - Every browser oRPC call now rides one reconnecting WebSocket per engine (`/rpc-ws`) instead of HTTP. The socket reconnects on its own, open streams such as `sessions.changes` resubscribe after an engine restart or a laptop sleep, and reachability follows the socket's open and close. Trust is per connection: a socket serves only the login procedures until its first trust frame or auth call trusts it, and a revoked token closes the socket and stops it reconnecting. The HTTP `/rpc` handler stays for node clients.
- Updated dependencies [[`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`f2d65ca`](https://github.com/conciv-dev/conciv/commit/f2d65ca836ddf7ff5cdd79bcd56a4f7aab86bb00), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53)]:
  - @conciv/protocol@0.0.23
  - @conciv/contract@0.0.23
  - @conciv/ui-kit-system@0.0.23
  - @conciv/grab@0.0.23

## 0.0.22

### Patch Changes

- [#797](https://github.com/conciv-dev/conciv/pull/797) [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e) Thanks [@omridevk](https://github.com/omridevk)! - Extensions declare their user settings once, as a zod object in `defineExtension({settings})` (every field needs a `.default()`, `.meta({title, description})` labels it), plus an optional `icon`. The settings page adds a tab for each such extension with one control per field, saved per project. The extension reads the parsed values live with `useSettings()` on the client and `ServerApi.settings` on the server; Advanced resets every extension's settings.

- [#711](https://github.com/conciv-dev/conciv/pull/711) [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9) Thanks [@omridevk](https://github.com/omridevk)! - Extension slash commands run in the widget. A command picked from the `/` menu, or typed alone and sent, calls its `run({sessionId})` and is never sent to the agent; it replaces a harness command of the same name. The widget's built-in `/model` opens the composer's model menu.

  Breaking: `ExtensionCommand` is now `{name, description, run(context)}`. The unused `argumentHint` and `prompt(args)` fields are removed.

- [#747](https://github.com/conciv-dev/conciv/pull/747) [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8) Thanks [@omridevk](https://github.com/omridevk)! - Packages now report their real release version, for future migrations; a version difference never breaks anything. `conciv` carries it as its `meta.version`, the Claude Code connect plugin is stamped with it instead of `0.0.0`, and every engine response carries an `x-conciv-version` header. Node rpc clients send their own version in the same header; browser requests send no new header, so a newer widget still reaches an older engine. When the engine is older than the widget (or predates versions), the panel shows a notice asking to update the @conciv packages. `conciv init` now also runs `claude plugin update`, so an install recorded at an earlier release moves onto the current one.

- [#764](https://github.com/conciv-dev/conciv/pull/764) [`bd41ba7`](https://github.com/conciv-dev/conciv/commit/bd41ba79644530696274de010e230b6adcdf30b1) Thanks [@omridevk](https://github.com/omridevk)! - Page screenshots and design captures leave out every piece of conciv UI on the page (the widget, the effects layer and its style tags), not only the widget. The list lives in one place, `CONCIV_UI_SELECTOR` in `@conciv/extension`, and the recorder, element grabs and both capture paths share it.

  Captures also keep text that sits on one line on one line. In Firefox, snapdom drew a link like "Home" on a page with `overflow-wrap: anywhere` as "Hom / e": its one-line guard was undone by its own tag reset. A capture plugin now carries that guard down to every element inside the pinned box.

  Page tools never act on an element inside conciv's effects layer, the same as the widget, and the grab toast carries its own `data-conciv-toast` marker so it stays out of captures too.

  `page_screenshot` takes an optional `exclude` list of CSS selectors for host-page elements to leave out, such as a devtools button. A selector the page cannot read is skipped, the capture still runs, and the result lists it under `warnings`.

  The capture plugins moved from the `@conciv/extension-page/body-margins` subpath to `@conciv/extension-page/capture-plugins`; the old subpath is gone.

- [#779](https://github.com/conciv-dev/conciv/pull/779) [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986) Thanks [@omridevk](https://github.com/omridevk)! - Extensions and the app get persisted settings with Devframe's settings contract: `scope(namespace).settings.global` and `.project` on the server API, `getHostApi().useScope(namespace).settings` in the client, both backed by one JSON file per scope and namespace and kept in sync over the new `settings` procedures.

- [#794](https://github.com/conciv-dev/conciv/pull/794) [`26576dc`](https://github.com/conciv-dev/conciv/commit/26576dc0dd99d34892ba238a6d0c550c40ab312f) Thanks [@omridevk](https://github.com/omridevk)! - `makeViteBridge` moves from `@conciv/plugin/vite` to `@conciv/extension/vite`, so extensions can build a Vite bundler bridge without depending on the plugin.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`f0daa1a`](https://github.com/conciv-dev/conciv/commit/f0daa1a089aa580314962870470eda2a01c396e4), [`123466d`](https://github.com/conciv-dev/conciv/commit/123466d3313ba51a75b8828950c2c96045238abf), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`b591c13`](https://github.com/conciv-dev/conciv/commit/b591c138b32b293a14f1d3f2dc92d5c58889402c), [`b96e75c`](https://github.com/conciv-dev/conciv/commit/b96e75cb63d8fab22327016f70976629ef549763), [`6d53b93`](https://github.com/conciv-dev/conciv/commit/6d53b9329faa79d6a9f7f9fec93d0241f07e9c50), [`57aa7f3`](https://github.com/conciv-dev/conciv/commit/57aa7f37cbb18fe3be0a2b6dc341fd612bdbd62c), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`059da2b`](https://github.com/conciv-dev/conciv/commit/059da2b4f46cccc818223903bbab21f3bd9c99b3), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`8a67d39`](https://github.com/conciv-dev/conciv/commit/8a67d39d925d61aaf881a878bdd3c4dfea0193c4), [`b2dfd2b`](https://github.com/conciv-dev/conciv/commit/b2dfd2b279d7ad6bab81c3c99d3c24874de5c257), [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09)]:
  - @conciv/protocol@0.0.22
  - @conciv/ui-kit-system@0.0.22
  - @conciv/contract@0.0.22
  - @conciv/grab@0.0.22

## 0.0.21

### Patch Changes

- [#669](https://github.com/conciv-dev/conciv/pull/669) [`f0ffc0b`](https://github.com/conciv-dev/conciv/commit/f0ffc0b076d88de8ebd93655d980629e29889937) Thanks [@omridevk](https://github.com/omridevk)! - Node extension RPC clients now stop a stream when its abort signal fires, even after the fetch Request has been garbage collected.
- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`ad66158`](https://github.com/conciv-dev/conciv/commit/ad66158ab8919dd5a482f30cca45367df5a9566b), [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3), [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1)]:
  - @conciv/protocol@0.0.21
  - @conciv/ui-kit-system@0.0.21
  - @conciv/contract@0.0.21
  - @conciv/grab@0.0.21

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
  ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
  ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
  moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
  comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
  renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
  chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
  so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Delete parallel structures in the chat plane: the `toChatTool` and `makeConcivSandbox`-adjacent wrappers, the hand-rolled per-session promise chain (now `InMemoryLockStore` from `@tanstack/ai`), the duplicated code-mode event mapping on the MCP path, the abort-safe sandbox process wrappers, and the JSON-schema dereferencer (tool schemas must now serialize to one inline schema, enforced at registration).

  **Breaking for extension authors: tool names are now plain snake_case identifiers.** conciv adopts TanStack AI's tool-naming convention instead of its own dotted one. `registerTool` validates every name against `^[a-z][a-z0-9_]*$` and rejects anything else with a message naming the tool and the rule, because the code-mode isolate binds each tool as a JavaScript function (`external_<name>`). Every first-party tool was renamed accordingly: `page.<verb>` to `page_<verb>`, `server.<op>` to `server_<op>`, `canvas.*`/`comment.*`/`ios.*` to `canvas_*`/`comment_*`/`ios_*`, `pin.setState` to `pin_set_state`, `anchor.resolve` to `anchor_resolve`, `element.reference` to `element_reference`, and the `tanstack.*` family to `tanstack_*` with camelCase verbs lowered to snake (`tanstack.dataEntries` becomes `tanstack_data_entries`). Rename your own dotted tools; the CLI command shape (`conciv tools page fill`) is unchanged. Code-mode bindings are now `external_<name>` straight from `toolsToBindings`, so `sanitizeIdentifier`/`uniqueIdentifier` are gone from `@conciv/extension`, and the tool-name normalizer only strips CLI and bridge prefixes (`mcp__*__`, `tanstack_`) — it no longer folds punctuation. Tool names stored in old transcripts are left exactly as written and will render as unknown tools.

  **The TanStack extension now registers one tool per verb.** The `tanstack_page_*` namespace is gone: each page verb is registered once, under its agent-facing name, as the client tool that implements it — `tanstack_page_router_state` is now simply `tanstack_router_state`, and the server-side re-wraps that used to shadow those verbs (`routerStateServer`, `routeTreeServer`, `loaderDataServer`, `queryCacheServer`, `navigateServer`, `routerInvalidateServer`, `backServer`, `queryInvalidateServer`, `queryRefetchServer`) are deleted along with `src/shared/verb-defs.ts` and `src/client/verbs.ts`. Removed tool names: `tanstack_page_detect`, `tanstack_page_router_state`, `tanstack_page_route_tree`, `tanstack_page_data_entries`, `tanstack_page_data_get`, `tanstack_page_data_invalidate`, `tanstack_page_data_refetch`, `tanstack_page_errors_snapshot`, `tanstack_page_query_cache`, `tanstack_page_query_invalidate`, `tanstack_page_query_refetch`, `tanstack_page_navigate`, `tanstack_page_router_invalidate`, `tanstack_page_back`, and `tanstack_invalidate` (renamed to `tanstack_router_invalidate`). New names for verbs that had no curated tool: `tanstack_detect`, `tanstack_data_entries`, `tanstack_data_invalidate`, `tanstack_errors_snapshot`. Results lose the `{result: …}` envelope — `tanstack_router_state` answers `{location, matches}` directly. The page plane only transports plain records, so the three verbs whose natural answer is not one name their payload: `tanstack_data_entries` answers `{entries}`, `tanstack_errors_snapshot` answers `{errors}`, and `tanstack_loader_data` answers `{routeId, data}` (the routeId tells you which match answered when you omit it).

  **The run record is the only source of run liveness.** `packages/core/src/chat/live-runs.ts` is deleted. The four seams that used to ask a process-local map whether a session was busy now ask the `RunStore`: the extension server's `sessions.chatBusy`, the session scope's `run.live()`, the sessions RPC listing, and `subscribeSession`. All four are async as a result — `chatBusy` and `run.live()` return promises, and `listSessionMetas` takes a `running` set resolved once per list call from the new `runningThreadIds` query instead of a per-row predicate. What stays in memory is only what a database cannot hold: each in-flight run's `AbortController` and its driver promise, keyed by run id in `run-drivers.ts` and dropped when the run settles, plus the per-session lock in `session-locks.ts`.

  **One tool invalidates a route's loader data, not two.** `FrameworkClientCore['data']` loses its `refetch(key)` member: refetching a route was byte-identical to invalidating it — both call the router's `invalidate` — so the surface now carries only `invalidate(key)`, exposed to the agent as `tanstack_data_invalidate`. `QueryCacheSurface.refetch` and `tanstack_query_refetch` are untouched, because refetching a query really is not invalidating a route.

- [#504](https://github.com/conciv-dev/conciv/pull/504) [`4e1e430`](https://github.com/conciv-dev/conciv/commit/4e1e430dd7e67e8f817d0bcfc0c3132782537767) Thanks [@omridevk](https://github.com/omridevk)! - Split the extension-facing and host-facing surfaces. `getExtensionApi(id)` now carries every host
  hook alongside `useContext`, so extension code needs nothing else. `getHostApi`, `HostApiProvider`,
  `HostWiring` and `ConnectHostApi` left the root barrel and now live on the new
  `@conciv/extension/host` subpath, which only an app wiring the widget host imports.

- [#570](https://github.com/conciv-dev/conciv/pull/570) [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1) Thanks [@omridevk](https://github.com/omridevk)! - The widget now adapts to the host page's color scheme instead of always rendering dark. It resolves
  the scheme at mount, before first paint, from a computed `color-scheme` on the host root, then a
  `.light`/`.dark` class or `data-theme` attribute, then `prefers-color-scheme`, and re-resolves live
  when the host page toggles its theme. Every color token is declared once as a `light-dark()` pair,
  so a scheme is a single `color-scheme` flip: scrollbars, native controls, Shiki code blocks, the
  diffs component, popped-out windows, and the terminal pane all follow. UnoCSS `dark:`/`light:`
  variants key off the widget's own scheme classes. Extension `chat-accent` / `chat-hue` overrides keep
  working in both schemes.

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

- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`9549d4a`](https://github.com/conciv-dev/conciv/commit/9549d4a6b484da8e40135eb8abd676ade23ba1b2), [`958dde7`](https://github.com/conciv-dev/conciv/commit/958dde7a862c8cfd735c2232ca13cef659b301f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`09f620a`](https://github.com/conciv-dev/conciv/commit/09f620a62d8d65e5721dd16eeaf7f2651225975e), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`478c83b`](https://github.com/conciv-dev/conciv/commit/478c83bdee4d5d7c5e7a27c3586d030907ccf80c), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`1cb8a51`](https://github.com/conciv-dev/conciv/commit/1cb8a51610a59d764ce064216a50b5209d28bde0)]:
  - @conciv/protocol@0.0.20
  - @conciv/contract@0.0.20
  - @conciv/ui-kit-system@0.0.20
  - @conciv/grab@0.0.20

## 0.0.19

### Patch Changes

- [#335](https://github.com/conciv-dev/conciv/pull/335) [`b329b47`](https://github.com/conciv-dev/conciv/commit/b329b47b889201093c5de042f389eac297caa249) Thanks [@omridevk](https://github.com/omridevk)! - Move the rpc mount seam (`makeCompositeRpcRouter`, `rpcFetchMiddleware`, `rpcWebsocketRoute`, `RPC_PREFIX`,
  `RPC_WS_PATH`) from `@conciv/core` into `@conciv/extension/rpc-mount`, so extension fixtures and test harnesses
  mount the same composite router over both transports instead of hand-rolling a second one. `@conciv/core`
  imports the seam from there; behavior is unchanged.

  `rpcWebsocketRoute(router, {upgrade, onError})` now takes its `upgradeWebSocket` adapter as an injected
  argument instead of importing `@hono/node-server` directly, so every caller (core's own mount, the test
  harnesses, extension fixtures) shares one `@hono/node-server` module instance for the upgrade — a second
  instance silently refuses the upgrade. `@conciv/serve` re-exports `upgradeWebSocket` as the one sanctioned
  source for that adapter; pass it (and an optional `onError` for rejected frames) at every call site.

- Updated dependencies [[`6ce79cf`](https://github.com/conciv-dev/conciv/commit/6ce79cf66cb0629ba965af4d4d06b242c673b017), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323)]:
  - @conciv/ui-kit-system@0.0.19
  - @conciv/contract@0.0.19
  - @conciv/grab@0.0.19
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- [#251](https://github.com/conciv-dev/conciv/pull/251) [`1e1b01b`](https://github.com/conciv-dev/conciv/commit/1e1b01b36c3b5c282d51a6689b8a18810a330fc2) Thanks [@omridevk](https://github.com/omridevk)! - Tools declared through a shared definition object (the pattern that lets a client and a server file agree on one contract) kept their name only as a widened `string`, so they were silently absent from the typed registry client and invisible to the tool-name collision diagnostics. A `toolDefinition()` helper on the UI-free `@conciv/extension/tool` subpath gives those objects an inference site that preserves the literal name, and every shared definition across the bundled extensions now goes through it. A tool's declared `errors` are carried through to the typed client too: `isDefinedError` narrows a call-site failure to the declared code with its `data` type instead of collapsing to `never`. Only a tool that is provably server-bound carries its declared errors alone; a client-bound declaration, and a renderer-only one (which cannot know how its separately compiled runtime twin is bound), both additionally expose the transport codes the forwarding layer can raise.

- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd)]:
  - @conciv/protocol@0.0.18
  - @conciv/contract@0.0.18
  - @conciv/grab@0.0.18
  - @conciv/ui-kit-system@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.17
  - @conciv/grab@0.0.17
  - @conciv/protocol@0.0.17
  - @conciv/ui-kit-system@0.0.17

## 0.0.16

### Patch Changes

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - Extensions can declare typed, zod-validated browser `pageVerbs` in `.client(...)` and invoke them from `.server(...)` via a scoped, fully-typed `server.page.call(verb, args)`. Every failure path rejects with a typed `PageVerbError` (`no-widget` | `unknown-verb` | `invalid-args` | `handler-error` | `timeout`). Core gains one generic `ext` page-query kind; no framework-specific code.

  Supporting plumbing lands in sibling packages: `@conciv/page` exports the extension page-verb registry (`registerExtensionPageVerbs`/`unregisterExtensionPageVerbs`/`clearExtensionPageVerbs`/`bindExtensionPageVerbs`), the `rootFibers` React-tree walker, and the `dehydrate` serializer (depth/size caps plus secret-key redaction) that every browser verb runs untrusted values through. `@conciv/plugin` exports `makeViteBridge` (from `@conciv/plugin/vite`), a `BundlerBridge` whose `subscribe` emits the generic build/HMR/request-trace diagnostic stream that server-side inspection tools consume.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e)]:
  - @conciv/protocol@0.0.16
  - @conciv/grab@0.0.16
  - @conciv/contract@0.0.16
  - @conciv/ui-kit-system@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.15
  - @conciv/grab@0.0.15
  - @conciv/protocol@0.0.15
  - @conciv/ui-kit-system@0.0.15

## 0.0.14

### Patch Changes

- [#97](https://github.com/conciv-dev/conciv/pull/97) [`8370fd9`](https://github.com/conciv-dev/conciv/commit/8370fd9ef1156296236d4a9e22f5453ca817d9f3) Thanks [@omridevk](https://github.com/omridevk)! - `defineAttachment().card()` now types its component as `Component<AttachmentCardProps>` instead of a bare
  `Component`, so extension authors can read the `remove` element the composer hands the card without
  re-declaring the prop type by hand.
- Updated dependencies []:
  - @conciv/contract@0.0.14
  - @conciv/grab@0.0.14
  - @conciv/protocol@0.0.14
  - @conciv/ui-kit-system@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/contract@0.0.13
  - @conciv/grab@0.0.13
  - @conciv/ui-kit-system@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.12
  - @conciv/grab@0.0.12
  - @conciv/protocol@0.0.12
  - @conciv/ui-kit-system@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.11
  - @conciv/grab@0.0.11
  - @conciv/protocol@0.0.11
  - @conciv/ui-kit-system@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.10
  - @conciv/grab@0.0.10
  - @conciv/protocol@0.0.10
  - @conciv/ui-kit-system@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.9
  - @conciv/grab@0.0.9
  - @conciv/protocol@0.0.9
  - @conciv/ui-kit-system@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/contract@0.0.8
  - @conciv/grab@0.0.8
  - @conciv/protocol@0.0.8
  - @conciv/ui-kit-system@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.7
  - @conciv/grab@0.0.7
  - @conciv/protocol@0.0.7
  - @conciv/ui-kit-system@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.6
  - @conciv/grab@0.0.6
  - @conciv/protocol@0.0.6
  - @conciv/ui-kit-system@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/api-client@0.0.5
  - @conciv/grab@0.0.5
  - @conciv/protocol@0.0.5
  - @conciv/ui-kit-system@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.4
  - @conciv/grab@0.0.4
  - @conciv/protocol@0.0.4
  - @conciv/ui-kit-system@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.3
  - @conciv/grab@0.0.3
  - @conciv/protocol@0.0.3
  - @conciv/ui-kit-system@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.2
  - @conciv/grab@0.0.2
  - @conciv/protocol@0.0.2
  - @conciv/ui-kit-system@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.1
  - @conciv/grab@0.0.1
  - @conciv/protocol@0.0.1
  - @conciv/ui-kit-system@0.0.1
