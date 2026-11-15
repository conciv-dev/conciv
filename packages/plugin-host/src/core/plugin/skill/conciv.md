# conciv

Use this guide as the starting point for work involving conciv itself. It covers the core concepts needed to set
conciv up in an app, use the widget, pick a harness, and extend conciv.

Full documentation is available at <https://conciv.dev/docs>. This overview is only an index of core concepts.
Before answering a question about a topic below, fetch the URL named in that section and use the full page as the
source of truth. Follow links from that page when the question needs more detail. Fetch <https://conciv.dev/docs>
first when you need to discover the relevant documentation page.

A machine-readable documentation index is available at <https://conciv.dev/llms.txt>, and the full text of the
documentation at <https://conciv.dev/llms-full.txt>.

Do not answer a conciv question from memory when a page below covers it. If the documentation is missing or
contradicts what you see in the project, say so instead of guessing.

## [What conciv is](https://conciv.dev/docs)

conciv puts a coding agent inside a running app: a widget in the page with chat, control of the live page, and
tests that run and report in the thread. It is added through a build plugin and runs in development only. For what
it is and what it is not, fetch the [introduction](https://conciv.dev/docs).

## [How it works](https://conciv.dev/docs/how-it-works)

For the pieces behind the widget (the build plugin, the engine that runs beside the dev server, the widget in the
page, the agent CLI) and how one turn flows through them, fetch
[How it works](https://conciv.dev/docs/how-it-works). For what each `@conciv` package is and which ones an app
installs, fetch [Packages](https://conciv.dev/docs/packages).

## [Quick start](https://conciv.dev/docs/quick-start)

For installing conciv in an app, fetch the [Quick start](https://conciv.dev/docs/quick-start). One command,
`conciv init`, wires an app; the page also links the guide for each bundler:
[Vite](https://conciv.dev/docs/quick-start/vite), [Next.js](https://conciv.dev/docs/quick-start/nextjs),
[webpack](https://conciv.dev/docs/quick-start/webpack), [Rspack](https://conciv.dev/docs/quick-start/rspack),
[Rollup](https://conciv.dev/docs/quick-start/rollup), [esbuild](https://conciv.dev/docs/quick-start/esbuild), and
a native [iOS](https://conciv.dev/docs/quick-start/ios) app in the simulator. Fetch the page for the bundler in
front of you; do not adapt one bundler's steps to another.

## [Configuration](https://conciv.dev/docs/configuration)

For the `conciv()` options and the common ways to set them, fetch
[Configuration](https://conciv.dev/docs/configuration).

## [Harnesses](https://conciv.dev/docs/harnesses)

The harness is the agent CLI behind the chat. For which harnesses exist, how to pick one and what each supports,
fetch [Harnesses](https://conciv.dev/docs/harnesses).

## [Using the widget](https://conciv.dev/docs/usage)

For a tour of the widget, fetch [Usage](https://conciv.dev/docs/usage). Its pages:
[Chat](https://conciv.dev/docs/usage/chat), [Page control](https://conciv.dev/docs/usage/page-control) (the agent
reads and drives the live page, then persists to source), [Live tests](https://conciv.dev/docs/usage/live-tests),
[Approvals](https://conciv.dev/docs/usage/approvals), the
[Quick Terminal](https://conciv.dev/docs/usage/quick-terminal), and the
[Whiteboard](https://conciv.dev/docs/usage/whiteboard).

## [Test runners](https://conciv.dev/docs/test-runners)

For the runner behind the test cards and how to pick one, fetch
[Test runners](https://conciv.dev/docs/test-runners).

## [CLI](https://conciv.dev/docs/cli)

The `conciv` command lets an agent, or a person, drive the app from a terminal. For its commands and output, fetch
the [CLI guide](https://conciv.dev/docs/cli). For connecting a coding agent that runs outside the widget, fetch
[Connect your agents](https://conciv.dev/docs/quick-start/agents).

## [Extending conciv](https://conciv.dev/docs/extending)

For adding tools and widget UI of your own, fetch [Extending](https://conciv.dev/docs/extending) and the page it
links for the task at hand. Read the page before writing code: the way conciv is extended has changed between
versions, and the documentation is the source of truth for the installed one.

## [Troubleshooting](https://conciv.dev/docs/troubleshooting)

When the widget does not appear, does not connect, or an approval never resolves, fetch
[Troubleshooting](https://conciv.dev/docs/troubleshooting) before changing code. If the problem is a defect in
conciv, use the `report` skill.

## [Examples](https://conciv.dev/docs/examples)

For runnable apps wired with conciv, fetch [Examples](https://conciv.dev/docs/examples).
