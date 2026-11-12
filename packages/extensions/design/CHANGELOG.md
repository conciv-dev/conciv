# @conciv/extension-design

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
- Updated dependencies [[`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`042f5f1`](https://github.com/conciv-dev/conciv/commit/042f5f1dc38120382a7f2f9e780733439b1cfd5b), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`65fd8fe`](https://github.com/conciv-dev/conciv/commit/65fd8fe0b0f4d7431a82ccd51da0b6f3d5662eae), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`ba22a7d`](https://github.com/conciv-dev/conciv/commit/ba22a7dd30703632d5af0ac6ca854cc257cda70f), [`ebcb3ac`](https://github.com/conciv-dev/conciv/commit/ebcb3ac7177c5854a31a9480e31aaaf769b18f24), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`c0686d5`](https://github.com/conciv-dev/conciv/commit/c0686d5a73cd6982f749209d7acd743df9e30ca3)]:
  - @conciv/protocol@0.0.23
  - @conciv/extension@0.0.23
  - @conciv/extension-page@0.0.23

## 0.0.22

### Patch Changes

- [#683](https://github.com/conciv-dev/conciv/pull/683) [`2a25287`](https://github.com/conciv-dev/conciv/commit/2a2528793ff95ca0959cd3183caf8b0bdfbcc90a) Thanks [@omridevk](https://github.com/omridevk)! - `design_diff` reads the target's text with OCR and compares text as text: identical text drawn by another renderer no longer counts as a pixel difference, and a changed string is a `text` delta on the component that paints it. The x-ray page is redesigned around the component list and the property table.

- [#747](https://github.com/conciv-dev/conciv/pull/747) [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8) Thanks [@omridevk](https://github.com/omridevk)! - Packages now report their real release version, for future migrations; a version difference never breaks anything. `conciv` carries it as its `meta.version`, the Claude Code connect plugin is stamped with it instead of `0.0.0`, and every engine response carries an `x-conciv-version` header. Node rpc clients send their own version in the same header; browser requests send no new header, so a newer widget still reaches an older engine. When the engine is older than the widget (or predates versions), the panel shows a notice asking to update the @conciv packages. `conciv init` now also runs `claude plugin update`, so an install recorded at an earlier release moves onto the current one.

- [#764](https://github.com/conciv-dev/conciv/pull/764) [`bd41ba7`](https://github.com/conciv-dev/conciv/commit/bd41ba79644530696274de010e230b6adcdf30b1) Thanks [@omridevk](https://github.com/omridevk)! - Page screenshots and design captures leave out every piece of conciv UI on the page (the widget, the effects layer and its style tags), not only the widget. The list lives in one place, `CONCIV_UI_SELECTOR` in `@conciv/extension`, and the recorder, element grabs and both capture paths share it.

  Captures also keep text that sits on one line on one line. In Firefox, snapdom drew a link like "Home" on a page with `overflow-wrap: anywhere` as "Hom / e": its one-line guard was undone by its own tag reset. A capture plugin now carries that guard down to every element inside the pinned box.

  Page tools never act on an element inside conciv's effects layer, the same as the widget, and the grab toast carries its own `data-conciv-toast` marker so it stays out of captures too.

  `page_screenshot` takes an optional `exclude` list of CSS selectors for host-page elements to leave out, such as a devtools button. A selector the page cannot read is skipped, the capture still runs, and the result lists it under `warnings`.

  The capture plugins moved from the `@conciv/extension-page/body-margins` subpath to `@conciv/extension-page/capture-plugins`; the old subpath is gone.

- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`9003236`](https://github.com/conciv-dev/conciv/commit/90032366211b3ab568a5c92335adce4be6e097a7), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`bd41ba7`](https://github.com/conciv-dev/conciv/commit/bd41ba79644530696274de010e230b6adcdf30b1), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09), [`26576dc`](https://github.com/conciv-dev/conciv/commit/26576dc0dd99d34892ba238a6d0c550c40ab312f)]:
  - @conciv/protocol@0.0.22
  - @conciv/extension@0.0.22
  - @conciv/extension-page@0.0.22

## 0.0.21

### Patch Changes

- [#650](https://github.com/conciv-dev/conciv/pull/650) [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee) Thanks [@omridevk](https://github.com/omridevk)! - New built-in design extension, mounted by `@conciv/it`: register a design image as the target of a route at a width, then `conciv tools design diff` compares the live page with it and ranks the components that differ, with the deltas and the source that sets them. `conciv tools design status` says when every registered width matches. The agent guide written by `conciv init` describes the loop.

- [#678](https://github.com/conciv-dev/conciv/pull/678) [`62f5429`](https://github.com/conciv-dev/conciv/commit/62f5429329a717535efe3a9ec6c61f00cb2f1a61) Thanks [@omridevk](https://github.com/omridevk)! - The x-ray page now opens targets whose id is all digits and keeps numeric filter queries from the url, instead of reporting that no design target exists.
- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`f0ffc0b`](https://github.com/conciv-dev/conciv/commit/f0ffc0b076d88de8ebd93655d980629e29889937), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`5b93081`](https://github.com/conciv-dev/conciv/commit/5b930812c5e4ff718da8799d3fddd1429dc6c7a3), [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1)]:
  - @conciv/protocol@0.0.21
  - @conciv/extension-page@0.0.21
  - @conciv/extension@0.0.21
