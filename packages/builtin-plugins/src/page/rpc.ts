import {z} from 'zod'
import {Rpc} from '@conciv/plugin/rpc'
import {SessionId} from '@conciv/protocol/chat-types'
import {
  PageCaptureBundleSchema,
  SessionCapturesSchema,
  type ToolCaptureMode,
} from '@conciv/protocol/element-capture-types'
import {
  PAGE_QUEUE_MAX_ACTIONS,
  PageChangeEntrySchema,
  PageQueueHandleSchema,
  PageQueueProgressSchema,
  PageQueueResultSchema,
} from '@conciv/protocol/page-types'

export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_TEXT = 100_000
const text = z.string().max(MAX_TEXT)
const short = z.string().max(2_048)
export const TabId = z.string().regex(/^tab_[a-f0-9-]{36}$/u)
export type TabId = z.infer<typeof TabId>
export const FileId = z.string().regex(/^file_[a-f0-9-]{36}$/u)
export type FileId = z.infer<typeof FileId>
const tab = {
  tabId: TabId.optional().describe(
    'Tab ID returned by page.tabs.list. Omit it for the tab the user focused last, which serves the call.',
  ),
}

export const Tab = z.object({
  id: TabId,
  url: z.string().max(16_384),
  title: short,
  focused: z.boolean(),
  visible: z.boolean(),
})
export type Tab = z.infer<typeof Tab>
export const State = z.object({tabs: z.array(Tab), focusedTabId: TabId.nullable()})
export type State = z.infer<typeof State>
const FileInfo = z.object({id: FileId, name: short, mime: short, bytes: z.number().int().min(0), path: z.string()})
export const File = z.object({
  id: FileId,
  name: short,
  mime: short,
  data: z.codec(
    z.base64(),
    z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength <= MAX_FILE_BYTES),
    {decode: (data) => z.util.base64ToUint8Array(data), encode: (bytes) => z.util.uint8ArrayToBase64(bytes)},
  ),
})
export type File = z.infer<typeof File>

const PagePositionSchema = z.enum(['before', 'after', 'prepend', 'append'])
const PageWaitStateSchema = z.enum(['visible', 'hidden'])
const AnyRecord = z.record(z.string(), z.unknown())
const OkResult = z.object({ok: z.literal(true)})
const ElementTarget = {
  selector: z.string().optional().describe('CSS selector for the target element'),
  ref: z.string().optional().describe('element ref from the latest snapshot'),
  name: z.string().optional().describe('React component name (targets the first match)'),
}
const SelectorOnly = z.string().optional().describe('CSS selector for the target element')
const AttributeName = z.string().describe('attribute name, e.g. href or data-state')
const ComponentName = z.string().describe('React component name')
const CssClass = z.string().describe('class name to add or remove')
const ActionEnum = z
  .enum(['start', 'stop', 'report', 'enable', 'disable', 'toggle', 'list'])
  .describe('what to do: start, stop, report, enable, disable, toggle, list')
const HOT_UPDATE_WAIT_MS = 5000
const HotUpdateWaitSchema = z.object({
  supported: z.boolean(),
  applied: z.boolean(),
  waitedMs: z.number(),
  error: z.string().nullable(),
})
const hotUpdate = {
  timeout: z.coerce
    .number()
    .int()
    .positive()
    .default(HOT_UPDATE_WAIT_MS)
    .describe('max wait in ms for a pending update'),
}
const fill = {...ElementTarget, value: z.string().describe('the value to type into the field')}
const select = {...ElementTarget, value: z.string().describe('the option value, or its visible label, to choose')}
const press = {...ElementTarget, key: z.string().describe('a key or a hotkey binding, e.g. Enter or Mod+Shift+X')}

function queued<const Name extends string, const Fields extends z.ZodRawShape>(name: Name, fields: Fields) {
  return z.object({...fields, tool: z.literal(name)})
}

