# @conciv/builtin-plugins

Private. The browser parts of conciv's built-in plugins, given to the widget from `./renderer` (as
`@opencode/gui-plugins/renderer` gives opencode's). The embed bundles it into the published widget.

## page

The browser part of the page plugin (built-in id `page`): it provides the contracts other plugins read, `Page` and
`ReactTree` (`@conciv/plugin/experimental/page`). `Page.symbolicate` calls the routed session's engine through the
RPC contract `experimental.page` (`@conciv/plugin-page/rpc`), whose engine part core lists as `conciv.page`; it
rejects when no session is routed. `Page.toast` is `@conciv/page`'s toast, and `Page.capture` excludes conciv's own
UI and carries the snapdom plugins that keep body margins and one-line text in a capture (`page/capture-plugins.ts`).
`ReactTree` is `@conciv/page`'s React bridge, its `locate` refs kept per provider.
