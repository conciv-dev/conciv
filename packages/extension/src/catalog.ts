import {TOKENS} from '@conciv/ui-kit-system/tokens'

const SLOTS = [
  {name: 'header', description: 'Above the message list (panel header region).'},
  {name: 'footer', description: 'Below the composer (panel footer region).'},
  {
    name: 'composer',
    description:
      'Inside the input toolbar: declare actions with ComposerActions.ActionButton from @conciv/ui-kit-chat so they collapse into the shared overflow menu when the row runs out of room. That import needs @conciv/ui-kit-chat as a package.json dependency: add it (matching the version range already pinned for @conciv/extension, since @conciv/* releases in lockstep) if the project does not list it yet.',
  },
  {name: 'empty', description: 'The empty chat state (greeting + starters) shown before any messages.'},
  {name: 'status', description: 'A status line region.'},
  {name: 'widget', description: 'A free-form panel widget region.'},
] as const

const CLIENT_SURFACES = [
  {
    method: 'defineExtension({name, Component})',
    description: 'Mount a SolidJS Component into the panel; it renders once per slot.',
  },
  {
    method: 'extension.useSlot()',
    description:
      'Accessor for the current slot (header|footer|composer|empty|status|widget); branch on it in Component.',
  },
  {
    method: 'extension.useContext(select?)',
    description:
      'Read host state + actions (insert, notify, setBusy, newSession, harnessId, grab, client) and your own .client() value.',
  },
  {
    method: "theme: {'chat-accent': '#2563eb'}",
    description: 'Declarative design-token overrides on the meta object.',
  },
  {
    method: '.client((client) => ({value, dispose?}))',
    description:
      'Browser-only setup; client = {apiBase, client, requestMeta}. value merges into useContext, dispose runs on unmount.',
  },
  {
    method: 'defineTool(...).render({render: Card, hasEmbeddedBody})',
    description:
      "Co-located SolidJS card for the tool's result (browser only); hasEmbeddedBody(part, result, ctx) tells a trace row whether the card renders a body.",
  },
] as const

const SERVER_SURFACES = [
  {
    method: 'defineTool({name, description, inputSchema}).server((input, ctx) => …)',
    description: 'Define a tool once; .server runs it in node, receiving validated input + the injected ctx.',
  },
  {
    method: 'defineExtension({name, configSchema, tools: […]})',
    description: 'Declare tools + a zod configSchema; execute auto-wires server-side, renderer client-side.',
  },
  {
    method: '.server((server) => ({context, dispose?}))',
    description:
      'Node-only setup; server = {config, cwd, app}. Register namespaced routes on server.app (HTTP + SSE + ws under /api/ext/<name>/), return the shared context injected into your tools, plus a dispose.',
  },
  {
    method: 'systemPrompt / promptSnippet',
    description:
      "Append agent guidance via the systemPrompt field or a tool's promptSnippet. systemPrompt also takes (config, {cwd}) => string, so the prompt can name the real paths and targets this session works on.",
  },
] as const

export type CatalogToken = {name: string; cssVar: string; default: string; description: string; overridable: boolean}
export type CatalogSlot = {name: string; description: string}
export type Catalog = {
  conventions: {location: string; entry: string}
  tokens: CatalogToken[]
  slots: CatalogSlot[]
  clientSurfaces: {method: string; description: string}[]
  serverSurfaces: {method: string; description: string}[]
}

export function buildCatalog(): Catalog {
  return {
    conventions: {
      location: 'conciv/extensions/*.{ts,tsx}',
      entry:
        'export default defineExtension({name, configSchema, tools}).client((client) => ({value})).server((server) => ({context, dispose}))',
    },
    tokens: Object.entries(TOKENS).map(([name, def]) => ({
      name,
      cssVar: `--${name}`,
      default: def.value,
      description: def.description,
      overridable: 'overridable' in def ? def.overridable : false,
    })),
    slots: [...SLOTS],
    clientSurfaces: [...CLIENT_SURFACES],
    serverSurfaces: [...SERVER_SURFACES],
  }
}

export type ScaffoldKind = 'theme' | 'composer-action' | 'tool' | 'tool-renderer' | 'component' | 'full'

