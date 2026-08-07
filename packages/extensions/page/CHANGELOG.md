# @conciv/extension-page

## 0.0.18

### Patch Changes

- [#284](https://github.com/conciv-dev/conciv/pull/284) [`42a0ad0`](https://github.com/conciv-dev/conciv/commit/42a0ad0273cbf8b1b48d197c363f4f77da75dc69) Thanks [@omridevk](https://github.com/omridevk)! - Page is a built-in extension end to end: every page verb is a `defineTool().client(body)` declaration dispatched by name through the registry over the final `{requestId, name, input}` wire envelope. The page-only vocabulary (kind enum, field-bag, `page.run`, ext verbs, `PageVerbMap`) is gone, the CLI derives `conciv page`/`conciv react` from the live catalog, mutating page calls prompt for approval on every surface, and the TanStack extension reaches its own browser verbs through the same registry path.

- [#260](https://github.com/conciv-dev/conciv/pull/260) [`32b49c3`](https://github.com/conciv-dev/conciv/commit/32b49c36a2c62210391449a1b2f01095d8ece57f) Thanks [@omridevk](https://github.com/omridevk)! - Add `@conciv/extension-page`, the home for the page capability as a built-in extension. It joins the
  fixed `@conciv/*` set with its declaration split into a server half and a browser half; the page
  verbs and their browser bodies move in over the following phases. `@conciv/page` is unchanged and
  stays the browser-primitives library those bodies will call into.
- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`1e1b01b`](https://github.com/conciv-dev/conciv/commit/1e1b01b36c3b5c282d51a6689b8a18810a330fc2), [`3077460`](https://github.com/conciv-dev/conciv/commit/307746013f8dbdc03e1cd98673aaa4e574b81342)]:
  - @conciv/protocol@0.0.18
  - @conciv/extension@0.0.18
  - @conciv/page@0.0.18
