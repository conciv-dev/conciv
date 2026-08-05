import {z} from 'zod'
import {defineTool, TOOL_ICON_KEYS, type ToolIconKey, type ToolLabel, type ToolMeta} from '@conciv/extension/tool'

export {TOOL_ICON_KEYS}
export type {ToolIconKey, ToolLabel, ToolMeta}
import {PagePositionSchema, PageWaitStateSchema, type PageQueryKind} from '@conciv/protocol/page-types'
import {AnyRecord, ElementTarget, OkResult, type BuiltinCategory} from './shared.js'

function pageTool<Shape extends z.ZodRawShape, Out extends z.ZodType>(spec: {
  verb: string
  summary: string
  category: BuiltinCategory
  icon: ToolIconKey
  label: ToolLabel
  input: z.ZodObject<Shape>
  output: Out
  hint?: string
  mutating?: boolean
  mirrors?: boolean
  keywords?: readonly string[]
}) {
  return defineTool({
    name: `page.${spec.verb}`,
    description: spec.summary,
    inputSchema: spec.input,
    outputSchema: spec.output,
    meta: {
      summary: spec.summary,
      category: spec.category,
      icon: spec.icon,
      label: spec.label,
      hint: spec.hint,
      mutating: spec.mutating ?? false,
      mirrors: spec.mirrors ?? false,
      keywords: spec.keywords ?? [],
    },
  }).client()
}

const target = z.object(ElementTarget)
const noInput = z.object({})

const AttributeName = z.string().describe('attribute name, e.g. href or data-state')
const ComponentName = z.string().describe('React component name')
const ClassName = z.string().describe('class name to add or remove')
const ActionEnum = z
  .enum(['start', 'stop', 'report', 'enable', 'disable', 'toggle', 'list'])
  .describe('what to do: start, stop, report, enable, disable, toggle, list')

const routeTool = pageTool({
  verb: 'route',
  summary: 'report the current url of the live page',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading the route', done: 'Read the route'},
  keywords: ['url', 'location'],
  input: noInput,
  output: z.object({pathname: z.string(), search: z.string(), href: z.string()}),
})

const domTool = pageTool({
  verb: 'dom',
  summary: 'return the outer HTML of an element or of the whole body',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading the DOM', done: 'Read the DOM'},
  keywords: ['html', 'markup'],
  input: target,
  output: z.object({html: z.string()}),
})

const queryTool = pageTool({
  verb: 'query',
  summary: 'describe every element matching a selector',
  category: 'read',
  icon: 'read',
  label: {running: 'Querying the page', done: 'Queried the page'},
  keywords: ['selector', 'match'],
  input: target,
  output: z.object({count: z.number(), elements: z.array(AnyRecord)}),
})

const consoleTool = pageTool({
  verb: 'console',
  summary: 'read the buffered browser console output',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading the console', done: 'Read the console'},
  keywords: ['log', 'error'],
  input: z.object({since: z.coerce.number().optional().describe('only logs after this timestamp (ms)')}),
  output: z.object({entries: z.array(z.object({level: z.string(), ts: z.number(), text: z.string()}))}),
})

const textTool = pageTool({
  verb: 'text',
  summary: 'read the visible text of an element',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading text', done: 'Read the text'},
  keywords: ['content'],
  input: target,
  output: z.object({text: z.string()}),
})

const valueTool = pageTool({
  verb: 'value',
  summary: 'read the current value of a form field',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading a value', done: 'Read a value'},
  keywords: ['input', 'field'],
  input: target,
  output: z.object({value: z.string().nullable()}),
})

const attrTool = pageTool({
  verb: 'attr',
  summary: 'read one attribute of an element',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading an attribute', done: 'Read an attribute'},
  keywords: ['attribute'],
  input: z.object({...ElementTarget, attribute: AttributeName}),
  output: z.object({value: z.string().nullable()}),
})

const existsTool = pageTool({
  verb: 'exists',
  summary: 'report whether a selector matches anything',
  category: 'read',
  icon: 'read',
  label: {running: 'Checking existence', done: 'Checked existence'},
  keywords: ['present'],
  input: target,
  output: z.object({exists: z.boolean(), count: z.number()}),
})

const snapshotTool = pageTool({
  verb: 'snapshot',
  summary: 'take an accessibility snapshot with a ref for every control',
  category: 'read',
  icon: 'read',
  label: {running: 'Capturing a snapshot', done: 'Captured a snapshot'},
  hint: 'act on every ref from one snapshot before taking another',
  keywords: ['accessibility', 'refs'],
  input: target,
  output: z.object({nodes: z.array(AnyRecord)}),
})

