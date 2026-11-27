import {asyncIteratorObject, oc} from '@orpc/contract'
import {COMMON_ERROR_STATUS_MAP} from '@orpc/client'
import {z} from 'zod'
import {pick} from 'es-toolkit'
import {defineErrorCatalog, type ErrorCatalogMap, type EvlogError} from 'evlog'
import type {ModelMessage} from '@conciv/types/chat-message-types'
import {ReasoningEffortSchema} from '@conciv/types/chat-types'
import {define as defineRpc} from './schema/rpc.js'
import {declareErrors, errorStatuses} from './errors.js'

export const PROTOCOL_VERSION = 1

export const simulationErrorEntries = {
  ROLE_MISMATCH: {
    status: 400,
    message: ({expected, actual}: {expected: string; actual: string}) =>
      `Expected simulation endpoint role ${expected}, received ${actual}`,
    why: 'the client dialed the endpoint of the other role',
    fix: "dial the endpoint the engine's manifest lists for that role",
  },
  UNSUPPORTED_PROTOCOL: {
    status: 400,
    message: 'No mutually supported simulation protocol version',
    why: `the client offers no version this endpoint speaks (it speaks ${PROTOCOL_VERSION})`,
    fix: 'update the driver or the engine so both speak the same protocol version',
  },
  MISSING_CAPABILITY: {
    status: 400,
    message: ({missing}: {missing: readonly string[]}) =>
      `Simulation endpoint is missing required capabilities: ${missing.join(', ')}`,
    why: 'the endpoint does not install every capability the client requires',
    fix: 'require only the capabilities the endpoint advertises, or start an endpoint that has them',
  },
  INVOCATION_NOT_FOUND: {
    status: 404,
    message: ({id}: {id: string}) => `Simulated provider invocation not found or already finished: ${id}`,
    why: 'the invocation finished, was disconnected, or never existed',
    fix: 'list the pending invocations and answer one of those',
  },
  TOOL_INVOCATION_NOT_FOUND: {
    status: 404,
    message: ({id}: {id: string}) => `Simulated tool invocation not found or already finished: ${id}`,
    why: 'the tool invocation finished, failed, or never existed',
    fix: 'answer a tool invocation the register stream announced and has not ended',
  },
  TOOL_CONTROLLER: {
    status: 409,
    message: 'another controller owns the simulated tools',
    why: 'the call came from a connection that does not own the simulated tools',
    fix: 'register the tools from this connection first, or call from the connection that did',
  },
  UI_ACTION_FAILED: {
    status: 422,
    message: 'the widget could not do that ui action',
    why: 'the widget refused or could not complete the action',
    fix: "read the message and the widget's state, then try an action the widget supports",
  },
  QUEUE_FULL: {
    status: 429,
    message: 'Simulation control queue is full',
    why: 'too many control messages are waiting on this connection',
    fix: 'wait for the earlier calls to answer before sending more',
  },
  CONTROLLER_DISCONNECTED: {
    status: 503,
    message: 'the simulated model controller disconnected',
    why: 'the controller connection closed before it attached',
    fix: 'connect the controller again',
  },
  NO_SUCH_NODE: {
    status: 404,
    message: ({role, label}: {role: string; label: string}) => `the widget shows no ${role} named ${label}`,
    why: 'the semantic snapshot has no node with that role and label',
    fix: 'take a snapshot and pick a role and label it lists',
  },
  SCRIPTED_SESSION_ID: {
    status: 400,
    message: ({id}: {id: string}) =>
      `the scripted session id ${id} is not a harness session id: use letters, digits, _ and -`,
    why: 'a scripted session id must be a valid harness session id',
    fix: 'rename the scripted session with letters, digits, _ and -',
  },
  TOOL_CALL_INPUT: {
    status: 400,
    message: ({id}: {id: string}) => `the simulated tool call ${id} has input that is not a JSON object`,
    why: 'the controller streamed tool call arguments that do not parse to a JSON object',
    fix: 'stream the tool call arguments as one JSON object',
  },
  TOOL_CALL_NOT_STARTED: {
    status: 400,
    message: ({index}: {index: number}) => `the simulated tool call at index ${index} was never started`,
    why: 'the controller streamed arguments for a tool call it did not start',
    fix: 'start the tool call before streaming its arguments',
  },
  HARNESS_REFUSED: {
    status: 409,
    message: 'the simulated harness refused the run',
    why: 'the simulation was set to refuse every run of this harness',
    fix: 'read the message for why the simulation refuses it',
  },
  NO_SCRIPTED_REPLY: {
    status: 500,
    message: ({count}: {count: number}) => `the scripted harness has no reply for request ${count}`,
    why: 'the test scripted fewer replies than the agent made requests',
    fix: 'script one reply for every request the test makes',
  },
  OUTSIDE_SIMULATION: {
    status: 500,
    message: ({id}: {id: string}) => `the scripted harness ${id} answers only inside the simulation`,
    why: 'a scripted harness was asked to run without the simulation switched on',
    fix: 'start the engine with CONCIV_SIMULATE set',
  },
  LISTEN_FAILED: {
    status: 500,
    message: ({label, href}: {label: string; href: string}) => `${label} could not listen on ${href}`,
    why: 'the endpoint could not bind its port',
    fix: 'free the port, or set another endpoint in the manifest',
  },
  DRIVER_UNREACHABLE: {
    status: 503,
    message: ({url}: {url: string}) => `the driver could not connect to ${url}`,
    why: 'nothing answered on the simulation endpoint',
    fix: 'start the engine with the simulation on, and dial the endpoint its manifest lists',
  },
  UI_ENDPOINT_UNREACHABLE: {
    status: 503,
    message: ({endpoint}: {endpoint: string}) => `the driver could not reach the engine's ui endpoint at ${endpoint}`,
    why: 'the engine is not listening on its ui endpoint',
    fix: 'start the engine with CONCIV_DRIVE set, and dial the ui endpoint its manifest lists',
  },
} as const satisfies ErrorCatalogMap

