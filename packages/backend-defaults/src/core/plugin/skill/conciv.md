# conciv

Use this guide as the starting point for work involving conciv itself. It covers the core concepts needed to set
conciv up in an app, use the widget, pick a harness, and add plugins.

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
tests that run and report in the thread. It is added from your bundler config and runs in development only. For what
it is and what it is not, fetch the [introduction](https://conciv.dev/docs).

## [How it works](https://conciv.dev/docs/how-it-works)

For the pieces behind the widget (the build integration, the engine that runs beside the dev server, the widget in the
page, the agent CLI) and how one turn flows through them, fetch
[How it works](https://conciv.dev/docs/how-it-works). For what each `@conciv` package is and which ones an app
installs, fetch [Packages](https://conciv.dev/docs/packages).

## [Quick start](https://conciv.dev/docs/quick-start)

For installing conciv in an app, fetch the [Quick start](https://conciv.dev/docs/quick-start). One command,
`conciv init`, wires an app; the page also links the guide for each bundler:
[Vite](https://conciv.dev/docs/quick-start/vite), [Next.js](https://conciv.dev/docs/quick-start/nextjs),
[webpack](https://conciv.dev/docs/quick-start/webpack), [Rspack](https://conciv.dev/docs/quick-start/rspack),
[Rollup](https://conciv.dev/docs/quick-start/rollup), [esbuild](https://conciv.dev/docs/quick-start/esbuild), and a native
[iOS](https://conciv.dev/docs/quick-start/ios) app in the simulator. Fetch the page for the bundler in front of
you; do not adapt one bundler's steps to another. Not every bundler is fully supported: the page says what works.

## [Logging in](https://conciv.dev/docs/usage/logging-in)

The first time a browser opens the widget it asks for a code that the dev server prints in its terminal. For the
code, the login link, and listing or revoking logged-in browsers, fetch
[Logging in](https://conciv.dev/docs/usage/logging-in).

## [Configuration](https://conciv.dev/docs/configuration)

For the `conciv()` options and the common ways to set them, fetch
[Configuration](https://conciv.dev/docs/configuration).

## [Harnesses](https://conciv.dev/docs/harnesses)

The harness is the agent CLI behind the chat. For which harnesses exist, how to pick one and what each supports,
fetch [Harnesses](https://conciv.dev/docs/harnesses).

## [Using the widget](https://conciv.dev/docs/usage)

For a tour of the widget, fetch [Usage](https://conciv.dev/docs/usage). Built in:
[Chat](https://conciv.dev/docs/usage/chat), [Page control](https://conciv.dev/docs/usage/page-control) (the agent
reads and drives the live page), [Dev server](https://conciv.dev/docs/usage/dev-server) (the agent reads the dev
server's config, module graph and served code), [Approvals](https://conciv.dev/docs/usage/approvals) and the
[Quick terminal](https://conciv.dev/docs/usage/quick-terminal). Each plugin the project turns on adds its own tools
and skill; the tour lists them.

## [CLI](https://conciv.dev/docs/cli)

The `conciv` command lets an agent, or a person, drive the app from a terminal. For its commands and output, fetch
the [CLI guide](https://conciv.dev/docs/cli). For connecting a coding agent that runs outside the widget, fetch
[Connect your agents](https://conciv.dev/docs/quick-start/agents).

## [Plugins](https://conciv.dev/docs/plugins)

A plugin adds tools, skills and RPC methods to the engine, and panels and buttons to the widget. conciv's own
features are plugins too. Fetch [Plugins](https://conciv.dev/docs/plugins) for what a plugin is, where conciv
finds them, how to add one from the config or write one in the project, the [Engine SDK](https://conciv.dev/docs/plugins/engine) and the
[Browser SDK](https://conciv.dev/docs/plugins/browser) for what a plugin can do, and
[Calling a plugin from the terminal](https://conciv.dev/docs/plugins/terminal) for `conciv plugin call`. Read the
page before writing code: the documentation is the source of truth for the installed version.

## [Skills](https://conciv.dev/docs/skills)

For the built-in skills and for adding your own skills from a folder in the project, fetch
[Skills](https://conciv.dev/docs/skills).

## [Troubleshooting](https://conciv.dev/docs/troubleshooting)

When the widget does not appear, does not connect, or an approval never resolves, fetch
[Troubleshooting](https://conciv.dev/docs/troubleshooting) before changing code. If the problem is a defect in
conciv, use the `report` skill.

## [Examples](https://conciv.dev/docs/examples)

For runnable apps wired with conciv, fetch [Examples](https://conciv.dev/docs/examples).
