import {render} from '@solidjs/testing-library'
import type {JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCatalogView, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import type {ToolIconKey, ToolLabel} from '@conciv/protocol/tool-icon-types'

export function mountView(view: () => JSX.Element): HTMLElement {
  return render(view).container
}

export type FixtureTool = {name: string; meta: ToolViewMeta}

export type FixtureRegistry = {tools: readonly FixtureTool[]; catalog: {get: (name: string) => ToolViewMeta}}

export function fixtureRegistry(tools: readonly FixtureTool[]): FixtureRegistry {
  const get = (name: string): ToolViewMeta => {
    const found = tools.find((tool) => tool.name === name)
    if (found === undefined) throw new Error(`unknown tool "${name}"`)
    return found.meta
  }
  return {tools, catalog: {get}}
}

export function registryCatalogView(registry: FixtureRegistry): ToolCatalogView {
  return {loaded: () => true, meta: (name) => registry.tools.find((tool) => tool.name === name)?.meta}
}

const FIXTURE_TOOL_PREFIX = 'fixture_'

const Target = {selector: z.string().optional().describe('CSS selector for the target element')}

function fixtureTool<Shape extends z.ZodRawShape>(spec: {
  verb: string
  category: string
  icon: ToolIconKey
  label: ToolLabel
  mutating?: boolean
  input: z.ZodObject<Shape>
}): FixtureTool {
  return {
    name: `${FIXTURE_TOOL_PREFIX}${spec.verb}`,
    meta: {
      summary: `a fixture tool for ${spec.label.running.toLowerCase()}`,
      category: spec.category,
      icon: spec.icon,
      label: spec.label,
      mutating: spec.mutating ?? false,
      ...('selector' in spec.input.shape ? {positional: 'selector'} : {}),
      inputSchema: z.toJSONSchema(spec.input, {io: 'input'}),
      outputSchema: z.toJSONSchema(z.unknown(), {io: 'output'}),
      errors: [],
    },
  }
}

export const FIXTURE_TOOLS: FixtureTool[] = [
  fixtureTool({
    verb: 'text',
    category: 'read',
    icon: 'read',
    label: {running: 'Reading text', done: 'Read the text'},
    input: z.object(Target),
  }),
  fixtureTool({
    verb: 'tree',
    category: 'react',
    icon: 'react',
    label: {running: 'Reading the page tree', done: 'Read the page tree'},
    input: z.object(Target),
  }),
  fixtureTool({
    verb: 'locate',
    category: 'react',
    icon: 'react',
    label: {running: 'Locating the source', done: 'Located the source'},
    input: z.object(Target),
  }),
  fixtureTool({
    verb: 'click',
    category: 'act',
    icon: 'pointer',
    label: {running: 'Clicking', done: 'Clicked'},
    mutating: true,
    input: z.object(Target),
  }),
  fixtureTool({
    verb: 'fill',
    category: 'act',
    icon: 'keyboard',
    label: {running: 'Typing', done: 'Typed'},
    mutating: true,
    input: z.object({...Target, value: z.string().describe('the value to type into the field')}),
  }),
  fixtureTool({
    verb: 'press',
    category: 'act',
    icon: 'keyboard',
    label: {running: 'Pressing a key', done: 'Pressed'},
    mutating: true,
    input: z.object({...Target, key: z.string().describe('a key or a hotkey binding')}),
  }),
  fixtureTool({
    verb: 'effect',
    category: 'act',
    icon: 'edit',
    label: {running: 'Driving an effect', done: 'Drove an effect'},
    mutating: true,
    input: z.object({action: z.string(), effect: z.string()}),
  }),
  fixtureTool({
    verb: 'setattr',
    category: 'edit-live',
    icon: 'edit',
    label: {running: 'Setting an attribute', done: 'Set an attribute'},
    mutating: true,
    input: z.object({...Target, attribute: z.string(), value: z.string().optional()}),
  }),
  fixtureTool({
    verb: 'settext',
    category: 'edit-live',
    icon: 'edit',
    label: {running: 'Setting text', done: 'Set the text'},
    mutating: true,
    input: z.object({...Target, value: z.string()}),
  }),
]

export function fixtureToolName(verb: string): string {
  return `${FIXTURE_TOOL_PREFIX}${verb}`
}

export function fixtureToolMeta(verb: string) {
  return FIXTURE_TOOLS.find((tool) => tool.name === fixtureToolName(verb))?.meta
}

export function readFixtureVerb(name: string): string {
  if (!name.startsWith(FIXTURE_TOOL_PREFIX)) throw new Error(`"${name}" is not a fixture tool`)
  return name.slice(FIXTURE_TOOL_PREFIX.length)
}

export function fixtureToolRegistry(): FixtureRegistry {
  return fixtureRegistry(FIXTURE_TOOLS)
}