export const simulationErrors = defineErrorCatalog('simulation', simulationErrorEntries)

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    simulation: typeof simulationErrors
  }
}

const CapabilitySchema = z.string().min(1)

export const EndpointRoleSchema = z.enum(['ui', 'backend'])
export type EndpointRole = z.infer<typeof EndpointRoleSchema>

const IdentitySchema = z.object({name: z.string().min(1), version: z.string().min(1)})
export type Identity = z.infer<typeof IdentitySchema>

function unique(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length
}

export const HandshakeParamsSchema = z.object({
  client: IdentitySchema,
  expectedRole: EndpointRoleSchema,
  offeredVersions: z.array(z.int().positive()).min(1).refine(unique, 'offered versions must be unique'),
  requiredCapabilities: z.array(CapabilitySchema).refine(unique, 'required capabilities must be unique'),
  optionalCapabilities: z.array(CapabilitySchema).refine(unique, 'optional capabilities must be unique'),
})
export type HandshakeParams = z.infer<typeof HandshakeParamsSchema>

export const HandshakeResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  role: EndpointRoleSchema,
  server: IdentitySchema,
  capabilities: z.array(CapabilitySchema).refine(unique, 'capabilities must be unique'),
})
export type HandshakeResponse = z.infer<typeof HandshakeResponseSchema>

export type HandshakeOutcome =
  | {readonly type: 'accepted'; readonly response: HandshakeResponse}
  | {readonly type: 'refused'; readonly refusal: EvlogError}

export type HandshakeAction = {
  readonly role: EndpointRole
  readonly server: Identity
  readonly capabilities: readonly string[]
}