const PageQueueActionSchema = z.discriminatedUnion('tool', [
  queued('page_click', ElementTarget),
  queued('page_hover', ElementTarget),
  queued('page_fill', fill),
  queued('page_select', select),
  queued('page_check', ElementTarget),
  queued('page_uncheck', ElementTarget),
  queued('page_press', press),
  queued('page_scroll', ElementTarget),
])
const queueActions = {
  actions: z
    .array(PageQueueActionSchema)
    .min(1)
    .max(PAGE_QUEUE_MAX_ACTIONS, `a queue holds at most ${PAGE_QUEUE_MAX_ACTIONS} actions; split the list`)
    .describe(
      'the actions to play in order, each {tool, ...that tool input}: page_click, page_hover, page_fill, page_select, page_check, page_uncheck, page_press, page_scroll',
    ),
}

type Traits = {readonly mutating: boolean; readonly capture: ToolCaptureMode}
const reading: Traits = {mutating: false, capture: 'none'}
const acting: Traits = {mutating: true, capture: 'after'}
const editing: Traits = {mutating: true, capture: 'before-after'}
const uncaptured: Traits = {mutating: true, capture: 'none'}

function operation<const Name extends string, const Fields extends z.ZodRawShape, Output extends z.ZodType>(
  name: Name,
  description: string,
  fields: Fields,
  output: Output,
  traits: Traits,
) {
  return {
    name,
    description,
    input: z.object(fields),
    output,
    action: z.object({type: z.literal(name), ...fields}),
    mutating: traits.mutating,
    capture: traits.capture,
  }
}

