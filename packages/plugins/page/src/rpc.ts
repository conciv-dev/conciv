export * as Page from './rpc.js'
import {z} from 'zod'
import {keyBy, mapValues} from 'es-toolkit'
import {Rpc} from '@conciv/plugin/rpc'
import {CODE_MODE_TIMEOUT_MS, SessionId} from '@conciv/protocol/chat-types'
import {PageCaptureBundleSchema, SessionCapturesSchema, type ToolCaptureMode} from './element-capture-types.js'
import {SourceLocSchema} from '@conciv/plugin/experimental/page'

export const PAGE_QUEUE_SYNC_MS = CODE_MODE_TIMEOUT_MS - 30_000
export const PAGE_QUEUE_MAX_ACTIONS = 50
export const PAGE_QUEUE_STOPPED = 'QUEUE_STOPPED'
export const PAGE_QUEUE_REFUSED = 'QUEUE_REFUSED'
export const PAGE_QUEUE_STOPPED_MESSAGE = 'stopped by the user before this action'

export const PAGE_REPORTED_ERROR_CODES = ['unknown-verb', 'invalid-args', 'handler-error'] as const
export const PAGE_TRANSPORT_ERROR_CODES = ['no-widget', 'timeout'] as const
export const PAGE_ERROR_CODES = [...PAGE_REPORTED_ERROR_CODES, ...PAGE_TRANSPORT_ERROR_CODES] as const
export type PageErrorCode = (typeof PAGE_ERROR_CODES)[number]
export const PageRaisedErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  data: z.unknown().optional(),
})
export type PageRaisedError = z.infer<typeof PageRaisedErrorSchema>

export const PageErrorSchema = z.object({
  code: z.enum(PAGE_REPORTED_ERROR_CODES),
  message: z.string(),
  raised: PageRaisedErrorSchema.optional(),
})
export type PageError = z.infer<typeof PageErrorSchema>

export type PageFailureError = {code: PageErrorCode; message: string; raised?: PageRaisedError}

export type PageFailure = Error & {readonly isPageFailure: true; error: PageFailureError}

export function pageFailure(code: PageErrorCode, message: string, raised?: PageRaisedError): PageFailure {
  const error: PageFailureError = raised === undefined ? {code, message} : {code, message, raised}
  return Object.assign(new Error(message), {isPageFailure: true as const, error})
}

export function isPageFailure(value: unknown): value is PageFailure {
  return value instanceof Error && 'isPageFailure' in value && value.isPageFailure === true
}

export type PageResult = Record<string, unknown>

export function ok(data: Record<string, unknown> = {}): PageResult {
  return {ok: true, ...data}
}

export const SymbolicateFrameSchema = z.object({
  fileName: z.string().min(1),
  line: z.number().int().min(1),
  column: z.number().int().min(0).optional(),
})
export const SymbolicateSchema = z.object({frames: z.array(SymbolicateFrameSchema).min(1).max(32)})

export const PageQueueOutcomeSchema = z.discriminatedUnion('ok', [
  z.object({index: z.number().int(), tool: z.string(), ok: z.literal(true), result: z.record(z.string(), z.unknown())}),
  z.object({index: z.number().int(), tool: z.string(), ok: z.literal(false), error: z.string()}),
])
export type PageQueueOutcome = z.infer<typeof PageQueueOutcomeSchema>

export const PageQueueResultSchema = z.object({
  queueId: z.string(),
  status: z.enum(['finished', 'stopped', 'lost']),
  outcomes: z.array(PageQueueOutcomeSchema),
  failed: z.number().int(),
  played: z.number().int(),
})
export type PageQueueResult = z.infer<typeof PageQueueResultSchema>

export const PageQueueHandleSchema = z.object({queueId: z.string(), actions: z.number().int()})
export type PageQueueHandle = z.infer<typeof PageQueueHandleSchema>