export function dispatchHandshake(action: HandshakeAction, params: HandshakeParams): HandshakeOutcome {
  if (params.expectedRole !== action.role) {
    const refusal = simulationErrors.ROLE_MISMATCH({expected: params.expectedRole, actual: action.role})
    return {type: 'refused', refusal}
  }
  if (!params.offeredVersions.includes(PROTOCOL_VERSION))
    return {type: 'refused', refusal: simulationErrors.UNSUPPORTED_PROTOCOL()}
  const installed = new Set(action.capabilities)
  const missing = params.requiredCapabilities.filter((capability) => !installed.has(capability))
  if (missing.length > 0) return {type: 'refused', refusal: simulationErrors.MISSING_CAPABILITY({missing})}
  const capabilities = [...installed]
  return {
    type: 'accepted',
    response: {protocolVersion: PROTOCOL_VERSION, role: action.role, server: action.server, capabilities},
  }
}

export const UI_CAPABILITIES = [
  'ui.type',
  'ui.press',
  'ui.enter',
  'ui.arrow',
  'ui.focus',
  'ui.click',
  'ui.click.semantic',
  'ui.mouse',
  'ui.recording.pointer',
  'ui.resize',
  'ui.matches',
  'ui.state',
  'ui.snapshot',
  'ui.capture',
  'ui.recording.finish',
] as const
export type UiCapability = (typeof UI_CAPABILITIES)[number]

export const KeyModifiersSchema = z.object({
  ctrl: z.boolean().optional(),
  shift: z.boolean().optional(),
  meta: z.boolean().optional(),
  super: z.boolean().optional(),
  hyper: z.boolean().optional(),
})
export type KeyModifiers = z.infer<typeof KeyModifiersSchema>

const ElementNumberSchema = z.int().positive()

export const SemanticClickTargetSchema = z.object({
  id: z.string().min(1),
  instance: z.string().min(1).optional(),
  element: ElementNumberSchema,
})
export type SemanticClickTarget = z.infer<typeof SemanticClickTargetSchema>

const DirectionSchema = z.enum(['up', 'down', 'left', 'right'])

const MousePosition = {
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  modifiers: z
    .object({shift: z.boolean().optional(), alt: z.boolean().optional(), ctrl: z.boolean().optional()})
    .optional(),
}

export const MouseParamsSchema = z.discriminatedUnion('action', [
  z.object({...MousePosition, action: z.literal('move')}),
  z.object({
    ...MousePosition,
    action: z.enum(['down', 'up']),
    button: z.enum(['left', 'middle', 'right']).optional(),
  }),
  z.object({...MousePosition, action: z.literal('scroll'), direction: DirectionSchema}),
])
export type MouseParams = z.infer<typeof MouseParamsSchema>

export const TypeParamsSchema = z.object({text: z.string()})
export type TypeParams = z.infer<typeof TypeParamsSchema>

export const MatchesParamsSchema = z.object({text: z.string()})
export type MatchesParams = z.infer<typeof MatchesParamsSchema>

export const PressParamsSchema = z.object({key: z.string(), modifiers: KeyModifiersSchema.optional()})
export type PressParams = z.infer<typeof PressParamsSchema>

export function pressParams(key: string, modifiers?: KeyModifiers): PressParams {
  return modifiers === undefined ? {key} : {key, modifiers}
}

export const ArrowParamsSchema = z.object({direction: DirectionSchema})
export type ArrowParams = z.infer<typeof ArrowParamsSchema>

export const FocusParamsSchema = z.object({target: z.number()})
export type FocusParams = z.infer<typeof FocusParamsSchema>

export const ClickParamsSchema = z.object({
  target: z.number(),
  x: z.number(),
  y: z.number(),
  semantic: SemanticClickTargetSchema.optional(),
})
export type ClickParams = z.infer<typeof ClickParamsSchema>

export const ResizeParamsSchema = z.object({cols: z.number(), rows: z.number()})
export type ResizeParams = z.infer<typeof ResizeParamsSchema>