export const Operations = [
  operation(
    'tabs.list',
    "List this session's browser tabs and the tab the user focused last. A call without a tabId goes to that tab.",
    {},
    State,
    reading,
  ),
  operation(
    'route',
    'report the current url of the live page',
    tab,
    z.object({
      pathname: z.string(),
      search: z.string(),
      href: z.string(),
      title: z.string(),
      state: z.enum(['visible', 'hidden']),
    }),
    reading,
  ),
  operation(
    'dom',
    'return the outer HTML of an element or of the whole body',
    {...tab, ...ElementTarget},
    z.object({html: z.string()}),
    reading,
  ),
  operation(
    'query',
    'describe every element matching a selector',
    {...tab, selector: SelectorOnly},
    z.object({count: z.number(), elements: z.array(AnyRecord)}),
    reading,
  ),
  operation(
    'console',
    'read the buffered browser console output',
    {...tab, since: z.coerce.number().optional().describe('only logs after this timestamp (ms)')},
    z.object({entries: z.array(z.object({level: z.string(), ts: z.number(), text: z.string()}))}),
    reading,
  ),
  operation(
    'text',
    'read the visible text of an element',
    {...tab, ...ElementTarget},
    z.object({text: z.string()}),
    reading,
  ),
  operation(
    'value',
    'read the current value of a form field',
    {...tab, ...ElementTarget},
    z.object({value: z.string().nullable()}),
    reading,
  ),
  operation(
    'attr',
    'read one attribute of an element',
    {...tab, ...ElementTarget, attribute: AttributeName},
    z.object({value: z.string().nullable()}),
    reading,
  ),
  operation(
    'exists',
    'report whether a selector matches anything',
    {...tab, selector: SelectorOnly},
    z.object({exists: z.boolean(), count: z.number()}),
    reading,
  ),
  operation(
    'snapshot',
    'read every control on the page with its current value, checked state and ref',
    {...tab, selector: SelectorOnly},
    z.object({nodes: z.array(AnyRecord)}),
    reading,
  ),
  operation(
    'screenshot',
    'capture the visible viewport as a webp image',
    {
      ...tab,
      exclude: z
        .array(z.string())
        .optional()
        .describe(
          'CSS selectors for host-page elements to leave out of the image, such as a devtools button; conciv UI is always left out, and a selector the page cannot read is skipped with a warning',
        ),
    },
    z.object({
      width: z.number(),
      height: z.number(),
      warnings: z.array(z.string()).optional(),
      files: z.array(FileInfo),
    }),
    reading,
  ),
  operation(
    'hmr',
    'after editing a file, wait for the hot update to land before reading the page',
    {...tab, ...hotUpdate},
    HotUpdateWaitSchema,
    reading,
  ),
  operation(
    'locate',
    'find the source location that rendered an element',
    {...tab, ...ElementTarget},
    z.looseObject({
      component: z.string().nullable().optional(),
      stack: z.array(z.string()).optional(),
      frames: z.array(AnyRecord).optional(),
      source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullish(),
    }),
    reading,
  ),
  operation(
    'tree',
    'walk the live React tree under an element',
    {...tab, ...ElementTarget},
    z.looseObject({}),
    reading,
  ),
  operation(
    'inspect',
    'read props, state, hooks and context of a live component',
    {...tab, ...ElementTarget, path: z.string().optional().describe('dot-path to drill into, e.g. props.user.address')},
    z.looseObject({component: z.string().nullable().optional()}),
    reading,
  ),
  operation(
    'override',
    'patch props, state, hooks or context on a live component',
    {
      ...tab,
      ...ElementTarget,
      target: z.enum(['props', 'state', 'hooks', 'context']).describe('which slice to override'),
      path: z.string().optional().describe('dot-path inside the slice, e.g. user.address'),
      hookId: z.coerce.number().optional().describe('hook id from inspect (for --target hooks)'),
      json: z.string().optional().describe('new value as JSON, e.g. true or {"a":1}'),
    },
    z.looseObject({ok: z.literal(true), target: z.string(), path: z.string()}),
    uncaptured,
  ),
  operation(
    'find',
    'find every mounted instance of a React component',
    {...tab, name: ComponentName},
    z.looseObject({}),
    reading,
  ),
  operation(
    'track',
    'record and report React re-renders',
    {...tab, action: ActionEnum.optional(), name: ComponentName.optional()},
    z.looseObject({}),
    reading,
  ),
  operation(
    'effect',
    'enable, disable, toggle, report or list the visual effects the host page registered',
    {
      ...tab,
      action: ActionEnum.optional(),
      effect: z.string().optional().describe('the registered effect to drive; action list shows what exists'),
    },
    z.union([
      z.object({effect: z.string(), enabled: z.boolean()}),
      z.object({effects: z.array(z.object({name: z.string(), description: z.string(), enabled: z.boolean()}))}),
    ]),
    uncaptured,
  ),
  operation(
    'wait',
    'wait until a selector becomes visible or hidden',
    {
      ...tab,
      selector: SelectorOnly,
      state: PageWaitStateSchema.optional().describe('state to wait for'),
      timeout: z.coerce.number().optional().describe('max wait in ms'),
    },
    z.object({ok: z.literal(true), state: PageWaitStateSchema}),
    {mutating: false, capture: 'after'},
  ),
  operation(
    'reload',
    'reload the live page',
    tab,
    z.object({
      ok: z.literal(true),
      initiated: z
        .literal(true)
        .describe(
          'the reload has started; the navigation destroys the context this ran in, so no result from after the reload can come back',
        ),
    }),
    uncaptured,
  ),
  operation('click', 'click an element', {...tab, ...ElementTarget}, OkResult, acting),
  operation(
    'fill',
    'type a value into a form field',
    {...tab, ...fill},
    z.object({ok: z.literal(true), value: z.string()}),
    acting,
  ),
  operation(
    'fill_form',
    'fill several fields in order: text uses fill, select chooses an option by value or visible label, check sets checked',
    {
      ...tab,
      fields: z
        .array(
          z.discriminatedUnion('type', [
            z.object({...ElementTarget, type: z.literal('text'), value: z.string()}),
            z.object({...ElementTarget, type: z.literal('select'), value: z.string()}),
            z.object({...ElementTarget, type: z.literal('check'), checked: z.boolean()}),
          ]),
        )
        .max(100),
    },
    OkResult,
    acting,
  ),
  operation(
    'select',
    'choose an option in a select element',
    {...tab, ...select},
    z.object({ok: z.literal(true), value: z.string()}),
    acting,
  ),
  operation(
    'check',
    'check a checkbox or radio',
    {...tab, ...ElementTarget},
    z.object({ok: z.literal(true), checked: z.boolean()}),
    acting,
  ),
  operation(
    'uncheck',
    'uncheck a checkbox',
    {...tab, ...ElementTarget},
    z.object({ok: z.literal(true), checked: z.boolean()}),
    acting,
  ),
  operation('press', 'send a key to an element', {...tab, ...press}, OkResult, acting),
  operation('hover', 'hover the pointer over an element', {...tab, ...ElementTarget}, OkResult, acting),
  operation('scroll', 'scroll an element into view', {...tab, ...ElementTarget}, OkResult, acting),
  operation('submit', 'submit the form owning an element', {...tab, ...ElementTarget}, OkResult, acting),
  operation(
    'queue',
    'play a list of page actions in order with the pointer and return every outcome',
    {...tab, ...queueActions},
    z.union([PageQueueResultSchema, PageQueueProgressSchema]),
    uncaptured,
  ),
  operation(
    'queue_async',
    'queue a list of page actions the page plays in order with the pointer, answering at once',
    {...tab, ...queueActions},
    PageQueueHandleSchema.describe('the queue id and how many actions the page accepted'),
    uncaptured,
  ),
  operation(
    'setattr',
    'set an attribute on an element',
    {...tab, ...ElementTarget, attribute: AttributeName, value: z.string().describe('the attribute value to set')},
    OkResult,
    editing,
  ),
  operation(
    'removeattr',
    'remove an attribute from an element',
    {...tab, ...ElementTarget, attribute: AttributeName},
    OkResult,
    editing,
  ),
  operation('addclass', 'add a class to an element', {...tab, ...ElementTarget, class: CssClass}, OkResult, editing),
  operation(
    'removeclass',
    'remove a class from an element',
    {...tab, ...ElementTarget, class: CssClass},
    OkResult,
    editing,
  ),
  operation(
    'setstyle',
    'set one inline style property on an element',
    {
      ...tab,
      ...ElementTarget,
      prop: z.string().describe('CSS property name, e.g. color or font-size'),
      value: z.string().describe('the CSS value to set'),
    },
    OkResult,
    editing,
  ),
  operation(
    'settext',
    'replace the text content of an element',
    {...tab, ...ElementTarget, text: z.string().describe('the text to set')},
    OkResult,
    editing,
  ),
  operation(
    'sethtml',
    'replace the inner HTML of an element',
    {...tab, ...ElementTarget, html: z.string().describe('the HTML fragment to set')},
    OkResult,
    editing,
  ),
  operation('remove', 'remove an element from the page', {...tab, ...ElementTarget}, OkResult, editing),
  operation(
    'insert',
    'insert an HTML fragment around an element',
    {
      ...tab,
      ...ElementTarget,
      html: z.string().describe('the HTML fragment to insert'),
      position: PagePositionSchema.optional().describe('where to insert it'),
    },
    OkResult,
    editing,
  ),
  operation(
    'css',
    'inject a stylesheet into the live page',
    {...tab, text: z.string().describe('the full stylesheet string')},
    OkResult,
    editing,
  ),
  operation(
    'eval',
    'run javascript in the page and return its result',
    {...tab, code: z.string().describe('javascript to run in the page, awaited')},
    z.object({result: z.unknown()}),
    editing,
  ),
] as const