export const PageQueueProgressSchema = z.object({
  queueId: z.string(),
  status: z.literal('playing'),
  done: z.number().int(),
  of: z.number().int(),
})
export type PageQueueProgress = z.infer<typeof PageQueueProgressSchema>

export const PAGE_NAMESPACE = 'page'
export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_TEXT = 100_000
const text = z.string().max(MAX_TEXT)
export const SHORT_MAX = 2_048
const short = z.string().max(SHORT_MAX)
export const TabId = z.string().regex(/^tab_[a-f0-9-]{36}$/u)
export type TabId = z.infer<typeof TabId>
export const FileId = z.string().regex(/^file_[a-f0-9-]{36}$/u)
export type FileId = z.infer<typeof FileId>
const tab = {
  tabId: TabId.optional().describe(
    'Tab ID returned by page.tabs.list. Omit it for the tab the user focused last, which serves the call.',
  ),
}

export const GRAB_NOTE_ORIGIN = 'page'
const GRAB_HREF_PREFIX = 'page-grab:'
const MAX_PREVIEW_CHARACTERS = 1_400_000
export const GrabId = z.string().regex(/^grab_[a-f0-9-]{36}$/u)
export type GrabId = z.infer<typeof GrabId>
const GrabSource = z.object({componentName: short.nullable(), filePath: text, lineNumber: z.number().int().nullable()})
const GrabRect = z.object({x: z.number(), y: z.number(), width: z.number(), height: z.number()})
const GrabPreview = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('dom'),
    html: z.string().max(MAX_PREVIEW_CHARACTERS),
    width: z.number(),
    height: z.number(),
  }),
  z.object({
    kind: z.literal('image'),
    dataUrl: z.string().max(MAX_PREVIEW_CHARACTERS).startsWith('data:image/'),
    width: z.number(),
    height: z.number(),
  }),
])
export const StoredGrab = z.object({
  text,
  snippet: text.optional(),
  source: GrabSource.nullable(),
  rect: GrabRect.nullable(),
  preview: GrabPreview.nullable(),
})
export type StoredGrab = z.infer<typeof StoredGrab>

export function grabHref(id: GrabId): string {
  return `${GRAB_HREF_PREFIX}${id}`
}