export const UiActionSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('ui.type'), ...TypeParamsSchema.shape}),
  z.object({type: z.literal('ui.press'), ...PressParamsSchema.shape}),
  z.object({type: z.literal('ui.enter')}),
  z.object({type: z.literal('ui.arrow'), ...ArrowParamsSchema.shape}),
  z.object({type: z.literal('ui.focus'), ...FocusParamsSchema.shape}),
  z.object({type: z.literal('ui.mouse'), params: MouseParamsSchema}),
  z.object({type: z.literal('ui.click'), ...ClickParamsSchema.shape}),
  z.object({type: z.literal('ui.resize'), ...ResizeParamsSchema.shape}),
])
export type UiAction = z.infer<typeof UiActionSchema>

export const UiElementSchema = z.object({
  id: z.string(),
  num: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  focusable: z.boolean(),
  focused: z.boolean(),
  clickable: z.boolean(),
  editor: z.boolean(),
})
export type UiElement = z.infer<typeof UiElementSchema>

export const UiStateSchema = z.object({
  focused: z.object({renderable: z.number().optional(), editor: z.boolean()}),
  elements: z.array(UiElementSchema),
})
export type UiState = z.infer<typeof UiStateSchema>

export const SemanticNodeSchema = z.object({
  id: z.string().min(1),
  instance: z.string().min(1).optional(),
  parent: z.string().min(1).optional(),
  role: z.string().min(1),
  label: z.string().min(1).optional(),
  element: ElementNumberSchema,
  focused: z.boolean().optional(),
  selected: z.boolean().optional(),
  expanded: z.boolean().optional(),
  disabled: z.boolean().optional(),
})
export type SemanticNode = z.infer<typeof SemanticNodeSchema>

function reachesCycle(
  parents: ReadonlyMap<string, string | undefined>,
  id: string | undefined,
  seen: ReadonlySet<string>,
): boolean {
  if (id === undefined) return false
  if (seen.has(id)) return true
  return reachesCycle(parents, parents.get(id), new Set(seen).add(id))
}

export const SemanticSnapshotSchema = z.object({
  format: z.literal('conciv-ui-snapshot-v1'),
  nodes: z.array(SemanticNodeSchema).superRefine((nodes, context) => {
    const ids = new Set(nodes.map((node) => node.id))
    if (ids.size !== nodes.length) context.addIssue('semantic node ids must be unique')
    if (!unique(nodes.map((node) => node.element))) context.addIssue('semantic node elements must be unique')
    if (nodes.some((node) => node.parent !== undefined && !ids.has(node.parent))) {
      context.addIssue('semantic node parents must reference another node')
    }
    const parents = new Map(nodes.map((node) => [node.id, node.parent]))
    if (nodes.some((node) => reachesCycle(parents, node.id, new Set()))) {
      context.addIssue('semantic node hierarchy must be acyclic')
    }
  }),
})
export type SemanticSnapshot = z.infer<typeof SemanticSnapshotSchema>

export const ColorSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])
export type Color = z.infer<typeof ColorSchema>

export const CapturedImageSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  pixelWidth: z.number(),
  pixelHeight: z.number(),
  rgba: z.base64(),
})
export type CapturedImage = z.infer<typeof CapturedImageSchema>

export const CapturedFrameSchema = z.object({
  cols: z.number(),
  rows: z.number(),
  cursor: z.tuple([z.number(), z.number()]),
  lines: z.array(
    z.object({
      spans: z.array(
        z.object({text: z.string(), fg: ColorSchema, bg: ColorSchema, attributes: z.number(), width: z.number()}),
      ),
    }),
  ),
  images: z.array(CapturedImageSchema).optional(),
})
export type CapturedFrame = z.infer<typeof CapturedFrameSchema>