const cssTool = pageTool({
  verb: 'css',
  summary: 'inject a stylesheet into the live page',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Injecting CSS', done: 'Injected CSS'},
  mutating: true,
  keywords: ['style', 'stylesheet'],
  input: z.object({text: z.string().describe('the full stylesheet string')}),
  output: OkResult,
})

const evalTool = pageTool({
  verb: 'eval',
  summary: 'run javascript in the page and return its result',
  category: 'edit-live',
  icon: 'script',
  label: {running: 'Running a script', done: 'Ran a script'},
  hint: 'the last resort: reach for inspect, track and override first',
  mutating: true,
  keywords: ['script', 'javascript'],
  input: z.object({code: z.string().describe('javascript to run in the page, awaited')}),
  output: z.object({result: z.unknown()}),
})

const locateTool = pageTool({
  verb: 'locate',
  summary: 'find the source location that rendered an element',
  category: 'react',
  icon: 'react',
  label: {running: 'Locating the source', done: 'Located the source'},
  hint: 'exact when the element carries a data-conciv-source attribute',
  keywords: ['source', 'file'],
  input: target,
  output: z.looseObject({
    component: z.string().optional(),
    stack: z.array(z.string()).optional(),
    frames: z.array(AnyRecord).optional(),
    source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullish(),
  }),
})

const inspectTool = pageTool({
  verb: 'inspect',
  summary: 'read props, state, hooks and context of a live component',
  category: 'react',
  icon: 'react',
  label: {running: 'Inspecting a component', done: 'Inspected a component'},
  hint: 'drill into nested values with path, e.g. props.user.address',
  keywords: ['props', 'state', 'hooks'],
  input: z.object({
    ...ElementTarget,
    path: z.string().optional().describe('dot-path to drill into, e.g. props.user.address'),
  }),
  output: z.looseObject({component: z.string().optional()}),
})

const treeTool = pageTool({
  verb: 'tree',
  summary: 'walk the live React tree under an element',
  category: 'react',
  icon: 'react',
  label: {running: 'Reading the page tree', done: 'Read the page tree'},
  keywords: ['components', 'hierarchy'],
  input: target,
  output: z.looseObject({}),
})

const findTool = pageTool({
  verb: 'find',
  summary: 'find every mounted instance of a React component',
  category: 'react',
  icon: 'react',
  label: {running: 'Finding components', done: 'Found components'},
  keywords: ['component', 'instances'],
  input: z.object({name: ComponentName}),
  output: z.looseObject({}),
})

const overrideTool = pageTool({
  verb: 'override',
  summary: 'patch props, state, hooks or context on a live component',
  category: 'react',
  icon: 'edit',
  label: {running: 'Overriding a value', done: 'Overrode a value'},
  hint: 'ephemeral: verify the hypothesis, then edit the real source',
  mutating: true,
  keywords: ['patch', 'props'],
  input: z.object({
    ...ElementTarget,
    target: z.enum(['props', 'state', 'hooks', 'context']).describe('which slice to override'),
    path: z.string().optional().describe('dot-path inside the slice, e.g. user.address'),
    hookId: z.coerce.number().optional().describe('hook id from inspect (for --target hooks)'),
    json: z.string().optional().describe('new value as JSON, e.g. true or {"a":1}'),
  }),
  output: z.looseObject({ok: z.literal(true), target: z.string(), path: z.string()}),
})

const trackTool = pageTool({
  verb: 'track',
  summary: 'record and report React re-renders',
  category: 'react',
  icon: 'react',
  label: {running: 'Tracking renders', done: 'Tracked renders'},
  hint: 'action: start, then action: report for how often each component re-rendered and why',
  keywords: ['renders', 'performance'],
  input: z.object({
    action: ActionEnum.optional(),
    name: ComponentName.optional(),
  }),
  output: z.looseObject({}),
})

const effectTool = pageTool({
  verb: 'effect',
  summary: 'drive a registered page effect',
  category: 'act',
  icon: 'edit',
  label: {running: 'Driving an effect', done: 'Drove an effect'},
  keywords: ['effects'],
  input: z.object({
    action: ActionEnum.optional(),
    effect: z.string().optional().describe('the effect to drive'),
  }),
  output: z.looseObject({}),
})

