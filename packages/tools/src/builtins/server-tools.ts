import {z} from 'zod'
import {defineTool, toolError} from '@conciv/extension/tool'
import {BundlerConfigSchema, ModuleNodeSchema, type BundlerBridge} from '@conciv/protocol/bundler-types'
import {OkResult, type BuiltinCategory} from './shared.js'

export type ServerToolContext = {bundler: () => BundlerBridge | undefined}

export type OpenToolContext = {openInEditor: (file: string, line?: number) => void}

const NO_BUNDLER = {NO_BUNDLER: {message: 'no dev server is attached to conciv'}}

function requireBundler(ctx: ServerToolContext): BundlerBridge {
  const bundler = ctx.bundler()
  if (!bundler) throw toolError('NO_BUNDLER', {message: 'no dev server is attached to conciv'})
  return bundler
}

function serverTool<Shape extends z.ZodRawShape, Out extends z.ZodType>(spec: {
  operation: string
  summary: string
  input: z.ZodObject<Shape>
  output: Out
  mutating?: boolean
  keywords?: readonly string[]
  run: (input: z.infer<z.ZodObject<Shape>>, bundler: BundlerBridge) => Promise<z.infer<Out>> | z.infer<Out>
}) {
  const category: BuiltinCategory = 'server'
  return defineTool({
    name: `server.${spec.operation}`,
    description: spec.summary,
    inputSchema: spec.input,
    outputSchema: spec.output,
    errors: NO_BUNDLER,
    meta: {
      summary: spec.summary,
      category,
      mutating: spec.mutating ?? false,
      mirrors: false,
      keywords: spec.keywords ?? [],
    },
  }).server((input, ctx: ServerToolContext) => spec.run(input, requireBundler(ctx)))
}

const configTool = serverTool({
  operation: 'config',
  summary: 'report the resolved root, base, aliases and plugins',
  keywords: ['vite', 'aliases'],
  input: z.object({}),
  output: BundlerConfigSchema,
  run: (_input, bundler) => bundler.config(),
})

const urlsTool = serverTool({
  operation: 'urls',
  summary: 'report where the dev server listens',
  keywords: ['host', 'port'],
  input: z.object({}),
  output: z.object({local: z.array(z.string()), network: z.array(z.string())}),
  run: (_input, bundler) => bundler.urls(),
})

const resolveTool = serverTool({
  operation: 'resolve',
  summary: 'report where an import specifier resolves',
  keywords: ['import', 'alias'],
  input: z.object({
    spec: z.string().describe('the import specifier'),
    importer: z.string().optional().describe('resolve as if imported from this file'),
  }),
  output: z.object({id: z.string().nullable()}),
  run: (input, bundler) => bundler.resolve(input.spec, input.importer),
})

const graphTool = serverTool({
  operation: 'graph',
  summary: 'report the importers and imported modules of a file',
  keywords: ['module', 'imports'],
  input: z.object({file: z.string().describe('the file to inspect')}),
  output: z.array(ModuleNodeSchema),
  run: (input, bundler) => bundler.moduleGraph(input.file),
})

const transformTool = serverTool({
  operation: 'transform',
  summary: 'report the transformed code the dev server serves for a url',
  keywords: ['compile', 'output'],
  input: z.object({url: z.string().describe('the module url')}),
  output: z.object({code: z.string().nullable()}),
  run: (input, bundler) => bundler.transform(input.url),
})

const reloadTool = serverTool({
  operation: 'reload',
  summary: 'force a hot update of one module',
  mutating: true,
  keywords: ['hmr'],
  input: z.object({file: z.string().describe('the file to reload')}),
  output: OkResult,
  run: async (input, bundler) => {
    await bundler.reload(input.file)
    return {ok: true} as const
  },
})

const restartTool = serverTool({
  operation: 'restart',
  summary: 'restart the dev server and re-bundle its dependencies',
  mutating: true,
  keywords: ['rebundle'],
  input: z.object({force: z.boolean().optional().describe('force a full restart')}),
  output: OkResult,
  run: async (input, bundler) => {
    await bundler.restart(input.force ?? false)
    return {ok: true} as const
  },
})

export const BUILTIN_SERVER_TOOLS = [
  configTool,
  urlsTool,
  resolveTool,
  graphTool,
  transformTool,
  reloadTool,
  restartTool,
] as const

const OpenInput = z.object({
  file: z.string().min(1).describe('the file to open'),
  line: z.coerce.number().optional().describe('line number to jump to'),
})

export const BUILTIN_OPEN_TOOL = defineTool({
  name: 'open',
  description: "open a source file in the user's editor",
  inputSchema: OpenInput,
  outputSchema: z.object({ok: z.literal(true), file: z.string(), line: z.number().optional()}),
  meta: {
    summary: "open a source file in the user's editor",
    category: 'server',
    mutating: false,
    mirrors: false,
    keywords: ['editor', 'source'],
  },
}).server((input, ctx: OpenToolContext) => {
  ctx.openInEditor(input.file, input.line)
  return input.line === undefined
    ? {ok: true as const, file: input.file}
    : {ok: true as const, file: input.file, line: input.line}
})