export const BACKEND_CAPABILITIES = [
  'llm.subscribe',
  'llm.chunk',
  'llm.finish',
  'llm.disconnect',
  'llm.pending',
  'llm.request',
  'llm.tool-input-delta',
  'tool.register',
  'tool.update',
  'tool.finish',
  'tool.fail',
  'tool.invocation',
  'tool.cancel',
] as const

export const ItemSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('textDelta'), text: z.string()}),
  z.object({type: z.literal('reasoningDelta'), text: z.string()}),
  z.object({type: z.literal('toolInputStart'), index: z.number(), id: z.string(), name: z.string()}),
  z.object({type: z.literal('toolInputDelta'), index: z.number(), text: z.string()}),
  z.object({type: z.literal('toolCall'), index: z.number(), id: z.string(), name: z.string(), input: z.json()}),
  z.object({type: z.literal('raw'), chunk: z.json()}),
])
export type Item = z.infer<typeof ItemSchema>

export const FinishReasonSchema = z.enum(['stop', 'tool-calls', 'length', 'content-filter'])
export type FinishReason = z.infer<typeof FinishReasonSchema>

const ToolContentSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('text'), text: z.string()}),
  z.object({type: z.literal('file'), data: z.string(), mime: z.string().min(1), name: z.string().optional()}),
])
export type ToolContent = z.infer<typeof ToolContentSchema>

const PROVIDER_SAFE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

const ToolNameSchema = z.string().min(1).regex(PROVIDER_SAFE_NAME, 'simulated tool names must be provider-safe')

const ToolNamespaceSchema = z
  .string()
  .min(1)
  .refine(
    (namespace) => namespace.split('.').every((segment) => PROVIDER_SAFE_NAME.test(segment)),
    'simulated tool namespaces must contain provider-safe segments',
  )

const JsonRecordSchema = z.record(z.string(), z.json())

export const ToolRegistrationSchema = z.object({
  name: ToolNameSchema,
  description: z.string(),
  inputSchema: JsonRecordSchema,
  outputSchema: JsonRecordSchema.optional(),
  permission: z.string().min(1).optional(),
  options: z.object({namespace: ToolNamespaceSchema.optional(), codemode: z.boolean().optional()}).optional(),
})
export type ToolRegistration = z.infer<typeof ToolRegistrationSchema>

export function exposedToolName(registration: ToolRegistration): string {
  const namespace = registration.options?.namespace
  return namespace === undefined ? registration.name : `${namespace.replaceAll('.', '_')}_${registration.name}`
}

function reservesExecute(tool: ToolRegistration): boolean {
  return tool.name === 'execute' && tool.options?.namespace === undefined && tool.options?.codemode === false
}

export const ToolRegisterParamsSchema = z.object({
  tools: z.array(ToolRegistrationSchema).superRefine((tools, context) => {
    const names = tools.map(exposedToolName)
    if (names.some((name) => !PROVIDER_SAFE_NAME.test(name))) {
      context.addIssue('simulated tool names including namespaces must be provider-safe')
    }
    if (!unique(names)) context.addIssue('simulated tool registrations must have unique exposed names')
    if (tools.some(reservesExecute)) context.addIssue('direct simulated tool name "execute" is reserved')
  }),
})
export type ToolRegisterParams = z.infer<typeof ToolRegisterParamsSchema>

export const ToolOutputSchema = z.object({structured: z.json(), content: z.array(ToolContentSchema)})
export type ToolOutput = z.infer<typeof ToolOutputSchema>

export const ToolUpdateParamsSchema = z.object({
  id: z.string(),
  sequence: z.int().nonnegative(),
  update: JsonRecordSchema,
})
export type ToolUpdateParams = z.infer<typeof ToolUpdateParamsSchema>

export const ToolFinishParamsSchema = z.object({id: z.string(), output: ToolOutputSchema})
export type ToolFinishParams = z.infer<typeof ToolFinishParamsSchema>

