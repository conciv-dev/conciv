import {z} from 'zod'
import type {ToolCaptureMode} from '@conciv/protocol/element-capture-types'
import {
  PAGE_QUEUE_ASYNC_TOOL,
  PAGE_QUEUE_MAX_ACTIONS,
  PageQueueHandleSchema,
  PageQueueProgressSchema,
  PageQueueResultSchema,
} from '@conciv/protocol/page-types'

const PAGE_TOOL_PREFIX = 'page_'

export function readPageVerb(name: string): string {
  if (!name.startsWith(PAGE_TOOL_PREFIX)) throw new Error(`"${name}" is not a page tool`)
  return name.slice(PAGE_TOOL_PREFIX.length)
}

type PageToolCategory = 'read' | 'act' | 'edit-live' | 'react'

const CAPTURE_BY_CATEGORY: Record<PageToolCategory, ToolCaptureMode> = {
  read: 'none',
  react: 'none',
  act: 'after',
  'edit-live': 'before-after',
}

function pageTool<Shape extends z.ZodRawShape, Out extends z.ZodType>(spec: {
  verb: string
  category: PageToolCategory
  input: z.ZodObject<Shape>
  output: Out
  mutating?: boolean
  capture?: ToolCaptureMode
}) {
  return {
    name: `${PAGE_TOOL_PREFIX}${spec.verb}`,
    inputSchema: spec.input,
    outputSchema: spec.output,
    meta: {mutating: spec.mutating ?? false, capture: spec.capture ?? CAPTURE_BY_CATEGORY[spec.category]},
  }
}

const PagePositionSchema = z.enum(['before', 'after', 'prepend', 'append'])
const PageWaitStateSchema = z.enum(['visible', 'hidden'])

const AnyRecord = z.record(z.string(), z.unknown())

const OkResult = z.object({ok: z.literal(true)})

