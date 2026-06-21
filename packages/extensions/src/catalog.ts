// The extension catalog: a projection computed from node-safe sources (TOKENS, the overridable list,
// the surface consts) so the mandarax_extensions agent tool can serialize it without importing the
// browser registries. scaffold writes typed skeletons; validateSource lints a draft against the
// catalog (token + component ids) before it loads. Single-source for tokens holds (one TOKENS object
// → CSS + ThemeTokens type + this list).
import {TOKENS} from '@mandarax/ui-kit-system/tokens'

const OVERRIDABLE_COMPONENTS = [
  {id: 'EmptyState', description: 'The empty chat state (greeting + starter prompts) shown before any messages.'},
] as const

const CLIENT_SURFACES = [
  {method: 'ui.setTheme(tokens)', description: 'Override design tokens (e.g. {"pw-accent": "#2563eb"}).'},
  {
    method: 'ui.setWidget(key, factory)',
    description: 'Add/replace/remove a keyed widget in the panel (factory: () => JSX).',
  },
  {method: 'ui.setHeader(factory)', description: 'Set the panel header region (last-wins; null clears).'},
  {method: 'ui.setFooter(factory)', description: 'Set the panel footer region (last-wins; null clears).'},
  {method: 'ui.setStatus(key, text)', description: 'Set a keyed status line (null clears).'},
  {
    method: 'ui.setEmptyState(factory)',
    description: 'Replace the empty chat state (greeting + starters); null restores default.',
  },
  {method: 'registerComposerAction(action)', description: 'Add a button to the composer ({id,label,icon,onClick}).'},
] as const

const SERVER_SURFACES = [
  {
    method: 'defineTool({name,label,description,parameters,execute,renderResult})',
    description: 'Define a tool once: execute runs it (node), renderResult/renderCall draw its card (browser).',
  },
  {
    method: 'defineExtension({id, tools:[…], effects:[…]})',
    description: 'Declare tools + effects; execute runs server-side, renderers client-side, across the split.',
  },
  {
    method: 'systemPrompt.append(text)',
    description: 'Append text to the agent system prompt (or use defineTool promptSnippet).',
  },
] as const

export type CatalogToken = {name: string; cssVar: string; default: string; description: string; overridable: boolean}
export type Catalog = {
  conventions: {location: string; entry: string}
  tokens: CatalogToken[]
  overridableComponents: {id: string; description: string}[]
  clientSurfaces: {method: string; description: string}[]
  serverSurfaces: {method: string; description: string}[]
}

export function buildCatalog(): Catalog {
  return {
    conventions: {
      location: 'mandarax/extensions/*.{ts,tsx}',
      entry: 'export default defineExtension({id}).client(mx => …).server(mx => …)',
    },
    tokens: Object.entries(TOKENS).map(([name, def]) => ({
      name,
      cssVar: `--${name}`,
      default: def.value,
      description: def.description,
      overridable: 'overridable' in def ? def.overridable : false,
    })),
    overridableComponents: [...OVERRIDABLE_COMPONENTS],
    clientSurfaces: [...CLIENT_SURFACES],
    serverSurfaces: [...SERVER_SURFACES],
  }
}

export type ScaffoldKind = 'theme' | 'composer-action' | 'tool' | 'tool-renderer' | 'component' | 'full'

const TEMPLATES: Record<ScaffoldKind, (id: string) => string> = {
  theme: (id) => `import {defineExtension} from '@mandarax/extensions'

export default defineExtension({id: '${id}'}).client((mx) => {
  mx.ui.setTheme({'pw-accent': '#2563eb'})
})
`,
  'composer-action': (id) => `import {defineExtension} from '@mandarax/extensions'
import {Rocket} from 'lucide-solid'

export default defineExtension({id: '${id}'}).client((mx) => {
  mx.registerComposerAction({
    id: '${id}',
    label: 'Do thing',
    icon: Rocket,
    onClick: (ctx) => ctx.insert('…'),
  })
})
`,
  tool: (id) => `import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'

const ${id}Do = defineTool({
  name: '${id}_do',
  label: '${id}',
  description: 'Describe what this tool does',
  parameters: z.object({input: z.string()}),
  execute: ({input}) => ({result: input}),
})

export default defineExtension({id: '${id}', tools: [${id}Do]})
`,
  'tool-renderer': (id) => `import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'

// Co-locate the renderer with the tool: execute runs it (node), renderResult draws its card (browser).
const ${id}Do = defineTool({
  name: '${id}_do',
  label: '${id}',
  description: 'Describe what this tool does',
  parameters: z.object({input: z.string()}),
  execute: ({input}) => ({result: input}),
  renderResult: (_result, _options, ctx) => <div>Custom render for {ctx.part.name}</div>,
})

export default defineExtension({id: '${id}', tools: [${id}Do]})
`,
  component: (id) => `import {defineExtension} from '@mandarax/extensions'

export default defineExtension({id: '${id}'}).client((mx) => {
  mx.ui.setEmptyState(() => <div>Welcome — ask me anything.</div>)
})
`,
  full: (id) => `import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'

const ${id}Do = defineTool({
  name: '${id}_do',
  label: '${id}',
  description: 'Describe what this tool does',
  parameters: z.object({input: z.string()}),
  promptSnippet: 'You can use ${id}_do.',
  execute: ({input}) => ({result: input}),
  renderResult: (_result, _options, ctx) => <div>${id}: {ctx.part.name}</div>,
})

export default defineExtension({id: '${id}', tools: [${id}Do]})
  .client((mx) => {
    mx.ui.setTheme({'pw-accent': '#2563eb'})
    mx.ui.setStatus('${id}', 'ready')
  })
`,
}

export function scaffold(kind: ScaffoldKind, opts: {id: string}): string {
  return TEMPLATES[kind](opts.id)
}

export type Issue = {level: 'error' | 'warn'; message: string}

const TOKEN_NAMES = new Set(Object.keys(TOKENS))
const OVERRIDABLE_TOKEN_NAMES = new Set(
  Object.entries(TOKENS)
    .filter(([, def]) => 'overridable' in def && def.overridable)
    .map(([name]) => name),
)

// Lint a draft against the catalog: a missing defineExtension default export (error), an unknown
// setTheme token (error), and a known-but-not-overridable token (warn — it may be restyled by the
// base theme). v0 heuristic (string-level) — catches the common mistakes before a file loads; a full
// typecheck is the build's job.
export function validateSource(source: string): {ok: boolean; issues: Issue[]} {
  const issues: Issue[] = []
  if (!/export\s+default\s+defineExtension\s*\(/.test(source)) {
    issues.push({level: 'error', message: 'No `export default defineExtension({id})` found.'})
  }
  const themeBlocks = [...source.matchAll(/setTheme\s*\(\s*\{([^}]*)\}/g)]
  for (const block of themeBlocks) {
    const body = block[1]
    if (!body) continue
    for (const key of body.matchAll(/['"]([\w-]+)['"]\s*:/g)) {
      const name = key[1]
      if (!name) continue
      if (!TOKEN_NAMES.has(name)) {
        issues.push({
          level: 'error',
          message: `Unknown theme token '${name}'. Run mandarax_extensions catalog for the token list.`,
        })
      } else if (!OVERRIDABLE_TOKEN_NAMES.has(name)) {
        issues.push({
          level: 'warn',
          message: `Token '${name}' is not marked overridable; it may be restyled by the base theme.`,
        })
      }
    }
  }
  return {ok: issues.every((i) => i.level !== 'error'), issues}
}
