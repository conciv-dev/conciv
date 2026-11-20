# @conciv/builtin-plugins

Private. The browser parts of conciv's built-in plugins, given to the widget from `./renderer` (as
`@opencode/gui-plugins/renderer` gives opencode's). The embed bundles it into the published widget.

## terminal

The session's CLI in a terminal (built-in id `terminal`, a pinned Terminal tab in the session's pane): listed for a
session whose harness has a terminal, the CLI started only when the tab first opens (the xterm surface loads then
too), replayed after a reload, with a toolbar at the top of the panel that picks the CLI model and starts a new terminal, both locked while
the CLI is busy. Escape with focus in the terminal interrupts a busy CLI; keys pressed on the host page stay there.