const ElementTarget = {
  selector: z.string().optional().describe('CSS selector for the target element'),
  ref: z.string().optional().describe('element ref from the latest snapshot'),
  name: z.string().optional().describe('React component name (targets the first match)'),
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

const routeDef = pageTool({
  verb: 'route',
  category: 'read',
  input: noInput,
  output: z.object({
    pathname: z.string(),
    search: z.string(),
    href: z.string(),
    title: z.string(),
    state: z.enum(['visible', 'hidden']),
  }),
})

const domDef = pageTool({
  verb: 'dom',
  category: 'read',
  input: target,
  output: z.object({html: z.string()}),
})

const queryDef = pageTool({
  verb: 'query',
  category: 'read',
  input: z.object({selector: SelectorOnly}),
  output: z.object({count: z.number(), elements: z.array(AnyRecord)}),
})

const consoleDef = pageTool({
  verb: 'console',
  category: 'read',
  input: z.object({since: z.coerce.number().optional().describe('only logs after this timestamp (ms)')}),
  output: z.object({entries: z.array(z.object({level: z.string(), ts: z.number(), text: z.string()}))}),
})

const textDef = pageTool({
  verb: 'text',
  category: 'read',
  input: target,
  output: z.object({text: z.string()}),
})

const valueDef = pageTool({
  verb: 'value',
  category: 'read',
  input: target,
  output: z.object({value: z.string().nullable()}),
})

const attrDef = pageTool({
  verb: 'attr',
  category: 'read',
  input: z.object({...ElementTarget, attribute: AttributeName}),
  output: z.object({value: z.string().nullable()}),
})

const existsDef = pageTool({
  verb: 'exists',
  category: 'read',
  input: z.object({selector: SelectorOnly}),
  output: z.object({exists: z.boolean(), count: z.number()}),
})

const snapshotDef = pageTool({
  verb: 'snapshot',
  category: 'read',
  input: z.object({selector: SelectorOnly}),
  output: z.object({nodes: z.array(AnyRecord)}),
})

const ImagePart = z.object({type: z.literal('image')}).loose()

const ImageDetailPart = z.object({type: z.literal('text'), content: z.string()}).loose()

const screenshotDef = pageTool({
  verb: 'screenshot',
  category: 'read',
  input: z.object({
    exclude: z
      .array(z.string())
      .optional()
      .describe(
        'CSS selectors for host-page elements to leave out of the image, such as a devtools button; conciv UI is always left out, and a selector the page cannot read is skipped with a warning',
      ),
  }),
  output: z.array(z.union([ImagePart, ImageDetailPart])),
})

const HOT_UPDATE_WAIT_MS = 5000

const HotUpdateWaitSchema = z.object({
  supported: z.boolean(),
  applied: z.boolean(),
  waitedMs: z.number(),
  error: z.string().nullable(),
})

const hmrDef = pageTool({
  verb: 'hmr',
  category: 'read',
  input: z.object({
    timeout: z.coerce
      .number()
      .int()
      .positive()
      .default(HOT_UPDATE_WAIT_MS)
      .describe('max wait in ms for a pending update'),
  }),
  output: HotUpdateWaitSchema,
})

const cssDef = pageTool({
  verb: 'css',
  category: 'edit-live',
  mutating: true,
  input: z.object({text: z.string().describe('the full stylesheet string')}),
  output: OkResult,
})

const evalDef = pageTool({
  verb: 'eval',
  category: 'edit-live',
  mutating: true,
  input: z.object({code: z.string().describe('javascript to run in the page, awaited')}),
  output: z.object({result: z.unknown()}),
})

const locateDef = pageTool({
  verb: 'locate',
  category: 'react',
  input: target,
  output: z.looseObject({
    component: z.string().nullable().optional(),
    stack: z.array(z.string()).optional(),
    frames: z.array(AnyRecord).optional(),
    source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullish(),
  }),
})

const inspectDef = pageTool({
  verb: 'inspect',
  category: 'react',
  input: z.object({
    ...ElementTarget,
    path: z.string().optional().describe('dot-path to drill into, e.g. props.user.address'),
  }),
  output: z.looseObject({component: z.string().nullable().optional()}),
})

const treeDef = pageTool({
  verb: 'tree',
  category: 'react',
  input: target,
  output: z.looseObject({}),
})

const findDef = pageTool({
  verb: 'find',
  category: 'react',
  input: z.object({name: ComponentName}),
  output: z.looseObject({}),
})

const overrideDef = pageTool({
  verb: 'override',
  category: 'react',
  mutating: true,
  input: z.object({
    ...ElementTarget,
    target: z.enum(['props', 'state', 'hooks', 'context']).describe('which slice to override'),
    path: z.string().optional().describe('dot-path inside the slice, e.g. user.address'),
    hookId: z.coerce.number().optional().describe('hook id from inspect (for --target hooks)'),
    json: z.string().optional().describe('new value as JSON, e.g. true or {"a":1}'),
  }),
  output: z.looseObject({ok: z.literal(true), target: z.string(), path: z.string()}),
})

const trackDef = pageTool({
  verb: 'track',
  category: 'react',
  input: z.object({
    action: ActionEnum.optional(),
    name: ComponentName.optional(),
  }),
  output: z.looseObject({}),
})

const effectDef = pageTool({
  verb: 'effect',
  category: 'act',
  mutating: true,
  capture: 'none',
  input: z.object({
    action: ActionEnum.optional(),
    effect: z.string().optional().describe('the registered effect to drive; action list shows what exists'),
  }),
  output: z.union([
    z.object({effect: z.string(), enabled: z.boolean()}),
    z.object({effects: z.array(z.object({name: z.string(), description: z.string(), enabled: z.boolean()}))}),
  ]),
})

const waitDef = pageTool({
  verb: 'wait',
  category: 'act',
  input: z.object({
    selector: SelectorOnly,
    state: PageWaitStateSchema.optional().describe('state to wait for'),
    timeout: z.coerce.number().optional().describe('max wait in ms'),
  }),
  output: z.object({ok: z.literal(true), state: PageWaitStateSchema}),
})

const reloadDef = pageTool({
  verb: 'reload',
  category: 'act',
  mutating: true,
  capture: 'none',
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

const clickDef = pageTool({
  verb: 'click',
  category: 'act',
  mutating: true,
  input: target,
  output: OkResult,
})

const hoverDef = pageTool({
  verb: 'hover',
  category: 'act',
  mutating: true,
  input: target,
  output: OkResult,
})

const scrollDef = pageTool({
  verb: 'scroll',
  category: 'act',
  mutating: true,
  input: target,
  output: OkResult,
})

const submitDef = pageTool({
  verb: 'submit',
  category: 'act',
  mutating: true,
  input: target,
  output: OkResult,
})

const fillDef = pageTool({
  verb: 'fill',
  category: 'act',
  mutating: true,
  input: z.object({...ElementTarget, value: z.string().describe('the value to type into the field')}),
  output: z.object({ok: z.literal(true), value: z.string()}),
})

const selectDef = pageTool({
  verb: 'select',
  category: 'act',
  mutating: true,
  input: z.object({...ElementTarget, value: z.string().describe('the option value, or its visible label, to choose')}),
  output: z.object({ok: z.literal(true), value: z.string()}),
})

const checkDef = pageTool({
  verb: 'check',
  category: 'act',
  mutating: true,
  input: target,
  output: z.object({ok: z.literal(true), checked: z.boolean()}),
})

const uncheckDef = pageTool({
  verb: 'uncheck',
  category: 'act',
  mutating: true,
  input: target,
  output: z.object({ok: z.literal(true), checked: z.boolean()}),
})

const pressDef = pageTool({
  verb: 'press',
  category: 'act',
  mutating: true,
  input: z.object({...ElementTarget, key: z.string().describe('a key or a hotkey binding, e.g. Enter or Mod+Shift+X')}),
  output: OkResult,
})

function queued<Name extends string, Shape extends z.ZodRawShape>(def: {name: Name; inputSchema: z.ZodObject<Shape>}) {
  return def.inputSchema.extend({tool: z.literal(def.name)})
}

const PageQueueActionSchema = z.discriminatedUnion('tool', [
  queued(clickDef),
  queued(hoverDef),
  queued(fillDef),
  queued(selectDef),
  queued(checkDef),
  queued(uncheckDef),
  queued(pressDef),
  queued(scrollDef),
])

const QueueActionsInput = z.object({
  actions: z
    .array(PageQueueActionSchema)
    .min(1)
    .max(PAGE_QUEUE_MAX_ACTIONS, `a queue holds at most ${PAGE_QUEUE_MAX_ACTIONS} actions; split the list`)
    .describe(
      'the actions to play in order, each {tool, ...that tool input}: page_click, page_hover, page_fill, page_select, page_check, page_uncheck, page_press, page_scroll',
    ),
})

const queueDef = pageTool({
  verb: readPageVerb('page_queue'),
  category: 'act',
  mutating: true,
  capture: 'none',
  input: QueueActionsInput,
  output: z.union([PageQueueResultSchema, PageQueueProgressSchema]),
})

const queueAsyncDef = pageTool({
  verb: readPageVerb(PAGE_QUEUE_ASYNC_TOOL),
  category: 'act',
  mutating: true,
  capture: 'none',
  input: QueueActionsInput,
  output: PageQueueHandleSchema.describe('the queue id and how many actions the page accepted'),
})

const setattrDef = pageTool({
  verb: 'setattr',
  category: 'edit-live',
  mutating: true,
  input: z.object({
    ...ElementTarget,
    attribute: AttributeName,
    value: z.string().describe('the attribute value to set'),
  }),
  output: OkResult,
})

const removeattrDef = pageTool({
  verb: 'removeattr',
  category: 'edit-live',
  mutating: true,
  input: z.object({...ElementTarget, attribute: AttributeName}),
  output: OkResult,
})

const addclassDef = pageTool({
  verb: 'addclass',
  category: 'edit-live',
  mutating: true,
  input: z.object({...ElementTarget, class: ClassName}),
  output: OkResult,
})

const removeclassDef = pageTool({
  verb: 'removeclass',
  category: 'edit-live',
  mutating: true,
  input: z.object({...ElementTarget, class: ClassName}),
  output: OkResult,
})

const setstyleDef = pageTool({
  verb: 'setstyle',
  category: 'edit-live',
  mutating: true,
  input: z.object({
    ...ElementTarget,
    prop: z.string().describe('CSS property name, e.g. color or font-size'),
    value: z.string().describe('the CSS value to set'),
  }),
  output: OkResult,
})

const settextDef = pageTool({
  verb: 'settext',
  category: 'edit-live',
  mutating: true,
  input: z.object({...ElementTarget, text: z.string().describe('the text to set')}),
  output: OkResult,
})

const sethtmlDef = pageTool({
  verb: 'sethtml',
  category: 'edit-live',
  mutating: true,
  input: z.object({...ElementTarget, html: z.string().describe('the HTML fragment to set')}),
  output: OkResult,
})

const removeDef = pageTool({
  verb: 'remove',
  category: 'edit-live',
  mutating: true,
  input: target,
  output: OkResult,
})

const insertDef = pageTool({
  verb: 'insert',
  category: 'edit-live',
  mutating: true,
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
  screenshotDef,
  hmrDef,
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
  queueDef,
  queueAsyncDef,
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
