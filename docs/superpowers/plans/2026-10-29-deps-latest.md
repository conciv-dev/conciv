# Every dependency to latest (follow-up to #612)

Base: `main` at 413bc87c (#612, pnpm catalog, merged). Integration branch `deps-latest`; one lane
branch per area, merged into `deps-latest`, one PR to `main`.

## Rules

- Target = the newest stable release published at least 48h ago (`minimumReleaseAge: 2880`).
  Exception: every `@tanstack/*` package goes to its latest release regardless of age; the
  per-package `@tanstack/ai*` entries in `minimumReleaseAgeExclude` collapse into one `@tanstack/*`
  pattern (verify pnpm honours the glob; if it does not, list the names).
- #612's existing exclusions (storybook, tiptap, lucide, @types/node, tsdown, nitro-nightly and
  their trains) stay.
- Shared deps stay in the catalog; `conciv-publish check-catalog` must pass.
- Breakage is fixed at the call site, in the idiom of the new version. No dependency patches, no
  `patchedDependencies`, no `declare module` shims, no new non-TanStack dependency: stop and report
  instead.
- No back-compat shims; v0, update every call site.
- Code style per AGENTS.md: functions not classes, no IIFEs, zero comments, no `any`/`as`/non-null,
  no `useEffect` in React code, library idioms rather than hand-rolled parallels.

## Targets (computed 2026-10-29 against the 48h cutoff)

Held back by the window this round: `minimatch` 11.0.3, `@cloudflare/vite-plugin` 1.66.0,
`@opencode-ai/sdk` 1.19.5, `astro` 7.4.4, `fallow` 3.37.0, `fumadocs-core`/`-ui` 16.17.9,
`unplugin` 3.7.0, `wrangler` 4.156.0, `@babel/core` 8.0.10, `@excalidraw/mermaid-to-excalidraw`
3.1.0, `@agentclientprotocol/sdk` 2.1.0. `@lydell/node-pty` stays 1.1.0 (latest tag is a beta).

### Lane `deps-ai` (packages/core, harness, db, ui-kit-chat, apps/conciv, extensions using ai-client)

`@tanstack/ai*` family 0.x to 1.0 (ai 1.0.1, ai-client 1.0.1, ai-code-mode 1.0.1, ai-persistence
1.0.1, everything else 1.0.0), dropping both `@tanstack/ai-sandbox*` patches if 1.0 no longer
needs them (if it still does, report; re-patching needs approval). Harness SDKs travel with it:
`@agentclientprotocol/sdk` 2.0.2, `@anthropic-ai/claude-agent-sdk` 0.3.312, `@opencode-ai/sdk`
1.19.4, `@modelcontextprotocol/sdk` 1.32.2.

### Lane `deps-site` (apps/site, apps/examples/*, e2e/tanstack-start*)

TanStack router/start set to latest including `@tanstack/react-start` 1.169.x (`useSession` gone
from `@tanstack/react-start/server`: find the TanStack-sanctioned replacement; a non-TanStack
session library needs approval, stop and report), `@tanstack/react-router`, `router-cli`,
`router-plugin`, `solid-router`, `react-router-devtools`, `@tanstack/react-form` 1.33.5,
`@tanstack/redact` 0.2.3. Site: fumadocs-core/ui 16.17.8, fumadocs-mdx 15.4.10, radix-ui 1.8.1,
shadcn 4.23.0, tailwind-merge 3.7.0, takumi-js 2.18.2, wrangler 4.154.0, `@cloudflare/vite-plugin`
1.65.0, lenis 1.3.27, `@fontsource-variable/geist` 5.3.0, `@huggingface/transformers` 4.3.2,
`@shikijs/magic-move` 4.5.0, mermaid 12.2.0 (also ui-kit-chat). nextjs example: eslint 10.13.0,
eslint-config-next 16.4.3.

### Lane `deps-packages` (build tooling and remaining runtime packages)

extension-compiler: `@babel/core` 8.0.9, `@babel/preset-typescript` 8.0.7,
babel-dead-code-elimination 2.0.0, magic-string 1.4.5, babel-preset-solid 1.9.16. extension:
unplugin-solid 3.0.0. plugin: chokidar 6.0.0, unplugin 3.6.0, launch-editor 2.14.2. publish:
execa 10.2.1, js-yaml 5.5.0, minimatch 10.2.6, `@changesets/parse` 1.0.0. root: turbo 2.11.10,
fallow 3.36.0 (the fallow-rs action pin moves with it), `@j178/prek` 0.5.7,
`@arethetypeswrong/cli` 0.18.5, `@changesets/cli` 3.0.3, `@changesets/changelog-github` 1.0.1.
cli: `@ast-grep/napi` 0.51.0, nypm 0.6.12. skills: `@tanstack/intent` 0.5.6. apps/conciv:
`@tanstack/hotkeys` 0.18.0, `@tanstack/solid-hotkeys` 0.17.0. solid-diffs: `@tanstack/solid-pacer`
0.24.0, `@pierre/diffs` 1.6.2. recorder: rrweb, `@rrweb/types`, `@rrweb/rrweb-plugin-console-record`
2.2.0, rrweb-player 2.2.0. page: js-beautify 2.0.3, `@fontsource-variable/wix-madefor-text` 5.3.0.
ui-kit-chat: `@chenglou/pretext` 1.0.0, `@fontsource/source-sans-3` 5.3.1. ui-kit-system:
`@zag-js/json-tree-utils` 1.47.0. ui-kit-tap: `@floating-ui/dom` 1.8.0. storybook:
`@chromatic-com/storybook` 5.6.0, `@zag-js/focus-visible` 1.47.0, `@testing-library/dom` 10.4.2.
embed/page: bippy 0.7.3 (fiber helpers removed), react-grab 0.2.0.

### Lane `deps-e2e` (e2e consumer apps and the whiteboard extension)

e2e/solid-start: `@solidjs/start` 2.1.0, `@solidjs/router` 1.0.0, and drop the vite 7 split if
start 2.1 accepts vite 8. e2e/svelte: `@sveltejs/kit` 3.1.0, `@sveltejs/adapter-auto` 8.0.0,
svelte 5.57.3, svelte-check 4.7.7, `@sveltejs/vite-plugin-svelte` 7.3.1. e2e/astro: astro 7.4.2.
whiteboard: cytoscape 3.34.4, drizzle-orm 0.45.4 / drizzle-kit 0.31.11 (the documented split
stays), `@excalidraw/mermaid-to-excalidraw` 3.0.0, `@takumi-rs/core`/`helpers` 2.18.2,
`@libsql/client` 0.18.0.

### Later lanes, after the four above merge

- `typescript` 7.0.2: re-run the #373 repro (core shared-chunk value export erased to `type`)
  on rolldown-plugin-dts 0.29.0. Fixed: migrate. Not fixed: stay on 6.0.3 and record the result.
- `vitest` / `@vitest/*` 5.0.5: blocked by vitest-dev/vitest#11682 (fixed by #11709, unreleased).
  Pending the user's decision.
- `oxlint` 1.90.0, `@oxlint/plugins` 1.90.0, `oxfmt` 0.75.0, `eslint-plugin-playwright` 2.12.1,
  `eslint-plugin-solid` 0.18.1: last, on the integrated branch, because new rules and the
  formatter touch every package.

## Acceptance

Orchestrator gates on the integrated branch: `pnpm install --frozen-lockfile`, `check-catalog`,
`pnpm test:affected`, `pnpm typecheck:affected`, lint, format:check, fallow audit, changeset
coverage, and the site/widget run in a browser. `pnpm outdated -r` then lists only the documented
holds.
