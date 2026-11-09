import {z} from 'zod'
import type {Design} from './defs.js'

const PropSketchSchema = z.object({
  name: z.string(),
  type: z.string().describe('the declared type as written'),
  required: z.boolean(),
  values: z.array(z.string()).describe('the literal members when the type is a union of literals, the variants'),
})

const ComponentSchema = z.object({
  id: z.string().describe('sha256 of the repo-relative file and export name, or of package@version and export name'),
  names: z.array(z.string()).min(1).describe('every name the defining module exports it under, the first is its own'),
  file: z.string().describe('repo-relative path of the defining module'),
  pkg: z.string().nullable().describe('the package a project file imports it from, null for the project own files'),
  version: z.string().nullable().describe('the installed version, for a dependency only'),
  specifier: z.string().describe('the import path a project file writes'),
  renders: z.boolean(),
  sentence: z.string().nullable(),
  props: z.union([z.array(PropSketchSchema), z.literal('see file')]),
  usage: z.string().nullable().describe('the shortest story or call site that renders it'),
  story: z.string().nullable().describe('repo-relative path of its stories file'),
})

const ModuleEdgeSchema = z.object({from: z.string(), to: z.string()})

const ScanSchema = z.object({
  fingerprint: z.string(),
  modules: z.array(z.string()),
  edges: z.array(ModuleEdgeSchema),
  components: z.array(ComponentSchema),
  unreadable: z.array(z.string()).describe('repo-relative paths of the vite configs that failed to load'),
})

const RankedSchema = ComponentSchema.extend({
  rank: z.number(),
  imports: z.number(),
  onPage: z.number(),
  tier: z.enum(['kit', 'app', 'other']),
  flag: z.literal('prefer').nullable(),
})

const HintSchema = z.object({component: z.string(), specifier: z.string(), confidence: z.number()})

const CatalogConfigSchema = z.object({
  sources: z.array(z.string()),
  hint: z.boolean(),
  section: z.boolean(),
  appTierFull: z.number(),
  hintConfidence: z.number(),
})

export const CatalogSchemas = {
  PropSketch: PropSketchSchema,
  Component: ComponentSchema,
  ModuleEdge: ModuleEdgeSchema,
  Scan: ScanSchema,
  Ranked: RankedSchema,
  Hint: HintSchema,
  CatalogConfig: CatalogConfigSchema,
}

type PropSketch = z.output<typeof PropSketchSchema>
type Component = z.output<typeof ComponentSchema>
type ModuleEdge = z.output<typeof ModuleEdgeSchema>
type Scan = z.output<typeof ScanSchema>
type Ranked = z.output<typeof RankedSchema>
type Hint = z.output<typeof HintSchema>
type CatalogConfig = z.output<typeof CatalogConfigSchema>
type ComponentSource = {name: string; scan(input: {cwd: string}): Promise<Scan>}
type Hinter = {name: string; hint(input: {design: Design; ranked: Ranked[]; config: CatalogConfig}): Map<string, Hint>}

export type {CatalogConfig, Component, ComponentSource, Hint, Hinter, ModuleEdge, PropSketch, Ranked, Scan}