export function readGrabId(href: string | undefined): GrabId[] {
  const parsed = GrabId.safeParse(href?.startsWith(GRAB_HREF_PREFIX) ? href.slice(GRAB_HREF_PREFIX.length) : undefined)
  return parsed.success ? [parsed.data] : []
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
export const PageChangeEntrySchema = z.object({
  seq: z.number(),
  ts: z.number(),
  verb: z.string(),
  ref: z.string().optional(),
  selector: z.string().optional(),
  args: AnyRecord,
})
export type PageChangeEntry = z.infer<typeof PageChangeEntrySchema>
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
      source: SourceLocSchema.nullish(),
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
    reading,
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
const [firstOperation, ...otherOperations] = Operations
export const Action = z.discriminatedUnion('type', [
  firstOperation.action,
  ...otherOperations.map((entry) => entry.action),
])
export type Action = z.infer<typeof Action>
export const Operated = z.object({
  type: z.literal('operation'),
  name: short.min(1).describe('the page operation another plugin registered in the tab'),
  input: z.json(),
})
export type Operated = z.infer<typeof Operated>
const Work = z.discriminatedUnion('type', [Action, Operated])
export type Work = z.infer<typeof Work>
export const Target = z.object({resources: z.array(text), key: text})
export type Target = z.infer<typeof Target>
export const Command = z.object({
  action: Work,
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
export type PageCommand = Omit<Command, 'action'> & {readonly action: Action}
export const Result = z.object({value: z.json(), files: z.array(File), capture: PageCaptureBundleSchema.optional()})
export type Result = z.infer<typeof Result>
export const Outcome = z.discriminatedUnion('type', [
  z.object({type: z.literal('success'), result: Result}),
  z.object({
    type: z.literal('failure'),
    code: short,
    message: short,
    raised: PageRaisedErrorSchema.optional(),
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
      errors: {...errors, missing: z.object({}), transient: z.object({})},
    },
    state: {input: z.object({...attachment, state: Tab}), output: z.void(), errors},
    command: {input: z.object(request), output: Command, errors},
    result: {input: z.object({...request, outcome: Outcome}), output: z.void(), errors},
    operate: {
      input: z.object({
        sessionId: SessionId,
        tabId: TabId.optional(),
        name: Operated.shape.name,
        input: z.json(),
        reading: z
          .boolean()
          .describe('a reading call is sent again once when its tab reloads; a changing call never is'),
      }),
      output: z.json(),
      errors: {
        ...errors,
        tab_gone: z.object({dispatched: z.boolean()}),
        failed: z.object({code: short, raised: PageRaisedErrorSchema.optional()}),
      },
    },
    'hmr.wait': {
      input: z.object({sessionId: SessionId, ...hotUpdate}),
      output: z.object({applied: z.boolean(), waitedMs: z.number()}),
      errors,
    },
    'captures.list': {input: z.object({sessionId: SessionId}), output: SessionCapturesSchema, errors},
    'grabs.save': {input: z.object({grab: StoredGrab}), output: z.object({id: GrabId}), errors},
    'grabs.get': {input: z.object({id: GrabId}), output: StoredGrab.nullable(), errors},
    'sessions.attached': {input: z.object({}), output: z.array(SessionId), errors},
    'tabs.list': {input: z.object({sessionId: SessionId}), output: State, errors},
    symbolicate: {input: SymbolicateSchema, output: SourceLocSchema.nullable(), errors},
    'queue.wait': {
      input: z.object({sessionId: SessionId, queueId: z.string().min(1), waitMs: z.number().int().min(0)}),
      output: z.union([
        PageQueueResultSchema.extend({
          notice: z.string().describe('the finished queue in one line plus its result, as the session would read it'),
        }),
        PageQueueProgressSchema,
      ]),
      errors,
    },
    'queue.outside': {
      input: z.object({sessionId: SessionId, toolCallIds: z.array(z.string())}),
      output: z.object({
        queued: z.array(PageQueueHandleSchema),
        finished: z.array(z.object({result: PageQueueResultSchema, notice: z.string()})),
      }),
      errors,
    },
  },
  events: {
    control: {schema: Control},
    'captures.saved': {schema: z.object({sessionId: SessionId})},
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

export type CliEntry = {
  readonly asks: ((input: unknown) => AskedPermission) | undefined
}

export type AskedPermission = {readonly action: string; readonly resources: readonly string[]}

export const CliTools: Readonly<Record<string, CliEntry>> = mapValues(
  keyBy(Operations, (entry) => entry.name),
  (entry): CliEntry => ({
    asks:
      entry.name === 'eval'
        ? (input: unknown): AskedPermission => ({action: 'page_eval', resources: [entry.input.parse(input).code]})
        : undefined,
  }),
)

type NamedOperation<Name extends Method> = Extract<Operation, {readonly name: Name}>

export const PAGE_TOOL_PREFIX = `${PAGE_NAMESPACE}_`

export const PAGE_ACT_TOOL_NAMES: ReadonlySet<string> = new Set(
  Operations.filter((operation) => operation.mutating).map((operation) => `${PAGE_TOOL_PREFIX}${operation.name}`),
)

export function pageOperation<const Name extends Method>(name: Name): NamedOperation<Name> {
  const operation = Operations.find((candidate): candidate is NamedOperation<Name> => candidate.name === name)
  if (operation === undefined) throw new Error(`No page operation is named ${name}`)
  return operation
}

export function pageVerbOfTool(name: string): string {
  if (!name.startsWith(PAGE_TOOL_PREFIX)) throw new Error(`"${name}" is not a page tool`)
  return name.slice(PAGE_TOOL_PREFIX.length)
}