export type Operation = (typeof Operations)[number]
export type Method = Operation['name']
export const Action = z.union(Operations.map((entry) => entry.action))
export type Action = z.infer<typeof Action>
export const Target = z.object({resources: z.array(text), key: text})
export type Target = z.infer<typeof Target>
export const Command = z.object({
  action: Action,
  agentId: z.string().min(1).describe('the agent the page call acts for; keys its cursor on the page'),
  timeoutMs: z.number().int().positive().describe("the call's own timeout: its input timeout plus a second, else 5 s"),
  inspect: z.boolean().optional(),
  target: Target.optional(),
  queued: z
    .object({id: z.string().min(1), index: z.number().int().min(-1), of: z.number().int().min(0)})
    .optional()
    .describe('the queue this command plays in: index -1 is its acceptance, 0 to of - 1 its actions'),
})
export type Command = z.infer<typeof Command>
export const Result = z.object({value: z.json(), files: z.array(File), capture: PageCaptureBundleSchema.optional()})
export type Result = z.infer<typeof Result>
export const Outcome = z.discriminatedUnion('type', [
  z.object({type: z.literal('success'), result: Result}),
  z.object({
    type: z.literal('failure'),
    code: short,
    message: short,
    raised: z.object({code: z.string().min(1), message: z.string(), data: z.unknown().optional()}).optional(),
  }),
])
export type Outcome = z.infer<typeof Outcome>
const attachment = {sessionId: SessionId, connectionId: z.string()}
const request = {...attachment, requestId: z.string()}
const errors = {unavailable: z.object({})}
export const Control = z.discriminatedUnion('type', [
  z.object({type: z.literal('attached'), connectionId: z.string(), version: z.literal(1)}),
  z.object({type: z.literal('command'), connectionId: z.string(), requestId: z.string()}),
  z.object({type: z.literal('cancel'), connectionId: z.string(), requestId: z.string()}),
])
export type Control = z.infer<typeof Control>
export const Definition = Rpc.define({
  id: 'experimental.page',
  methods: {
    attach: {
      input: z.object({...attachment, version: z.literal(1)}),
      output: z.enum(['closed', 'replaced']),
      errors,
    },
    state: {input: z.object({...attachment, state: Tab}), output: z.void(), errors},
    command: {input: z.object(request), output: Command, errors},
    result: {input: z.object({...request, outcome: Outcome}), output: z.void(), errors},
    'hmr.wait': {
      input: z.object({sessionId: SessionId, ...hotUpdate}),
      output: z.object({applied: z.boolean(), waitedMs: z.number()}),
      errors,
    },
    changes: {input: z.object({sessionId: SessionId}), output: z.array(PageChangeEntrySchema), errors},
    clearChanges: {input: z.object({sessionId: SessionId}), output: OkResult, errors},
    'captures.list': {input: z.object({sessionId: SessionId}), output: SessionCapturesSchema, errors},
    'queue.wait': {
      input: z.object({sessionId: SessionId, queueId: z.string().min(1), waitMs: z.number().int().min(0)}),
      output: z.union([PageQueueResultSchema, PageQueueProgressSchema]),
      errors,
    },
    'queue.startedBy': {
      input: z.object({sessionId: SessionId, toolCallIds: z.array(z.string())}),
      output: z.array(PageQueueHandleSchema),
      errors,
    },
    'queue.undelivered': {
      input: z.object({
        sessionId: SessionId,
        toolCallIds: z.array(z.string()).optional(),
        excludeToolCallIds: z.array(z.string()).optional(),
      }),
      output: z.array(PageQueueResultSchema),
      errors,
    },
    'queue.owed': {
      input: z.object({sessionId: SessionId, excludeToolCallIds: z.array(z.string()), claim: z.boolean()}),
      output: z.array(
        z.object({
          queueId: z.string(),
          toolCallId: z.string(),
          result: PageQueueResultSchema,
          before: z.enum(['owed', 'nextReply']),
        }),
      ),
      errors,
    },
    'queue.settle': {
      input: z.object({
        sessionId: SessionId,
        queueIds: z.array(z.string()),
        delivery: z.enum(['owed', 'nextReply', 'delivered']),
      }),
      output: OkResult,
      errors,
    },
  },
  events: {
    control: {schema: Control},
    'queue.finished': {
      schema: z.object({
        sessionId: SessionId,
        queueId: z.string(),
        toolCallId: z.string(),
        result: PageQueueResultSchema,
      }),
    },
  },
})
