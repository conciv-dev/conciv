import {z} from 'zod'
import type {Design} from './defs.js'

const PropSketchSchema = z.object({
  name: z.string(),
  type: z.string().describe('the declared type as written'),
  required: z.boolean(),
  values: z.array(z.string()).describe('the literal members when the type is a union of literals, the variants'),
})

const ComponentSchema = z.object({
  id: z.string().describe('sha256 of the project-relative file and export name, or of package@version and export name'),
  names: z.array(z.string()).min(1).describe('every name the defining module exports it under, the first is its own'),
  file: z.string().describe('path of the defining module, relative to the project root'),
  pkg: z.string().nullable().describe('the package a project file imports it from, null for the project own files'),
  version: z.string().nullable().describe('the installed version, for a dependency only'),
  specifier: z.string().describe('the import path a project file writes'),
  renders: z.boolean(),
  sentence: z.string().nullable(),
  props: z.union([z.array(PropSketchSchema), z.literal('see file')]),
  usage: z.string().nullable().describe('the shortest story or call site that renders it'),
  story: z.string().nullable().describe('path of its stories file, relative to the project root'),
  lines: z.object({start: z.number(), end: z.number()}).describe('the 1-based lines of the defining statement'),
  sites: z
    .array(z.object({file: z.string(), line: z.number()}))
    .describe('where the walked modules render it: the file relative to the project root and the 1-based line'),
})

const ModuleEdgeSchema = z.object({from: z.string(), to: z.string()})

const ScanSchema = z.object({
  modules: z.array(z.string()),
  edges: z.array(ModuleEdgeSchema),
  components: z.array(ComponentSchema),
  unreadable: z
    .array(z.string())
    .describe('paths of the vite configs that failed to load, relative to the project root'),
})

const RankedSchema = ComponentSchema.extend({
  rank: z.number(),
  imports: z.number(),
  onPage: z.number(),
  tier: z.enum(['kit', 'app', 'other']),
  flag: z.literal('prefer').nullable(),
})

const NodeRefSchema = z.object({target: z.string(), round: z.number(), node: z.string(), source: z.string()})

const HintSchema = z.object({component: z.string(), specifier: z.string(), confidence: z.number()})

const CatalogConfigSchema = z.object({
  sources: z
    .array(z.enum(['vite-oxc']))
    .default(['vite-oxc'])
    .describe('the component sources to scan; none turns the scan, the section and the hints off'),
  hint: z.boolean().default(true).describe('design_get names the component a node probably is'),
  section: z.boolean().default(true).describe('design_get carries the component list'),
  appTierFull: z
    .number()
    .int()
    .nonnegative()
    .default(24)
    .describe('the most app components the list shows in full before it counts the rest'),
  hintConfidence: z.number().min(0).max(1).default(0.5).describe('the lowest score a hint is given at'),
  tokens: z
    .array(z.enum(['css']))
    .default(['css'])
    .describe('the token sources to read; none turns token drift off and keeps every paint row'),
  tokenFiles: z
    .array(z.string())
    .default([])
    .describe('the stylesheets to read tokens from, relative to the project root; none reads the kit exported ones'),
})

const SchemeSchema = z.enum(['light', 'dark'])

const TokenSchema = z.object({
  name: z.string().describe('the custom property, dashes included'),
  value: z.string().describe('the declared value for its scheme'),
  scheme: z.enum([...SchemeSchema.options, 'any']),
  source: z.string().describe('the stylesheet that declares it'),
})

export const PREVIEW_ROUTE = '/__conciv/preview/'

export const CatalogSchemas = {
  PropSketch: PropSketchSchema,
  Component: ComponentSchema,
  ModuleEdge: ModuleEdgeSchema,
  Scan: ScanSchema,
  Ranked: RankedSchema,
  NodeRef: NodeRefSchema,
  Hint: HintSchema,
  CatalogConfig: CatalogConfigSchema,
  Scheme: SchemeSchema,
  Token: TokenSchema,
}

type PropSketch = z.output<typeof PropSketchSchema>
type Component = z.output<typeof ComponentSchema>
type ModuleEdge = z.output<typeof ModuleEdgeSchema>
type Scan = z.output<typeof ScanSchema>
type Ranked = z.output<typeof RankedSchema>
type NodeRef = z.output<typeof NodeRefSchema>
type Hint = z.output<typeof HintSchema>
type CatalogConfig = z.output<typeof CatalogConfigSchema>
type Scheme = z.output<typeof SchemeSchema>
type Token = z.output<typeof TokenSchema>
type CatalogFlag = 'prefer' | 'do-not-use' | 'clear'
type Catalog = {
  list(input: {live?: string[]}): Promise<Ranked[]>
  show(name: string): Promise<Component & {nodes: NodeRef[]; preview: string}>
  flag(name: string, flag: CatalogFlag): Promise<void>
  componentOf(source: string): Promise<Component | null>
  componentsOf(sources: string[]): Promise<Map<string, Ranked>>
  scanIfStale(): Promise<void>
}
type ComponentSource = {name: string; scan(input: {cwd: string}): Promise<Scan>}
type TokenSource = {name: string; read(input: {cwd: string}): Promise<Token[]>}
type TokenMap = {kitTokensFor(input: {kind: string; value: string; scheme: Scheme}): Token[]}
type Hinter = {name: string; hint(input: {design: Design; ranked: Ranked[]; config: CatalogConfig}): Map<string, Hint>}

export type {
  Catalog,
  CatalogConfig,
  CatalogFlag,
  Component,
  ComponentSource,
  Hint,
  Hinter,
  ModuleEdge,
  NodeRef,
  PropSketch,
  Ranked,
  Scan,
  Scheme,
  Token,
  TokenMap,
  TokenSource,
}