const waitTool = pageTool({
  verb: 'wait',
  summary: 'wait until a selector becomes visible or hidden',
  category: 'act',
  icon: 'wait',
  label: {running: 'Waiting for the page', done: 'Waited for the page'},
  hint: 'only when the page needs to settle',
  keywords: ['until', 'appear'],
  input: z.object({
    ...ElementTarget,
    state: PageWaitStateSchema.optional().describe('state to wait for'),
    timeout: z.coerce.number().optional().describe('max wait in ms'),
  }),
  output: z.object({ok: z.literal(true), state: PageWaitStateSchema}),
})

const clickTool = pageTool({
  verb: 'click',
  summary: 'click an element',
  category: 'act',
  icon: 'pointer',
  label: {running: 'Clicking', done: 'Clicked'},
  mutating: true,
  mirrors: true,
  keywords: ['press', 'tap'],
  input: target,
  output: OkResult,
})

const hoverTool = pageTool({
  verb: 'hover',
  summary: 'hover the pointer over an element',
  category: 'act',
  icon: 'pointer',
  label: {running: 'Hovering', done: 'Hovered'},
  mutating: true,
  mirrors: true,
  keywords: ['mouseover'],
  input: target,
  output: OkResult,
})

const scrollTool = pageTool({
  verb: 'scroll',
  summary: 'scroll an element into view',
  category: 'act',
  icon: 'pointer',
  label: {running: 'Scrolling', done: 'Scrolled'},
  mutating: true,
  mirrors: true,
  keywords: ['view'],
  input: target,
  output: OkResult,
})

const submitTool = pageTool({
  verb: 'submit',
  summary: 'submit the form owning an element',
  category: 'act',
  icon: 'pointer',
  label: {running: 'Submitting the form', done: 'Submitted the form'},
  mutating: true,
  mirrors: true,
  keywords: ['form'],
  input: target,
  output: OkResult,
})

const fillTool = pageTool({
  verb: 'fill',
  summary: 'type a value into a form field',
  category: 'act',
  icon: 'keyboard',
  label: {running: 'Typing', done: 'Typed'},
  mutating: true,
  mirrors: true,
  keywords: ['type', 'input'],
  input: z.object({...ElementTarget, value: z.string().describe('the value to type into the field')}),
  output: z.object({ok: z.literal(true), value: z.string()}),
})

const selectTool = pageTool({
  verb: 'select',
  summary: 'choose an option in a select element',
  category: 'act',
  icon: 'pointer',
  label: {running: 'Selecting an option', done: 'Selected'},
  mutating: true,
  mirrors: true,
  keywords: ['option', 'dropdown'],
  input: z.object({...ElementTarget, value: z.string().describe('the option value to choose')}),
  output: z.object({ok: z.literal(true), value: z.string()}),
})

const checkTool = pageTool({
  verb: 'check',
  summary: 'check a checkbox or radio',
  category: 'act',
  icon: 'pointer',
  label: {running: 'Checking a box', done: 'Checked a box'},
  mutating: true,
  mirrors: true,
  keywords: ['checkbox'],
  input: target,
  output: z.object({ok: z.literal(true), checked: z.boolean()}),
})

const uncheckTool = pageTool({
  verb: 'uncheck',
  summary: 'uncheck a checkbox',
  category: 'act',
  icon: 'pointer',
  label: {running: 'Unchecking a box', done: 'Unchecked a box'},
  mutating: true,
  mirrors: true,
  keywords: ['checkbox'],
  input: target,
  output: z.object({ok: z.literal(true), checked: z.boolean()}),
})

const pressTool = pageTool({
  verb: 'press',
  summary: 'send a key to an element',
  category: 'act',
  icon: 'keyboard',
  label: {running: 'Pressing a key', done: 'Pressed'},
  mutating: true,
  mirrors: true,
  keywords: ['keyboard', 'key'],
  input: z.object({...ElementTarget, key: z.string().describe('keyboard key, e.g. Enter')}),
  output: OkResult,
})

const setattrTool = pageTool({
  verb: 'setattr',
  summary: 'set an attribute on an element',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Setting an attribute', done: 'Set an attribute'},
  mutating: true,
  keywords: ['attribute'],
  input: z.object({
    ...ElementTarget,
    attribute: AttributeName,
    value: z.string().describe('the attribute value to set'),
  }),
  output: OkResult,
})

const removeattrTool = pageTool({
  verb: 'removeattr',
  summary: 'remove an attribute from an element',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Removing an attribute', done: 'Removed an attribute'},
  mutating: true,
  keywords: ['attribute'],
  input: z.object({...ElementTarget, attribute: AttributeName}),
  output: OkResult,
})