export const ToolFailParamsSchema = z.object({id: z.string(), message: z.string()})
export type ToolFailParams = z.infer<typeof ToolFailParamsSchema>

export const ToolInvocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.json(),
  context: z.object({sessionId: z.string(), agent: z.string(), messageId: z.string().optional(), id: z.string()}),
})
export type ToolInvocation = z.infer<typeof ToolInvocationSchema>

export const ToolCancellationSchema = z.object({id: z.string(), reason: z.literal('interrupted')})
export type ToolCancellation = z.infer<typeof ToolCancellationSchema>

export const ChunkParamsSchema = z.object({id: z.string(), items: z.array(ItemSchema)})
export type ChunkParams = z.infer<typeof ChunkParamsSchema>

export const FinishParamsSchema = z.object({id: z.string(), reason: FinishReasonSchema.default('stop')})
export type FinishParams = z.input<typeof FinishParamsSchema>

export const DisconnectParamsSchema = z.object({id: z.string()})

export const ModelRequestSchema = z.object({
  system: z.array(z.string()),
  messages: z.array(z.custom<ModelMessage>()),
  tools: z.array(z.object({name: z.string(), description: z.string(), inputSchema: z.record(z.string(), z.unknown())})),
  model: z.string().nullable(),
  effort: ReasoningEffortSchema.nullable(),
  options: z.record(z.string(), z.unknown()),
})
export type ModelRequest = z.infer<typeof ModelRequestSchema>

export const ProviderInvocationSchema = z.object({id: z.string(), request: ModelRequestSchema})
export type ProviderInvocation = z.infer<typeof ProviderInvocationSchema>

export const PendingSchema = z.object({invocations: z.array(ProviderInvocationSchema)})

export const NetworkLogEntrySchema = z.object({
  time: z.number(),
  method: z.string(),
  url: z.string(),
  matched: z.boolean(),
})
export type NetworkLogEntry = z.infer<typeof NetworkLogEntrySchema>

export const LlmNotificationSchema = z.object({method: z.literal('llm.request'), params: ProviderInvocationSchema})
export type LlmNotification = z.infer<typeof LlmNotificationSchema>

const ToolInvocationNotificationSchema = z.object({method: z.literal('tool.invocation'), params: ToolInvocationSchema})

const ToolCancelNotificationSchema = z.object({method: z.literal('tool.cancel'), params: ToolCancellationSchema})

export const ToolNotificationSchema = z.discriminatedUnion('method', [
  ToolInvocationNotificationSchema,
  ToolCancelNotificationSchema,
])
export type ToolNotification = z.infer<typeof ToolNotificationSchema>

export const NotificationSchema = z.discriminatedUnion('method', [
  LlmNotificationSchema,
  ToolInvocationNotificationSchema,
  ToolCancelNotificationSchema,
])
export type Notification = z.infer<typeof NotificationSchema>

const OkSchema = z.object({ok: z.literal(true)})

export const SIMULATION_ERROR_STATUS: Readonly<Record<string, number>> = {
  ...COMMON_ERROR_STATUS_MAP,
  ...errorStatuses(simulationErrorEntries),
}

const declaredSimulationErrors = declareErrors(simulationErrorEntries)

function simulationContractErrors<const Code extends keyof typeof simulationErrorEntries>(...codes: Code[]) {
  return pick(declaredSimulationErrors, codes)
}

const handshakeErrors = simulationContractErrors(
  'QUEUE_FULL',
  'ROLE_MISMATCH',
  'UNSUPPORTED_PROTOCOL',
  'MISSING_CAPABILITY',
)

const handshake = oc.errors(handshakeErrors).input(HandshakeParamsSchema).output(HandshakeResponseSchema)

const invocationErrors = simulationContractErrors('QUEUE_FULL', 'INVOCATION_NOT_FOUND')

const toolErrors = simulationContractErrors('QUEUE_FULL', 'TOOL_INVOCATION_NOT_FOUND', 'TOOL_CONTROLLER')

