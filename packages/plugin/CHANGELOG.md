# @conciv/plugin

## 0.0.23

### Patch Changes

- [#828](https://github.com/conciv-dev/conciv/pull/828) [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f) Thanks [@omridevk](https://github.com/omridevk)! - Extensions are opt-in. `@conciv/it` no longer installs any extension: add the ones you want by importing them and
  passing them to the plugin, for example `conciv({extensions: [whiteboard(), design({comparator: 'pixelmatch'})]})`,
  or `withConciv(nextConfig, {extensions: [terminal()]})` on Next.js. Each extension package's default export is now a
  function that takes that extension's options, and the name-keyed `extensions: {design: {...}}` option is gone. The
  server extension object moved to each package's `/server` subpath. The TanStack inspector follows the same shape:
  replace the `conciv/extensions/tanstack.tsx` re-export with `extensions: [tanstack()]`. `register()` on Next.js now
  validates `CONCIV_OPTIONS` and fails with a clear error when it is not a valid conciv config.

- [#840](https://github.com/conciv-dev/conciv/pull/840) [`c0686d5`](https://github.com/conciv-dev/conciv/commit/c0686d5a73cd6982f749209d7acd743df9e30ca3) Thanks [@omridevk](https://github.com/omridevk)! - The Vite plugin stamps JSX with TanStack devtools' own source injector (`addSourceToJsx` from `@tanstack/devtools-bundler-core`) instead of a conciv copy, and every reader (element grab, page tools, highlight, design extension) reads `data-tsd-source`. The conciv-named source attribute is gone. A host that also runs `@tanstack/devtools-vite` gets one attribute per element, since the injector skips elements that already carry one. The `./inject-source` export of `@conciv/extension-compiler` is removed.
- Updated dependencies [[`fe94df4`](https://github.com/conciv-dev/conciv/commit/fe94df49d1089d57a4e08f19b731cc24f4a4f031), [`85d4a85`](https://github.com/conciv-dev/conciv/commit/85d4a854b9bcdc7c46a0e40a8a7d3bd4b8a6840f), [`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`7a92fc9`](https://github.com/conciv-dev/conciv/commit/7a92fc9b661f9eacf75c14a8cb65d5d303906f24), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`564dd14`](https://github.com/conciv-dev/conciv/commit/564dd148e0dd2f8b7b7b252211f00b5349bab101), [`8c60ea5`](https://github.com/conciv-dev/conciv/commit/8c60ea5a4fea93e5308068bee43bdd432cb933fd), [`042f5f1`](https://github.com/conciv-dev/conciv/commit/042f5f1dc38120382a7f2f9e780733439b1cfd5b), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`a519d5f`](https://github.com/conciv-dev/conciv/commit/a519d5fad8cc0f548c4dcd2a67c671d613dd1184), [`7c4cf8c`](https://github.com/conciv-dev/conciv/commit/7c4cf8cfba7eff9dcd09da39e8aeda9947c58d3b), [`46b08a3`](https://github.com/conciv-dev/conciv/commit/46b08a3c40ca19bfd6bbc0cd81ec0c5a5335a7b9), [`90f01d8`](https://github.com/conciv-dev/conciv/commit/90f01d88e6e00e60eff4caf5c430414965fdd219), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`ef9e8db`](https://github.com/conciv-dev/conciv/commit/ef9e8db736acd149745de30d6063d0e304793f93), [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77), [`f26263f`](https://github.com/conciv-dev/conciv/commit/f26263fa966019250be822439bf6e1a400772a63), [`94bd182`](https://github.com/conciv-dev/conciv/commit/94bd182a63c447973b30e832fe5a844bfe8683b8), [`762a588`](https://github.com/conciv-dev/conciv/commit/762a588d7481d4384cf023c0858c0383f6b273b5), [`ebcb3ac`](https://github.com/conciv-dev/conciv/commit/ebcb3ac7177c5854a31a9480e31aaaf769b18f24), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`b4f64d7`](https://github.com/conciv-dev/conciv/commit/b4f64d7a0e3d4ad478b53fb0ee08f781ec46bb10), [`e76257e`](https://github.com/conciv-dev/conciv/commit/e76257ee22420792b3614a76abb5645dd765e77d), [`042f5f1`](https://github.com/conciv-dev/conciv/commit/042f5f1dc38120382a7f2f9e780733439b1cfd5b), [`48d437c`](https://github.com/conciv-dev/conciv/commit/48d437c6e7f5b85b93d29d6765cd0385f441c332), [`0a7b4d1`](https://github.com/conciv-dev/conciv/commit/0a7b4d1d164d7f0fdfcfd45cbd99f0a0810a5293), [`c0686d5`](https://github.com/conciv-dev/conciv/commit/c0686d5a73cd6982f749209d7acd743df9e30ca3), [`0f6f1f4`](https://github.com/conciv-dev/conciv/commit/0f6f1f42530bb65adde3e01884885e65522cf839)]:
  - @conciv/cli@0.0.23
  - @conciv/core@0.0.23
  - @conciv/protocol@0.0.23
  - @conciv/embed@0.0.23
  - @conciv/extension@0.0.23
  - @conciv/extension-compiler@0.0.23

## 0.0.22

### Patch Changes

- [#727](https://github.com/conciv-dev/conciv/pull/727) [`69e9307`](https://github.com/conciv-dev/conciv/commit/69e9307a76b191720e8abd5d163a3f3cfc8d69b8) Thanks [@omridevk](https://github.com/omridevk)! - Show the page launcher on server-rendered Vite hosts (TanStack Start and others whose html skips `transformIndexHtml`) when Vite DevTools is installed. The dock module and dock settings now travel only with `transformIndexHtml`, the same pipeline Vite DevTools uses to inject its dock, so a page that never gets the dock keeps the floating launcher.

- [#726](https://github.com/conciv-dev/conciv/pull/726) [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd) Thanks [@omridevk](https://github.com/omridevk)! - The engine now refuses every request from a browser it does not trust. A browser becomes trusted by entering the 6-digit code the dev server prints (or opening the printed link); the widget shows a locked launcher until then. Inside the Vite DevTools dock the widget is trusted through DevTools' own login. `conciv auth revoke [id] [--all]` lists and removes trusted browsers.

  Revoking a browser takes effect on the running engine without a restart. The open `/health` route now answers only `{ok, harness, engine: {stale}}`; the full staleness reading stays on the gated `meta.engine` RPC. When any engine call answers 401 the widget checks its login again and shows the locked launcher if the engine no longer trusts it; Retry on the unreachable screen does the same check. A revoke also closes every socket the browser opened (close code 1008), which locks an open tab right away. A missing session header now answers 400 BAD_REQUEST, so 401 only means the login gate refused.

  The launcher now drags like the TanStack Devtools trigger: drop it anywhere, throw it, pin it into a corner, or drag it off an edge to tuck it into a tab (click the tab to bring it back). Arrows move the focused launcher and Shift with an arrow sends it to a corner. The chat panel opens toward the free side of wherever the launcher sits, and the spot is remembered per browser.

- [#687](https://github.com/conciv-dev/conciv/pull/687) [`833e152`](https://github.com/conciv-dev/conciv/commit/833e152b832e955a5d1b81be13ef74e806b3030f) Thanks [@omridevk](https://github.com/omridevk)! - Keep a single Solid when Vite discovers a dependency late. When the host root cannot resolve Solid, the Vite plugin now pre-bundles `solid-js`, `solid-js/web` and `solid-js/store` through `@conciv/embed`, so every pre-bundled dependency shares that one copy and modules served from `node_modules` resolve to it too. `@tanstack/solid-pacer` is pre-bundled again, so workspace-linked hosts no longer discover it after the first optimizer run, which reloaded the page and briefly loaded a second Solid.

- [#686](https://github.com/conciv-dev/conciv/pull/686) [`fbb0bf7`](https://github.com/conciv-dev/conciv/commit/fbb0bf715caf774bec5f1cf400f9c34ab0fc6823) Thanks [@omridevk](https://github.com/omridevk)! - Load a single Solid in Vite hosts installed with pnpm. The Vite plugin no longer force-pre-bundles `lucide-solid/icons/wrench`, and no longer pre-bundles `@tanstack/solid-pacer` with its own copy of Solid. When the host root cannot resolve Solid, Vite cannot keep Solid external in those bundles, so they each carried a second copy of it, which caused the "You appear to have multiple instances of Solid" warning and split the reactive graph behind diff rendering.

- [#794](https://github.com/conciv-dev/conciv/pull/794) [`26576dc`](https://github.com/conciv-dev/conciv/commit/26576dc0dd99d34892ba238a6d0c550c40ab312f) Thanks [@omridevk](https://github.com/omridevk)! - `makeViteBridge` moves from `@conciv/plugin/vite` to `@conciv/extension/vite`, so extensions can build a Vite bundler bridge without depending on the plugin.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`d255573`](https://github.com/conciv-dev/conciv/commit/d255573f14ff345fc58e68a9e1ffdcae48765b68), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9), [`11d67e1`](https://github.com/conciv-dev/conciv/commit/11d67e18038a54bc51b1c81e81e9e2f93ca463e4), [`146920e`](https://github.com/conciv-dev/conciv/commit/146920e36b9a58fab33341be2aab997dc80ff748), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`5a5e82d`](https://github.com/conciv-dev/conciv/commit/5a5e82d134b88e40153ceeb94abd1516ac28d674), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`7dc089b`](https://github.com/conciv-dev/conciv/commit/7dc089b47dc616da95bba7d6c328db957c3500e4), [`2a0b55e`](https://github.com/conciv-dev/conciv/commit/2a0b55e7dc935a8a8d9bb9daca9a1f544f78c07a), [`b6456c7`](https://github.com/conciv-dev/conciv/commit/b6456c7145b81cb0b6f73f15da4215db74f605ea), [`69e9307`](https://github.com/conciv-dev/conciv/commit/69e9307a76b191720e8abd5d163a3f3cfc8d69b8), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`9f0fdb3`](https://github.com/conciv-dev/conciv/commit/9f0fdb3d6d547c05e151798953e01ddc1cf49c04), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`ce9a173`](https://github.com/conciv-dev/conciv/commit/ce9a173a4850ad3fd2ea7fdc8f9249844d6689f0), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`8c2b6a6`](https://github.com/conciv-dev/conciv/commit/8c2b6a63679307b293e39a0ccba902a4563cc20f), [`b591c13`](https://github.com/conciv-dev/conciv/commit/b591c138b32b293a14f1d3f2dc92d5c58889402c), [`4c7cded`](https://github.com/conciv-dev/conciv/commit/4c7cdedfb8841a03edb84eecf2047e76f1269640), [`c4824ef`](https://github.com/conciv-dev/conciv/commit/c4824efb18105452885954ce766e2bea93a266e9), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`6d53b93`](https://github.com/conciv-dev/conciv/commit/6d53b9329faa79d6a9f7f9fec93d0241f07e9c50), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`bd41ba7`](https://github.com/conciv-dev/conciv/commit/bd41ba79644530696274de010e230b6adcdf30b1), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`e8cc8ff`](https://github.com/conciv-dev/conciv/commit/e8cc8ff39b4ebcddf77aa7acf027b8abdc1a1194), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`90b6995`](https://github.com/conciv-dev/conciv/commit/90b6995ccf644e15b1e111926a1648a4b780713a), [`b2dfd2b`](https://github.com/conciv-dev/conciv/commit/b2dfd2b279d7ad6bab81c3c99d3c24874de5c257), [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09), [`90b6995`](https://github.com/conciv-dev/conciv/commit/90b6995ccf644e15b1e111926a1648a4b780713a), [`26576dc`](https://github.com/conciv-dev/conciv/commit/26576dc0dd99d34892ba238a6d0c550c40ab312f), [`b47adb4`](https://github.com/conciv-dev/conciv/commit/b47adb4f9f84e2e8882d53c33c30049a5040b700)]:
  - @conciv/protocol@0.0.22
  - @conciv/embed@0.0.22
  - @conciv/core@0.0.22
  - @conciv/cli@0.0.22
  - @conciv/extension-compiler@0.0.22
  - @conciv/extension@0.0.22

## 0.0.21

### Patch Changes

- [#656](https://github.com/conciv-dev/conciv/pull/656) [`0fdd3ef`](https://github.com/conciv-dev/conciv/commit/0fdd3ef2374de79178daa70d5987bc43673684ce) Thanks [@omridevk](https://github.com/omridevk)! - The plugin no longer rewrites `@conciv/*` dist imports to workspace source: hosts always get dist. The `CONCIV_E2E` switch is gone.

- [#627](https://github.com/conciv-dev/conciv/pull/627) [`f727664`](https://github.com/conciv-dev/conciv/commit/f727664be45006d5bf2acf7234bbbbaa3f647ac7) Thanks [@omridevk](https://github.com/omridevk)! - The widget now mounts in Vite hosts that install conciv from npm, without the host listing `lru_map` or `partial-json` in `optimizeDeps.include`.

- [#625](https://github.com/conciv-dev/conciv/pull/625) [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c) Thanks [@omridevk](https://github.com/omridevk)! - Boot the engine reliably under `next dev --webpack`: instrumentation.ts now compiles in the first server build, so a slow dev watcher scan can no longer make Next skip `register()` for the whole process.

- [#660](https://github.com/conciv-dev/conciv/pull/660) [`c202114`](https://github.com/conciv-dev/conciv/commit/c20211415e977a79d08af5f083b9bc28cbb56900) Thanks [@omridevk](https://github.com/omridevk)! - Drop the `vite-plugin` keyword from the internal plugin package so plugin registries list `@conciv/it`, the package users install.

- [#649](https://github.com/conciv-dev/conciv/pull/649) [`c90309e`](https://github.com/conciv-dev/conciv/commit/c90309e4bf79f3576555ec3feb2e6af8a4f563dd) Thanks [@omridevk](https://github.com/omridevk)! - Run conciv inside the Vite DevTools dock when DevTools is enabled. Without DevTools, the floating widget is unchanged.

  One extension's client module failing to load (a content blocker, a network error, a throwing module) no longer stops the widget from mounting: the other extensions load, and a toast names the extension that failed. The recorder loads rrweb lazily, so a content blocker that blocks rrweb no longer takes the widget down; the Recorder tab explains the block instead.

  The conciv dock pane is inert while another Vite DevTools entry is open, so the hidden chat no longer sits in the tab order or under the other entry's controls.

  conciv follows the color scheme of the element it is mounted in, walking up from its mount point (across shadow roots) instead of reading only the page root, so in the Vite DevTools dock it matches the DevTools color mode.

  The pop-out window survives a page reload: conciv re-attaches to the still-open window. When the window is gone or the browser blocks it, the chat returns inline for the same session with a "Pop out again" action, and closing the window returns to the inline chat. While popped out, the Vite DevTools dock shows "Chat is popped out" with a "Bring it back" action instead of an empty panel.

  rrweb-snapshot loads lazily: a content blocker no longer blanks the widget. Element capture falls back to a descriptor, a toast names the likely blocker, and element previews explain the block in place.

  The Vite plugin pre-bundles the modules the widget loads late (highlighter languages, rrweb, the Recorder player and others), so a first open on a cold cache no longer re-optimizes and reloads the page.

  The dock keeps its settings when the host page already carries a conciv-widget meta tag, and closing a pop-out started from the quick terminal returns to a visible inline chat. A blocked replay player no longer hides a working recording: the Recorder tab keeps its actions and shows a replay notice.

  The quick terminal shortcut brings the conciv dock entry forward when the dock is closed or another entry is selected, so the terminal is never opened behind a hidden panel.

  Panel `open` and `toggle` commands bring the conciv dock entry forward when the dock is closed or another entry is selected.

  Pop out opens its window inside the click, so browsers that only allow popups during a user gesture no longer block it. A blocked pop-out shows the "could not be reopened" notice with a Pop out again action.

  A recording start that times out while rrweb is still loading no longer starts capturing once rrweb arrives, and a later start still records.

  The Vite plugin recognizes conciv meta tags in any quoting or spacing, so a pre-injected fragment keeps its settings.

- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0fdd3ef`](https://github.com/conciv-dev/conciv/commit/0fdd3ef2374de79178daa70d5987bc43673684ce), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`f0ffc0b`](https://github.com/conciv-dev/conciv/commit/f0ffc0b076d88de8ebd93655d980629e29889937), [`af69127`](https://github.com/conciv-dev/conciv/commit/af69127fb97de0d722e206a6d31471a0569fdf02), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95), [`8d69e53`](https://github.com/conciv-dev/conciv/commit/8d69e53ab3e7c4856db980bb5656eda4fddac9ed), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`c06f93f`](https://github.com/conciv-dev/conciv/commit/c06f93f3978414d74829f203c898d258ccde1a1f), [`15c2fcb`](https://github.com/conciv-dev/conciv/commit/15c2fcb875fae4ffa552671380b7227a1e790d6f), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`4465b85`](https://github.com/conciv-dev/conciv/commit/4465b854e45ce6553eebd6547e2d0be49157f71e)]:
  - @conciv/core@0.0.21
  - @conciv/protocol@0.0.21
  - @conciv/extension-compiler@0.0.21
  - @conciv/embed@0.0.21
  - @conciv/cli@0.0.21
  - @conciv/extension@0.0.21

## 0.0.20

### Patch Changes

- [#613](https://github.com/conciv-dev/conciv/pull/613) [`9e9e683`](https://github.com/conciv-dev/conciv/commit/9e9e683fb48ab3fdd9ae41de86dafff4fb3fa28d) Thanks [@omridevk](https://github.com/omridevk)! - The Next.js entry (`@conciv/it/plugin/nextjs`, `@conciv/plugin/nextjs`) now resolves to a Node-free `register` under the `edge-light` export condition, so the Edge build of `instrumentation.ts` no longer pulls in `node:fs`/`process.cwd` and Next stops printing "not supported in the Edge Runtime" warnings. No import path changes.

- [#591](https://github.com/conciv-dev/conciv/pull/591) [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6) Thanks [@omridevk](https://github.com/omridevk)! - Host marker strings renamed off the dead `pw` prefix to `conciv`: the `pw-widget` / `pw-api-base` meta tags, every `data-pw-*` attribute, the `pw-chat-panel` id (and its `aria-controls` references), the `pw-session-` id prefix, the `pw-conciv-model` localStorage key (now `conciv-model`, saved preference intentionally dropped), `pw-grab-pseudo-` capture-clone classes, and the `.pw-fab-*` / `.pw-rig-*` mascot rig classes. Breaking for any host or tooling still targeting the old meta names, data attributes, ids, or storage key.
- Updated dependencies [[`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`005ce1c`](https://github.com/conciv-dev/conciv/commit/005ce1c0cb34b5b0ce662d9497272144e8a6d10c), [`9e20b2a`](https://github.com/conciv-dev/conciv/commit/9e20b2a3c3eb225216daf54f5341cd66e167a650), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`258fe9a`](https://github.com/conciv-dev/conciv/commit/258fe9a39f93eaf2f258f0f87efa9b2e3878fa01), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`4e1e430`](https://github.com/conciv-dev/conciv/commit/4e1e430dd7e67e8f817d0bcfc0c3132782537767), [`d796d1e`](https://github.com/conciv-dev/conciv/commit/d796d1e8a08f86ed9593cadff9748b5d57772cf2), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`6020d52`](https://github.com/conciv-dev/conciv/commit/6020d52d60bc6c824118d10787d557beeac1fc3f), [`f3bea6c`](https://github.com/conciv-dev/conciv/commit/f3bea6c3656a282dc193b86f9835bfa80ba135d7), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`84905d3`](https://github.com/conciv-dev/conciv/commit/84905d36e10b9cbc0dd54736e3f8c6e84b38e3b6), [`423f50d`](https://github.com/conciv-dev/conciv/commit/423f50d1c636dc0ac1be88748a95327e130949af), [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`c5015fe`](https://github.com/conciv-dev/conciv/commit/c5015fe3ec89327975fabf814f0d6eaadcada1fb), [`d03af7f`](https://github.com/conciv-dev/conciv/commit/d03af7f7cac4267f9b573f0cadcd69e74c019f89), [`2991888`](https://github.com/conciv-dev/conciv/commit/2991888b1c4baf1d290d39330faf23084959632e), [`9e20b2a`](https://github.com/conciv-dev/conciv/commit/9e20b2a3c3eb225216daf54f5341cd66e167a650), [`413bc87`](https://github.com/conciv-dev/conciv/commit/413bc87ccfd2cc445f0a5b05e039a92d952c29b9), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`04a35ca`](https://github.com/conciv-dev/conciv/commit/04a35cafed78ae6f03b509d4d8d74d545c574923), [`0537a17`](https://github.com/conciv-dev/conciv/commit/0537a17c89c2f052220b71baa95e2552f5a17eff), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`163cfd5`](https://github.com/conciv-dev/conciv/commit/163cfd5f844a2c8b97a97c8ceb1440076ff69a21), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`2991888`](https://github.com/conciv-dev/conciv/commit/2991888b1c4baf1d290d39330faf23084959632e), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`70614e8`](https://github.com/conciv-dev/conciv/commit/70614e8f2b415145bfb8f9198bd8818307d15478), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`7a95ab8`](https://github.com/conciv-dev/conciv/commit/7a95ab8e0cf959d75fb0b47977325b02d90c4718), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`cef1f05`](https://github.com/conciv-dev/conciv/commit/cef1f0553911fcf02e3db8660b48d540062966ad), [`152a7bd`](https://github.com/conciv-dev/conciv/commit/152a7bdf788399e72e20ddb3c780217940faa632), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6)]:
  - @conciv/core@0.0.20
  - @conciv/protocol@0.0.20
  - @conciv/extension@0.0.20
  - @conciv/cli@0.0.20
  - @conciv/embed@0.0.20
  - @conciv/extension-compiler@0.0.20

## 0.0.19

### Patch Changes

- [#357](https://github.com/conciv-dev/conciv/pull/357) [`c6aa92c`](https://github.com/conciv-dev/conciv/commit/c6aa92c53847d9f811eafebf414492335864955b) Thanks [@omridevk](https://github.com/omridevk)! - The configured engine port is a preference on the Vite dev server: when it is already taken the
  engine falls back to a free port, logs the address it actually bound, and the page is stamped with
  that address, so two dev servers can run at once instead of the second dying on EADDRINUSE. The
  Next.js integration and the generic webpack/rspack plugin still bind their port exactly, because
  both hand the client a fixed address before the engine ever boots.
- Updated dependencies [[`c6aa92c`](https://github.com/conciv-dev/conciv/commit/c6aa92c53847d9f811eafebf414492335864955b), [`78977f0`](https://github.com/conciv-dev/conciv/commit/78977f03328d09224602b6162b9178c48b4e04a9), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`b329b47`](https://github.com/conciv-dev/conciv/commit/b329b47b889201093c5de042f389eac297caa249), [`af72648`](https://github.com/conciv-dev/conciv/commit/af72648838bd828477102f87f78d457d17ebec41)]:
  - @conciv/core@0.0.19
  - @conciv/embed@0.0.19
  - @conciv/extension@0.0.19
  - @conciv/cli@0.0.19
  - @conciv/extension-compiler@0.0.19
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`e93318a`](https://github.com/conciv-dev/conciv/commit/e93318a331d3a7b695c08eb77d7c0b67c5ba68b0), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`1e1b01b`](https://github.com/conciv-dev/conciv/commit/1e1b01b36c3b5c282d51a6689b8a18810a330fc2), [`47c5423`](https://github.com/conciv-dev/conciv/commit/47c5423107f588c9bf5cc94faa5348fc769ef89e), [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8), [`05142ed`](https://github.com/conciv-dev/conciv/commit/05142ed5d738309686e35d9231139229b07bd408)]:
  - @conciv/core@0.0.18
  - @conciv/cli@0.0.18
  - @conciv/protocol@0.0.18
  - @conciv/extension@0.0.18
  - @conciv/embed@0.0.18
  - @conciv/extension-compiler@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies [[`0d2ddf6`](https://github.com/conciv-dev/conciv/commit/0d2ddf6cb63baa58095a70faf9783c12a895928c)]:
  - @conciv/embed@0.0.17
  - @conciv/cli@0.0.17
  - @conciv/core@0.0.17
  - @conciv/extension@0.0.17
  - @conciv/extension-compiler@0.0.17
  - @conciv/protocol@0.0.17

## 0.0.16

### Patch Changes

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - First-party extensions are folder-installable: `pnpm add @conciv/extension-<name>`, drop a one-line re-export in `conciv/extensions/<name>.tsx`, and both halves load on every supported framework.

  Every published extension (tanstack, terminal, test-runner, whiteboard, recorder) ships per-environment conditional exports: the `browser` condition resolves `dist/client.js`, the `import` condition resolves `dist/server.js`, with per-condition `types`, plus an explicit `./server` subpath. `@conciv/extension-compiler` gains the shared discovery primitives (`@conciv/extension-compiler/dedupe`: provenance-carrying `dedupeExtensions`, `toSortedEntries`, `isExtension`) used by both the server loader and every client path; `loadServerExtensions` now matches files exactly (no directories, no `.d.ts`), treats a missing default export as fatal, and reports every dropped entry with its source and reason. `listExtensionFiles` is the single fs listing primitive.

  Next.js support (Turbopack and `next dev --webpack`, current GA line): `withConciv` generates an app-local `.conciv/extensions-client.gen.tsx` entry (knitwork static imports, idempotent) and wires it to the widget via `turbopack.resolveAlias`/webpack alias as `@conciv/app-extensions`; `register()` runs a chokidar watcher that regenerates the entry live on add/remove. The widget stays lazy (dynamic imports behind the dev-only guard), the engine register entrypoints are stubbed out of Next edge-runtime compilations, and the generated client module now threads a resolved dedupe entry so dist-mode consumers boot. The tanstack extension renders a mount-time composer chip as its client-active surface and degrades gracefully in apps without a TanStack router.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`1019e21`](https://github.com/conciv-dev/conciv/commit/1019e213fc99b84d0931a50cffa2cd602fd31e0e), [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`7627eba`](https://github.com/conciv-dev/conciv/commit/7627eba4ffaddd6e85289724759f41d75b5c2e7b)]:
  - @conciv/extension@0.0.16
  - @conciv/extension-compiler@0.0.16
  - @conciv/protocol@0.0.16
  - @conciv/embed@0.0.16
  - @conciv/core@0.0.16
  - @conciv/cli@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/embed@0.0.15
  - @conciv/cli@0.0.15
  - @conciv/core@0.0.15
  - @conciv/extension@0.0.15
  - @conciv/extension-compiler@0.0.15
  - @conciv/protocol@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies [[`8370fd9`](https://github.com/conciv-dev/conciv/commit/8370fd9ef1156296236d4a9e22f5453ca817d9f3)]:
  - @conciv/extension@0.0.14
  - @conciv/core@0.0.14
  - @conciv/embed@0.0.14
  - @conciv/extension-compiler@0.0.14
  - @conciv/cli@0.0.14
  - @conciv/protocol@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c), [`5db2ac5`](https://github.com/conciv-dev/conciv/commit/5db2ac5a8e7d49f2966cbbaf6718483f5837f759)]:
  - @conciv/protocol@0.0.13
  - @conciv/core@0.0.13
  - @conciv/embed@0.0.13
  - @conciv/cli@0.0.13
  - @conciv/extension@0.0.13
  - @conciv/extension-compiler@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies [[`450fc46`](https://github.com/conciv-dev/conciv/commit/450fc463b7bce804ac1c75e3c6a398d1b9f9491e)]:
  - @conciv/core@0.0.12
  - @conciv/cli@0.0.12
  - @conciv/embed@0.0.12
  - @conciv/extension@0.0.12
  - @conciv/extension-compiler@0.0.12
  - @conciv/protocol@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/embed@0.0.11
  - @conciv/cli@0.0.11
  - @conciv/core@0.0.11
  - @conciv/extension@0.0.11
  - @conciv/extension-compiler@0.0.11
  - @conciv/protocol@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/cli@0.0.10
  - @conciv/core@0.0.10
  - @conciv/embed@0.0.10
  - @conciv/extension@0.0.10
  - @conciv/extension-compiler@0.0.10
  - @conciv/protocol@0.0.10

## 0.0.9

### Patch Changes

- [`c25f76d`](https://github.com/conciv-dev/conciv/commit/c25f76d9cc208c21b15e4444491aa073b680e195) Thanks [@omridevk](https://github.com/omridevk)! - The dist widget now boots cleanly in real consumer vite apps: the plugin pre-warms the widget module graph (`server.warmup`) so a cold dep-optimizer sees every widget dependency before its first run instead of re-optimizing mid-flight (504 Outdated Optimize Dep, full reloads); `optimizeDeps.exclude` yields to another plugin's `include` (vite-plugin-solid hosts like solid-start no longer crash with "entry point solid-js cannot be marked as external"); Solid singleton dedupe/exclude ids apply only where resolvable from the app root, fixing vite 7 hosts and React hosts whose optimized deps embed Solid (TanStack devtools).

- [#60](https://github.com/conciv-dev/conciv/pull/60) [`18c9521`](https://github.com/conciv-dev/conciv/commit/18c9521886d3f7ea4054ae0ae638494312dc80b8) Thanks [@omridevk](https://github.com/omridevk)! - The vite plugin serves workspace `@conciv` browser packages from src in dev (resolveId src probe + solid compile); published manifests and tarballs unchanged.

- Updated dependencies [[`c25f76d`](https://github.com/conciv-dev/conciv/commit/c25f76d9cc208c21b15e4444491aa073b680e195)]:
  - @conciv/extension-compiler@0.0.9
  - @conciv/cli@0.0.9
  - @conciv/core@0.0.9
  - @conciv/embed@0.0.9
  - @conciv/extension@0.0.9
  - @conciv/protocol@0.0.9

## 0.0.8

### Patch Changes

- [#55](https://github.com/conciv-dev/conciv/pull/55) [`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf) Thanks [@omridevk](https://github.com/omridevk)! - Client/server now talk over a single typed oRPC contract (`@conciv/contract`), with persistence extracted into `@conciv/db`; the remaining bespoke HTTP surface is limited to the MCP route and the terminal WebSocket.

  The server stack moved from h3/srvx to hono behind one `@conciv/serve` wrapper for `@hono/node-server`, and the extension bundler was split out of the vite plugin into a standalone `@conciv/extension-compiler`.

  The terminal gains a narrative activity rail (a resizable, open-by-default timeline of session activity), and the pty now spawns at the attaching client's fitted size instead of bouncing through a fixed geometry on every attach.

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf), [`fce6e80`](https://github.com/conciv-dev/conciv/commit/fce6e80e818460ca950b08ac75bccd94a1a72931)]:
  - @conciv/core@0.0.8
  - @conciv/extension-compiler@0.0.8
  - @conciv/cli@0.0.8
  - @conciv/embed@0.0.8
  - @conciv/extension@0.0.8
  - @conciv/protocol@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies [[`bbdfc69`](https://github.com/conciv-dev/conciv/commit/bbdfc6940e7c4a45d4a20fb04e12d8e407154bfb)]:
  - @conciv/core@0.0.7
  - @conciv/widget@0.0.7
  - @conciv/cli@0.0.7
  - @conciv/extension@0.0.7
  - @conciv/protocol@0.0.7

## 0.0.6

### Patch Changes

- [#12](https://github.com/conciv-dev/conciv/pull/12) [`6a30c91`](https://github.com/conciv-dev/conciv/commit/6a30c91c76a4ff1df456a14eca0f9d4a78744a57) Thanks [@omridevk](https://github.com/omridevk)! - Fix a crash on Next.js with the webpack bundler introduced by the Turbopack env fix. `withConciv` set the engine port via `process.env.NEXT_PUBLIC_CONCIV_PORT ??= ...`. Bundlers statically replace literal `process.env.NEXT_PUBLIC_*` member expressions with their values at build time (including in the instrumentation chunk), so webpack turned the assignment target into a string literal (`"41700" ??= ...`), a `SyntaxError: Invalid left-hand side in assignment` that crashed the instrumentation hook and took down the dev server (every route 404'd / connection refused). Turbopack didn't apply the replacement in that context, so it only surfaced under `next dev --webpack`. Assign through a computed key (`process.env[key] = ...`) instead, which bundlers don't inline. Verified: the widget now mounts on the real homepage under both Turbopack and webpack.

- Updated dependencies []:
  - @conciv/cli@0.0.6
  - @conciv/core@0.0.6
  - @conciv/extension@0.0.6
  - @conciv/protocol@0.0.6
  - @conciv/widget@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- [#10](https://github.com/conciv-dev/conciv/pull/10) [`d9e01e2`](https://github.com/conciv-dev/conciv/commit/d9e01e2d1b6bc5cc959274a7104cc66cd02c23fe) Thanks [@omridevk](https://github.com/omridevk)! - Mount the dev-agent widget on Next.js with Turbopack (the default bundler in Next 16). `withConciv` shipped the engine port to the client (`NEXT_PUBLIC_CONCIV_PORT`) and the server (`CONCIV_OPTIONS`) exclusively through the `next.config` `env` key. Turbopack does not apply that key to the instrumentation bundles, so the client's `process.env.NEXT_PUBLIC_CONCIV_PORT` stayed an un-inlined runtime lookup (undefined → the widget's mount guard never fired) and `register` never received `CONCIV_OPTIONS` (so the engine bound a random port instead of the configured one). `withConciv` now also sets these on `process.env` at config-evaluation time, which runs in Node before Turbopack compiles, so Turbopack inlines the `NEXT_PUBLIC_` value and `register` reads the options at runtime. Uses `??=`, so an explicit environment override still wins. The `env` key is kept for webpack. Zero config.

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/cli@0.0.5
  - @conciv/core@0.0.5
  - @conciv/extension@0.0.5
  - @conciv/protocol@0.0.5
  - @conciv/widget@0.0.5

## 0.0.4

### Patch Changes

- [#8](https://github.com/conciv-dev/conciv/pull/8) [`9480816`](https://github.com/conciv-dev/conciv/commit/948081665656ee4fc149701c3206a17402b47299) Thanks [@omridevk](https://github.com/omridevk)! - Force-optimize the widget's CommonJS dependencies so the widget mounts on Vite 8 dev servers. The Vite plugin excludes `@conciv/widget`/`@conciv/extension` from `optimizeDeps` (to keep a single shared `solid-js` runtime between the widget and dynamically-compiled extensions), which also stops Vite's scanner from crawling their transitive deps. As a result the widget's CJS leaves (`partial-json` via `@tanstack/ai`, and `js-beautify` via `@conciv/ui-kit-chat-tools`) were served raw, and cjs-module-lexer failed to detect their named/default exports (`partial-json` initializes exports with a chained `exports.a = … = exports.parse = void 0` the lexer can't read). The extensions module threw at import time and the widget never mounted, despite `/@conciv/extensions.js` serving and the engine booting. The plugin now adds those CJS leaves to `optimizeDeps.include` (gated on `@conciv/widget` being installed), so esbuild pre-bundles them with correct interop. This is Vite-dev-specific; webpack/rspack/esbuild/rollup bundle CJS natively and are unaffected. Zero config.

- Updated dependencies []:
  - @conciv/cli@0.0.4
  - @conciv/core@0.0.4
  - @conciv/extension@0.0.4
  - @conciv/protocol@0.0.4
  - @conciv/widget@0.0.4

## 0.0.3

### Patch Changes

- [#5](https://github.com/conciv-dev/conciv/pull/5) [`2d67cc9`](https://github.com/conciv-dev/conciv/commit/2d67cc9785da2274f503c77c839777cc30147e34) Thanks [@omridevk](https://github.com/omridevk)! - Mount the dev-agent widget on SSR stacks (TanStack Start, with or without the nitro server layer) via the Vite module graph. Previously the widget was delivered by editing the served HTML (`transformIndexHtml` + a response-buffering middleware), which SSR hosts bypass: the engine booted and `/@conciv/extensions.js` served, but the widget never mounted. It now imports the extensions module from the framework's client entry and carries the engine origin in that module (`window.__CONCIV_API_BASE__`), so it works regardless of who renders the document. Zero config.

- Updated dependencies []:
  - @conciv/cli@0.0.3
  - @conciv/core@0.0.3
  - @conciv/extension@0.0.3
  - @conciv/protocol@0.0.3
  - @conciv/widget@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/cli@0.0.2
  - @conciv/core@0.0.2
  - @conciv/extension@0.0.2
  - @conciv/protocol@0.0.2
  - @conciv/widget@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/cli@0.0.1
  - @conciv/core@0.0.1
  - @conciv/extension@0.0.1
  - @conciv/protocol@0.0.1
  - @conciv/widget@0.0.1