const TEMPLATES: Record<ScaffoldKind, (name: string) => string> = {
  theme: (name) => `import {defineExtension} from '@conciv/extension'

export default defineExtension({
  name: '${name}',
  theme: {'chat-accent': '#2563eb'},
})
`,
  'composer-action': (name) => `import {defineExtension} from '@conciv/extension'
import {ComposerActions} from '@conciv/ui-kit-chat'

const extension = defineExtension({name: '${name}', Component})

export default extension

function Component() {
  const slot = extension.useSlot()
  const insert = extension.useContext((context) => context.insert)
  if (slot() !== 'composer') return null
  return (
    <ComposerActions.ActionButton priority={10} tooltip="Do thing" onClick={() => insert('…')}>
      <svg
        viewBox="0 0 24 24"
        class="size-5 block"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
      </svg>
    </ComposerActions.ActionButton>
  )
}
`,
  tool: (name) => `import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'

const ${name}Do = defineTool({
  name: '${name}_do',
  description: 'Describe what this tool does',
  inputSchema: z.object({input: z.string()}),
}).server((input) => ({result: input.input}))

export default defineExtension({name: '${name}', tools: [${name}Do]})
`,
  'tool-renderer': (name) => `import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'

const ${name}Do = defineTool({
  name: '${name}_do',
  description: 'Describe what this tool does',
  inputSchema: z.object({input: z.string()}),
})
  .server((input) => ({result: input.input}))
  .render({render: (props) => <div>Custom render for {props.part.name}</div>, hasEmbeddedBody: () => true})

export default defineExtension({name: '${name}', tools: [${name}Do]})
`,
  component: (name) => `import {defineExtension} from '@conciv/extension'

const extension = defineExtension({name: '${name}', Component})

export default extension

function Component() {
  const slot = extension.useSlot()
  if (slot() !== 'empty') return null
  return <div>Welcome! Ask me anything.</div>
}
`,
  full: (name) => `import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {ComposerActions} from '@conciv/ui-kit-chat'

const ${name}Do = defineTool({
  name: '${name}_do',
  description: 'Describe what this tool does',
  inputSchema: z.object({input: z.string()}),
  promptSnippet: 'You can use ${name}_do.',
})
  .server((input) => ({result: input.input}))
  .render({render: (props) => <div>${name}: {props.part.name}</div>, hasEmbeddedBody: () => true})

const extension = defineExtension({name: '${name}', Component, theme: {'chat-accent': '#2563eb'}, tools: [${name}Do]})
  .client((client) => ({value: {ready: true}}))
  .server((server) => {
    server.app.get('/status', () => ({ok: true}))
    return {context: {ready: true}}
  })

export default extension

function Component() {
  const slot = extension.useSlot()
  const insert = extension.useContext((context) => context.insert)
  if (slot() === 'status') return <span>${name} ready</span>
  if (slot() === 'composer')
    return (
      <ComposerActions.ActionButton priority={10} tooltip="Say hello" onClick={() => insert('hello from ${name}')}>
        <svg
          viewBox="0 0 24 24"
          class="size-5 block"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
        </svg>
      </ComposerActions.ActionButton>
    )
  return null
}
`,
}

export function scaffold(kind: ScaffoldKind, opts: {name: string}): string {
  return TEMPLATES[kind](opts.name)
}

export type Issue = {level: 'error' | 'warn'; message: string}

const TOKEN_NAMES = new Set(Object.keys(TOKENS))
const OVERRIDABLE_TOKEN_NAMES = new Set(
  Object.entries(TOKENS)
    .filter(([, def]) => 'overridable' in def && def.overridable)
    .map(([name]) => name),
)

export function validateSource(source: string): {ok: boolean; issues: Issue[]} {
  const issues: Issue[] = []
  if (!/export\s+default\s+defineExtension\s*\(/.test(source))
    issues.push({level: 'error', message: 'No `export default defineExtension({name})` found.'})
  const themeBlock = source.match(/theme\s*:\s*\{([^}]*)\}/)
  const themeKeys = themeBlock?.[1] ? [...themeBlock[1].matchAll(/['"]([\w-]+)['"]\s*:/g)].map((m) => m[1]) : []
  for (const name of themeKeys) {
    if (!name) continue
    if (!TOKEN_NAMES.has(name))
      issues.push({
        level: 'error',
        message: `Unknown theme token '${name}'. Call external_conciv_extensions({verb: 'catalog'}) for the token list.`,
      })
    if (TOKEN_NAMES.has(name) && !OVERRIDABLE_TOKEN_NAMES.has(name))
      issues.push({
        level: 'warn',
        message: `Token '${name}' is not marked overridable; it may be restyled by the base theme.`,
      })
  }
  if (/import[^\n]*['"]node:/.test(source) && !/\.server\s*\(/.test(source))
    issues.push({
      level: 'warn',
      message:
        'A `node:*` import must be referenced only inside `.server()`; move it there or it will break the browser build.',
    })
  return {ok: issues.every((i) => i.level !== 'error'), issues}
}
