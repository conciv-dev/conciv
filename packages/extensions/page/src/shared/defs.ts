import {z} from 'zod'
import type {ToolIconKey, ToolLabel} from '@conciv/protocol/tool-icon-types'
import type {ToolCaptureMode} from '@conciv/protocol/element-capture-types'
import {defineTool, type ToolBuilder, type ToolErrors, type ToolMeta} from '@conciv/extension/tool'

export const PAGE_EXTENSION_NAME = 'page'

export const PAGE_TOOL_PREFIX = 'page_'

export function pageVerbOfTool(name: string): string {
  if (!name.startsWith(PAGE_TOOL_PREFIX)) throw new Error(`"${name}" is not a page tool`)
  return name.slice(PAGE_TOOL_PREFIX.length)
}

export const PagePositionSchema = z.enum(['before', 'after', 'prepend', 'append'])
export const PageWaitStateSchema = z.enum(['visible', 'hidden'])

export type PagePosition = z.infer<typeof PagePositionSchema>
export type PageWaitState = z.infer<typeof PageWaitStateSchema>

const AnyRecord = z.record(z.string(), z.unknown())

const OkResult = z.object({ok: z.literal(true)})

export const ElementTarget = {
  selector: z.string().optional().describe('CSS selector for the target element'),
  ref: z.string().optional().describe('element ref from the latest snapshot'),
  name: z.string().optional().describe('React component name (targets the first match)'),
}

export type PageToolCategory = 'read' | 'act' | 'edit-live' | 'react'

const CAPTURE_BY_CATEGORY: Record<PageToolCategory, ToolCaptureMode> = {
  read: 'none',
  react: 'none',
  act: 'after',
  'edit-live': 'before-after',
}

type PageToolDef<Shape extends z.ZodRawShape, Out extends z.ZodType> = ToolBuilder<
  string,
  z.ZodObject<Shape>,
  Out,
  ToolErrors,
  undefined,
  unknown
>

function pageTool<Shape extends z.ZodRawShape, Out extends z.ZodType>(spec: {
  verb: string
  summary: string
  category: PageToolCategory
  icon: ToolIconKey
  label: ToolLabel
  input: z.ZodObject<Shape>
  output: Out
  hint?: string
  mutating?: boolean
  mirrors?: boolean
  approval?: 'ask'
  capture?: ToolCaptureMode
  keywords?: readonly string[]
  errors?: ToolErrors
}): PageToolDef<Shape, Out> {
  return defineTool({
    name: `page_${spec.verb}`,
    description: spec.summary,
    inputSchema: spec.input,
    outputSchema: spec.output,
    errors: spec.errors,
    approval: spec.approval,
    meta: {
      summary: spec.summary,
      category: spec.category,
      icon: spec.icon,
      label: spec.label,
      hint: spec.hint,
      mutating: spec.mutating ?? false,
      mirrors: spec.mirrors ?? false,
      capture: spec.capture ?? CAPTURE_BY_CATEGORY[spec.category],
      keywords: spec.keywords ?? [],
      ...('selector' in spec.input.shape ? {positional: 'selector'} : {}),
    },
  })
}

const target = z.object(ElementTarget)
const noInput = z.object({})

const SelectorOnly = z.string().optional().describe('CSS selector for the target element')

const AttributeName = z.string().describe('attribute name, e.g. href or data-state')
const ComponentName = z.string().describe('React component name')
const ClassName = z.string().describe('class name to add or remove')
const ActionEnum = z
  .enum(['start', 'stop', 'report', 'enable', 'disable', 'toggle', 'list'])
  .describe('what to do: start, stop, report, enable, disable, toggle, list')

export const routeDef = pageTool({
  verb: 'route',
  summary: 'report the current url of the live page',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading the route', done: 'Read the route'},
  keywords: ['url', 'location'],
  input: noInput,
  output: z.object({pathname: z.string(), search: z.string(), href: z.string()}),
})

export const domDef = pageTool({
  verb: 'dom',
  summary: 'return the outer HTML of an element or of the whole body',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading the DOM', done: 'Read the DOM'},
  keywords: ['html', 'markup'],
  input: target,
  output: z.object({html: z.string()}),
})

export const queryDef = pageTool({
  verb: 'query',
  summary: 'describe every element matching a selector',
  category: 'read',
  icon: 'read',
  label: {running: 'Querying the page', done: 'Queried the page'},
  keywords: ['selector', 'match'],
  input: z.object({selector: SelectorOnly}),
  output: z.object({count: z.number(), elements: z.array(AnyRecord)}),
})