export const backendContract = {
  handshake,
  llm: {
    subscribe: oc
      .errors(simulationContractErrors('QUEUE_FULL', 'CONTROLLER_DISCONNECTED'))
      .output(asyncIteratorObject(LlmNotificationSchema)),
    pending: oc.errors(simulationContractErrors('QUEUE_FULL')).output(PendingSchema),
    chunk: oc.errors(invocationErrors).input(ChunkParamsSchema).output(OkSchema),
    finish: oc.errors(invocationErrors).input(FinishParamsSchema).output(OkSchema),
    disconnect: oc.errors(invocationErrors).input(DisconnectParamsSchema).output(OkSchema),
  },
  tool: {
    register: oc.errors(toolErrors).input(ToolRegisterParamsSchema).output(asyncIteratorObject(ToolNotificationSchema)),
    update: oc.errors(toolErrors).input(ToolUpdateParamsSchema).output(OkSchema),
    finish: oc.errors(toolErrors).input(ToolFinishParamsSchema).output(OkSchema),
    fail: oc.errors(toolErrors).input(ToolFailParamsSchema).output(OkSchema),
  },
}

const uiErrors = simulationContractErrors('QUEUE_FULL', 'UI_ACTION_FAILED')

export const uiContract = {
  handshake,
  ui: {
    state: oc.errors(uiErrors).output(UiStateSchema),
    snapshot: oc.errors(uiErrors).output(SemanticSnapshotSchema),
    capture: oc.errors(uiErrors).output(CapturedFrameSchema),
    matches: oc.errors(uiErrors).input(MatchesParamsSchema).output(z.boolean()),
    recording: {finish: oc.errors(uiErrors).output(z.string())},
    type: oc.errors(uiErrors).input(TypeParamsSchema).output(UiStateSchema),
    press: oc.errors(uiErrors).input(PressParamsSchema).output(UiStateSchema),
    enter: oc.errors(uiErrors).output(UiStateSchema),
    arrow: oc.errors(uiErrors).input(ArrowParamsSchema).output(UiStateSchema),
    focus: oc.errors(uiErrors).input(FocusParamsSchema).output(UiStateSchema),
    click: oc.errors(uiErrors).input(ClickParamsSchema).output(UiStateSchema),
    mouse: oc.errors(uiErrors).input(MouseParamsSchema).output(UiStateSchema),
    resize: oc.errors(uiErrors).input(ResizeParamsSchema).output(UiStateSchema),
  },
}

export const WidgetRequestSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('ui.state')}),
  z.object({type: z.literal('ui.snapshot')}),
  z.object({type: z.literal('ui.matches'), ...MatchesParamsSchema.shape}),
  z.object({type: z.literal('ui.type'), ...TypeParamsSchema.shape}),
  z.object({type: z.literal('ui.press'), ...PressParamsSchema.shape}),
  z.object({type: z.literal('ui.enter')}),
  z.object({type: z.literal('ui.arrow'), ...ArrowParamsSchema.shape}),
  z.object({type: z.literal('ui.focus'), ...FocusParamsSchema.shape}),
  z.object({type: z.literal('ui.click'), ...ClickParamsSchema.shape}),
])
export type WidgetRequest = z.infer<typeof WidgetRequestSchema>

export const WidgetOutcomeSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('success'), value: z.json()}),
  z.object({type: z.literal('failure'), message: z.string()}),
])
export type WidgetOutcome = z.infer<typeof WidgetOutcomeSchema>

export const WidgetDrive = defineRpc({
  id: 'conciv.simulation.ui',
  methods: {
    result: {
      input: z.object({requestId: z.string(), outcome: WidgetOutcomeSchema}),
      output: z.void(),
      errors: {},
    },
  },
  events: {
    call: {schema: z.object({requestId: z.string(), request: WidgetRequestSchema})},
  },
})
