# @conciv/solid-stick-to-bottom

## 0.0.19

### Patch Changes

- [#437](https://github.com/conciv-dev/conciv/pull/437) [`e628f93`](https://github.com/conciv-dev/conciv/commit/e628f93ed9d4067c6ad164a2af0369e543abd62f) Thanks [@omridevk](https://github.com/omridevk)! - Chat transcript scrolling is now owned by @conciv/solid-stick-to-bottom, a faithful Solid port of use-stick-to-bottom: the viewport only moves for pinned streaming follow, the scroll-to-bottom button, and sending a message. Chain-of-thought/reasoning cards auto-close once when their own content completes, and user toggles after that are permanent. Tool approval force-opens the tool card once. User card toggles never shift the viewport. Chain content defaults to grow, with a `grow` prop for the capped pane.