export const consoleDef = pageTool({
  verb: 'console',
  summary: 'read the buffered browser console output',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading the console', done: 'Read the console'},
  keywords: ['log', 'error'],
  input: z.object({since: z.coerce.number().optional().describe('only logs after this timestamp (ms)')}),
  output: z.object({entries: z.array(z.object({level: z.string(), ts: z.number(), text: z.string()}))}),
})

export const textDef = pageTool({
  verb: 'text',
  summary: 'read the visible text of an element',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading text', done: 'Read the text'},
  keywords: ['content'],
  input: target,
  output: z.object({text: z.string()}),
})

export const valueDef = pageTool({
  verb: 'value',
  summary: 'read the current value of a form field',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading a value', done: 'Read a value'},
  keywords: ['input', 'field'],
  input: target,
  output: z.object({value: z.string().nullable()}),
})

export const attrDef = pageTool({
  verb: 'attr',
  summary: 'read one attribute of an element',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading an attribute', done: 'Read an attribute'},
  keywords: ['attribute'],
  input: z.object({...ElementTarget, attribute: AttributeName}),
  output: z.object({value: z.string().nullable()}),
})

export const existsDef = pageTool({
  verb: 'exists',
  summary: 'report whether a selector matches anything',
  category: 'read',
  icon: 'read',
  label: {running: 'Checking existence', done: 'Checked existence'},
  keywords: ['present'],
  input: z.object({selector: SelectorOnly}),
  output: z.object({exists: z.boolean(), count: z.number()}),
})

export const snapshotDef = pageTool({
  verb: 'snapshot',
  summary: 'read every control on the page with its current value, checked state and ref',
  category: 'read',
  icon: 'read',
  label: {running: 'Capturing a snapshot', done: 'Captured a snapshot'},
  hint: 'the one-shot form read: act on every ref from one snapshot before taking another',
  keywords: ['accessibility', 'refs', 'form', 'fields', 'controls', 'checked'],
  input: z.object({selector: SelectorOnly}),
  output: z.object({nodes: z.array(AnyRecord)}),
})