const addclassTool = pageTool({
  verb: 'addclass',
  summary: 'add a class to an element',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Adding a class', done: 'Added a class'},
  mutating: true,
  keywords: ['class'],
  input: z.object({...ElementTarget, class: ClassName}),
  output: OkResult,
})

const removeclassTool = pageTool({
  verb: 'removeclass',
  summary: 'remove a class from an element',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Removing a class', done: 'Removed a class'},
  mutating: true,
  keywords: ['class'],
  input: z.object({...ElementTarget, class: ClassName}),
  output: OkResult,
})

const setstyleTool = pageTool({
  verb: 'setstyle',
  summary: 'set one inline style property on an element',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Styling an element', done: 'Styled an element'},
  mutating: true,
  keywords: ['style', 'css'],
  input: z.object({
    ...ElementTarget,
    prop: z.string().describe('CSS property name, e.g. color or font-size'),
    value: z.string().describe('the CSS value to set'),
  }),
  output: OkResult,
})

const settextTool = pageTool({
  verb: 'settext',
  summary: 'replace the text content of an element',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Setting text', done: 'Set the text'},
  mutating: true,
  keywords: ['text'],
  input: z.object({...ElementTarget, text: z.string().describe('the text to set')}),
  output: OkResult,
})

const sethtmlTool = pageTool({
  verb: 'sethtml',
  summary: 'replace the inner HTML of an element',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Setting HTML', done: 'Set the HTML'},
  mutating: true,
  keywords: ['html'],
  input: z.object({...ElementTarget, html: z.string().describe('the HTML fragment to set')}),
  output: OkResult,
})

const removeTool = pageTool({
  verb: 'remove',
  summary: 'remove an element from the page',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Removing an element', done: 'Removed an element'},
  mutating: true,
  keywords: ['delete'],
  input: target,
  output: OkResult,
})

const insertTool = pageTool({
  verb: 'insert',
  summary: 'insert an HTML fragment around an element',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Inserting content', done: 'Inserted content'},
  mutating: true,
  keywords: ['html', 'append'],
  input: z.object({
    ...ElementTarget,
    html: z.string().describe('the HTML fragment to insert'),
    position: PagePositionSchema.optional().describe('where to insert it'),
  }),
  output: OkResult,
})

export const BUILTIN_PAGE_TOOLS = [
  routeTool,
  domTool,
  queryTool,
  consoleTool,
  textTool,
  valueTool,
  attrTool,
  existsTool,
  snapshotTool,
  locateTool,
  treeTool,
  inspectTool,
  overrideTool,
  findTool,
  trackTool,
  effectTool,
  waitTool,
  clickTool,
  fillTool,
  selectTool,
  checkTool,
  uncheckTool,
  pressTool,
  hoverTool,
  scrollTool,
  submitTool,
  setattrTool,
  removeattrTool,
  addclassTool,
  removeclassTool,
  setstyleTool,
  settextTool,
  sethtmlTool,
  removeTool,
  insertTool,
  cssTool,
  evalTool,
] as const

export type BuiltinPageTool = (typeof BUILTIN_PAGE_TOOLS)[number]

export type PageToolDeclaration = {name: string; meta?: ToolMeta}

export const PAGE_TOOL_PREFIX = 'page.'

export function pageVerbOfTool(name: string): string {
  if (!name.startsWith(PAGE_TOOL_PREFIX)) throw new Error(`"${name}" is not a page tool`)
  return name.slice(PAGE_TOOL_PREFIX.length)
}

export function pageToolMetaOf(
  verb: string,
  tools: readonly PageToolDeclaration[] = BUILTIN_PAGE_TOOLS,
): ToolMeta | undefined {
  return tools.find((tool) => tool.name === `${PAGE_TOOL_PREFIX}${verb}`)?.meta
}

const KINDS_WITHOUT_A_TOOL: readonly PageQueryKind[] = ['ext']

function pageToolMeta(kind: PageQueryKind): ToolMeta | undefined {
  const meta = pageToolMetaOf(kind)
  if (meta === undefined && !KINDS_WITHOUT_A_TOOL.includes(kind)) {
    throw new Error(`no built-in page tool declares "${kind}"`)
  }
  return meta
}

export function pageVerbMutates(kind: PageQueryKind): boolean {
  return pageToolMeta(kind)?.mutating === true
}

export function pageVerbMirrors(kind: PageQueryKind): boolean {
  return pageToolMeta(kind)?.mirrors === true
}