export const cssDef = pageTool({
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

export const evalDef = pageTool({
  verb: 'eval',
  summary: 'run javascript in the page and return its result',
  category: 'edit-live',
  icon: 'script',
  label: {running: 'Running a script', done: 'Ran a script'},
  hint: 'the last resort: for React props, state or hooks use the react capabilities first, and for anything else prefer the dedicated read, act and edit-live capabilities',
  mutating: true,
  approval: 'ask',
  keywords: ['script', 'javascript'],
  input: z.object({code: z.string().describe('javascript to run in the page, awaited')}),
  output: z.object({result: z.unknown()}),
})

export const locateDef = pageTool({
  verb: 'locate',
  summary: 'find the source location that rendered an element',
  category: 'react',
  icon: 'react',
  label: {running: 'Locating the source', done: 'Located the source'},
  hint: 'exact when the element carries a data-conciv-source attribute',
  keywords: ['source', 'file'],
  input: target,
  output: z.looseObject({
    component: z.string().nullable().optional(),
    stack: z.array(z.string()).optional(),
    frames: z.array(AnyRecord).optional(),
    source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullish(),
  }),
})

export const inspectDef = pageTool({
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
  output: z.looseObject({component: z.string().nullable().optional()}),
})

export const treeDef = pageTool({
  verb: 'tree',
  summary: 'walk the live React tree under an element',
  category: 'react',
  icon: 'react',
  label: {running: 'Reading the page tree', done: 'Read the page tree'},
  keywords: ['components', 'hierarchy'],
  input: target,
  output: z.looseObject({}),
})

export const findDef = pageTool({
  verb: 'find',
  summary: 'find every mounted instance of a React component',
  category: 'react',
  icon: 'react',
  label: {running: 'Finding components', done: 'Found components'},
  keywords: ['component', 'instances'],
  input: z.object({name: ComponentName}),
  output: z.looseObject({}),
})

export const overrideDef = pageTool({
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

export const trackDef = pageTool({
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

export const effectDef = pageTool({
  verb: 'effect',
  summary: 'enable, disable, toggle, report or list the visual effects the host page registered',
  category: 'act',
  icon: 'edit',
  label: {running: 'Driving an effect', done: 'Drove an effect'},
  hint: 'action list reports every registered effect and whether it is enabled',
  mutating: true,
  mirrors: true,
  capture: 'none',
  keywords: ['effects', 'overlay', 'highlight'],
  input: z.object({
    action: ActionEnum.optional(),
    effect: z.string().optional().describe('the registered effect to drive; action list shows what exists'),
  }),
  output: z.union([
    z.object({effect: z.string(), enabled: z.boolean()}),
    z.object({effects: z.array(z.object({name: z.string(), description: z.string(), enabled: z.boolean()}))}),
  ]),
  errors: {UNKNOWN_EFFECT: {message: 'no effect is registered under that name'}},
})

export const waitDef = pageTool({
  verb: 'wait',
  summary: 'wait until a selector becomes visible or hidden',
  category: 'act',
  icon: 'wait',
  label: {running: 'Waiting for the page', done: 'Waited for the page'},
  hint: 'only when the page needs to settle',
  keywords: ['until', 'appear'],
  input: z.object({
    selector: SelectorOnly,
    state: PageWaitStateSchema.optional().describe('state to wait for'),
    timeout: z.coerce.number().optional().describe('max wait in ms'),
  }),
  output: z.object({ok: z.literal(true), state: PageWaitStateSchema}),
})

export const reloadDef = pageTool({
  verb: 'reload',
  summary: 'reload the live page',
  category: 'act',
  icon: 'wait',
  label: {running: 'Reloading the page', done: 'Reloaded the page'},
  hint: 'returns the moment the reload is initiated, never a post-reload state; read the fresh page with page_snapshot once it is up',
  mutating: true,
  capture: 'none',
  keywords: ['refresh', 'navigate', 'location'],
  input: noInput,
  output: z.object({
    ok: z.literal(true),
    initiated: z
      .literal(true)
      .describe(
        'the reload has started; the navigation destroys the context this ran in, so no result from after the reload can come back',
      ),
  }),
})

export const clickDef = pageTool({
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

export const hoverDef = pageTool({
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

export const scrollDef = pageTool({
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

export const submitDef = pageTool({
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

export const fillDef = pageTool({
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

export const selectDef = pageTool({
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

export const checkDef = pageTool({
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

export const uncheckDef = pageTool({
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

export const pressDef = pageTool({
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

export const setattrDef = pageTool({
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

export const removeattrDef = pageTool({
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

export const addclassDef = pageTool({
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

export const removeclassDef = pageTool({
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

export const setstyleDef = pageTool({
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

export const settextDef = pageTool({
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

export const sethtmlDef = pageTool({
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

export const removeDef = pageTool({
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

export const insertDef = pageTool({
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

export const PAGE_TOOL_DEFS = [
  routeDef,
  domDef,
  queryDef,
  consoleDef,
  textDef,
  valueDef,
  attrDef,
  existsDef,
  snapshotDef,
  locateDef,
  treeDef,
  inspectDef,
  overrideDef,
  findDef,
  trackDef,
  effectDef,
  waitDef,
  reloadDef,
  clickDef,
  fillDef,
  selectDef,
  checkDef,
  uncheckDef,
  pressDef,
  hoverDef,
  scrollDef,
  submitDef,
  setattrDef,
  removeattrDef,
  addclassDef,
  removeclassDef,
  setstyleDef,
  settextDef,
  sethtmlDef,
  removeDef,
  insertDef,
  cssDef,
  evalDef,
] as const

export const PAGE_ACT_TOOL_NAMES: ReadonlySet<string> = new Set(
  PAGE_TOOL_DEFS.filter((def) => def.meta?.mutating === true).map((def) => def.name),
)

export function pageToolMetaOf(verb: string): ToolMeta | undefined {
  return PAGE_TOOL_DEFS.find((def) => def.name === `${PAGE_TOOL_PREFIX}${verb}`)?.meta
}

export function pageVerbGerund(verb: string): string {
  const running = pageToolMetaOf(verb)?.label?.running ?? ''
  const word = running.split(' ')[0] ?? ''
  return word.length > 0 ? word : verb
}

export function pageVerbMutates(verb: string): boolean {
  return pageToolMetaOf(verb)?.mutating === true
}

export function pageVerbMirrors(verb: string): boolean {
  return pageToolMetaOf(verb)?.mirrors === true
}
