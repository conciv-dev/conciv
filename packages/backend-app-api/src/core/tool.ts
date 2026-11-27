export {CallId, Content, Error, FileContent, TextContent, makeError} from '@conciv/protocol/schema/tool'
export type {Context, Metadata, Namespace, Options, Result} from '@conciv/protocol/schema/tool'

import {makeToolDefinition, ToolDefinition, type ToolCall} from '../ai/effect.js'
import * as Tool from '@conciv/protocol/schema/tool'
import {Context, Effect, Layer, Result, SchemaIssue, Types} from 'effect'
import type {EvlogError} from 'evlog'
import type * as Agent from '@conciv/protocol/schema/agent'
import * as Permission from '@conciv/protocol/schema/permission'
import * as Image from './image.js'
import * as PluginHooks from './plugin/hooks.js'
import * as SessionMessage from '@conciv/protocol/schema/session-message'
import * as SessionSchema from '@conciv/protocol/schema/session'
import * as State from './state.js'
import {definition, effectiveName, execute, normalizedName, normalizeContent} from './tool/runtime.js'
import * as Wildcard from './util/wildcard.js'
import {imageErrors, toolErrors} from '@conciv/errors'

export type Registered = Tool.Info & {readonly id: string; readonly pluginId?: string}

export interface Editor {
  readonly list: () => readonly (Tool.Info & {readonly id: string})[]
  readonly get: (id: string) => (Tool.Info & {readonly id: string}) | undefined
  readonly namespace: (namespace: Tool.Namespace) => void
  readonly add: (tool: Tool.Info, pluginId?: string) => void
  readonly update: (id: string, update: (tool: Types.Mutable<Tool.Info>) => void) => void
  readonly remove: (id: string) => void
}

type Data = {
  tools: Map<string, Registered>
  definitions: Map<string, ToolDefinition>
  namespaces: Map<string, Tool.Namespace>
  errors: {kind: 'tool' | 'namespace'; name: string; namespace?: string; error: EvlogError}[]
}

export interface Interface extends State.Transformable<Editor> {
  readonly list: () => Effect.Effect<ReadonlyArray<Registered>>
  readonly snapshot: (permissions?: Permission.Ruleset) => Effect.Effect<Snapshot>
}

export interface NormalizedResult extends Tool.Result {
  readonly content: ReadonlyArray<Tool.Content>
}

export interface Snapshot {
  readonly definitions: ReadonlyArray<ToolDefinition>
  readonly codeMode?: {
    readonly tools: ReadonlyMap<string, Tool.Info>
    readonly namespaces: ReadonlyMap<string, Tool.Namespace>
    readonly execute: (
      name: string,
      input: unknown,
      context: Tool.Context,
    ) => Effect.Effect<NormalizedResult, Tool.Error>
  }
  readonly execute: (input: {
    readonly sessionId: SessionSchema.Id
    readonly agent: Agent.Id
    readonly messageId: SessionMessage.Id | undefined
    readonly call: ToolCall
    readonly origin: Tool.Origin
    readonly progress?: (update: Tool.Metadata) => Effect.Effect<void>
    readonly cancel?: Effect.Effect<void>
    readonly definitions?: ReadonlyMap<string, ToolDefinition>
  }) => Effect.Effect<NormalizedResult, Tool.Error>
}

export const Service = Context.Service<Interface>('@conciv/Tool')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const hooks = yield* PluginHooks.Service
    const image = yield* Image.Service

    type NormalizedItem = Tool.Content | 'decode' | 'size'
    const normalizeImages = Effect.fnUntraced(function* (content: ReadonlyArray<Tool.Content>) {
      const normalized = yield* Effect.forEach(content, (item): Effect.Effect<NormalizedItem> => {
        if (item.type !== 'file' || !item.mime.startsWith('image/')) return Effect.succeed(item)
        const base64 = /^data:[^,]*;base64,(.*)$/s.exec(item.uri)?.[1]
        if (base64 === undefined) return Effect.succeed(item)
        const resource = item.name ?? `${item.mime} tool output`
        return image.normalize(resource, {uri: resource, content: base64, encoding: 'base64', mime: item.mime}).pipe(
          Effect.map((result) => ({
            ...item,
            uri: `data:${result.mime};base64,${result.content}`,
            mime: result.mime,
          })),
          Effect.catch((error) => {
            if (error.code === imageErrors.DECODE_FAILED.code) return Effect.succeed<NormalizedItem>('decode')
            if (error.code === imageErrors.TOO_LARGE.code) return Effect.succeed<NormalizedItem>('size')
            return Effect.succeed(item)
          }),
        )
      })
      const note = (reason: 'decode' | 'size', text: string): Tool.Content[] => {
        const count = normalized.filter((item) => item === reason).length
        if (count === 0) return []
        return [{type: 'text', text: `[${count} image${count === 1 ? '' : 's'} omitted: ${text}]`}]
      }
      return [
        ...normalized.filter((item) => typeof item !== 'string'),
        ...note('decode', 'could not be decoded.'),
        ...note('size', 'could not be resized below the image size limit.'),
      ]
    })

    const beforeExecute = (name: string, input: unknown, context: Tool.Context) =>
      hooks.trigger('tool', 'execute.before', {
        tool: name,
        sessionId: context.sessionId,
        agent: context.agent,
        messageId: context.messageId,
        id: context.id,
        input,
      })

    const executeTool = Effect.fn('Tool.execute')(function* (
      tool: Tool.Info,
      name: string,
      input: unknown,
      context: Tool.Context,
    ) {
      yield* Effect.annotateCurrentSpan({
        'gen_ai.tool.name': name,
        'gen_ai.tool.call.id': context.id,
        'session.id': context.sessionId,
        'gen_ai.agent.name': context.agent,
      })
      const execution = yield* execute(tool, input, context).pipe(
        Effect.map((value) => ({value})),
        Effect.catchTag('Tool.Error', (failure) => Effect.succeed({failure})),
      )
      const base = {
        tool: name,
        sessionId: context.sessionId,
        agent: context.agent,
        messageId: context.messageId,
        id: context.id,
        input,
      }
      if ('failure' in execution) {
        const afterEvent: PluginHooks.Domains['tool']['execute.after'] = {
          ...base,
          status: 'error',
          error: execution.failure,
        }
        yield* hooks.trigger('tool', 'execute.after', afterEvent)
        return yield* Effect.fail(afterEvent.error)
      }
      const afterEvent: PluginHooks.Domains['tool']['execute.after'] = {
        ...base,
        status: 'completed',
        result: {
          ...(execution.value.output === undefined ? {} : {output: execution.value.output}),
          content: execution.value.content,
          ...(execution.value.metadata === undefined ? {} : {metadata: execution.value.metadata}),
        },
      }
      yield* hooks.trigger('tool', 'execute.after', afterEvent)
      const afterContent = yield* normalizeImages(normalizeContent(afterEvent.result.content, afterEvent.result.output))
      return {
        ...(afterEvent.result.output === undefined ? {} : {output: afterEvent.result.output}),
        content: afterContent,
        ...(afterEvent.result.metadata === undefined ? {} : {metadata: afterEvent.result.metadata}),
      }
    })

    const run = (tool: Tool.Info, name: string, input: unknown, context: Tool.Context) =>
      beforeExecute(name, input, context).pipe(Effect.flatMap((event) => executeTool(tool, name, event.input, context)))

    const state = State.create<Data, Editor>({
      name: 'tool',
      initial: () => ({
        tools: new Map(),
        definitions: new Map(),
        namespaces: new Map(),
        errors: [],
      }),
      editor: (editor) => ({
        list: () => Array.from(editor.tools.values()),
        get: (id) => editor.tools.get(id),
        namespace: (namespace) => {
          const error = namespaceError(namespace.name)
          if (error) {
            editor.errors.push({kind: 'namespace', name: namespace.name, namespace: namespace.name, error})
            return
          }
          editor.namespaces.set(namespace.name, {...namespace})
        },
        add: (tool, pluginId) => {
          const id = effectiveName(tool)
          commit(editor, id, {...tool, id, pluginId, options: tool.options && {...tool.options}})
        },
        update: (id, update) => {
          const current = editor.tools.get(id)
          if (!current) return
          const tool = {...current, options: current.options && {...current.options}}
          update(tool)
          tool.name = current.name
          tool.id = id
          if (tool.options?.namespace !== current.options?.namespace)
            tool.options = {...tool.options, namespace: current.options?.namespace}
          commit(editor, id, tool)
        },
        remove: (id) => {
          editor.tools.delete(id)
          editor.definitions.delete(id)
        },
      }),
      notify: (value) => {
        return Effect.forEach(
          value.errors,
          ({kind, name, namespace, error}) =>
            Effect.logError(`Skipping invalid ${kind} registration`, {
              name,
              namespace,
              error: error.message,
            }),
          {discard: true},
        )
      },
    })

    return Service.of({
      transform: state.transform,
      reload: state.reload,
      list: () => Effect.sync(() => Array.from(state.get().tools.values())),
      snapshot: Effect.fn('Tool.snapshot')((permissions) =>
        Effect.sync(() => {
          const data = state.get()
          const active = new Map<string, Tool.Info>()
          const rules = permissions ?? []
          for (const [name, tool] of data.tools) {
            if (whollyDisabled(tool.options?.permission ?? name, rules)) continue
            active.set(name, tool)
          }
          const codeModeEnabled = !whollyDisabled('execute', rules)
          const direct = codeModeEnabled
            ? new Map(Array.from(active).filter(([, tool]) => tool.options?.codemode === false))
            : active
          const codeModeTools = new Map(Array.from(active).filter(([, tool]) => tool.options?.codemode !== false))
          return {
            ...(!codeModeEnabled
              ? {}
              : {
                  codeMode: {
                    tools: codeModeTools,
                    namespaces: data.namespaces,
                    execute: (name: string, input: unknown, context: Tool.Context) => {
                      const tool = codeModeTools.get(name)
                      if (tool) return run(tool, name, input, context)
                      return Effect.fail(
                        Tool.makeError({
                          message: `No tool named "${name}" is currently available. Please use a tool from the available tool list.`,
                        }),
                      )
                    },
                  },
                }),
            definitions: Array.from(direct)
              .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
              .flatMap(([name]) => data.definitions.get(name) ?? []),
            execute: Effect.fnUntraced(function* (input: Parameters<Snapshot['execute']>[0]) {
              const context: Tool.Context = {
                sessionId: input.sessionId,
                agent: input.agent,
                messageId: input.messageId,
                id: Tool.CallId.make(input.call.id),
                origin: input.origin,
                progress: input.progress ?? (() => Effect.void),
                cancel: input.cancel,
              }
              const event = yield* beforeExecute(input.call.name, input.call.input, context)
              const requested = input.definitions?.get(event.tool)
              if (!requested && input.definitions && direct.has(event.tool))
                return yield* Effect.fail(
                  Tool.makeError({message: `Tool is not available for this request: ${event.tool}`}),
                )
              const name = requested?.name ?? event.tool
              const tool = direct.get(name)
              if (tool) return yield* executeTool(tool, name, event.input, context)
              return yield* Effect.fail(
                Tool.makeError({
                  message: `No tool named "${name}" is currently available. Please use a tool from the available tool list.`,
                }),
              )
            }),
          }
        }),
      ),
    })
  }),
)

function commit(editor: Data, id: string, input: Registered) {
  const tool = input.input === undefined || input.input === null ? {...input, input: {}} : input
  const registered = register(tool)
  if (Result.isFailure(registered)) {
    editor.errors.push({
      kind: 'tool',
      name: tool.name,
      namespace: tool.options?.namespace,
      error: registered.failure,
    })
    return
  }
  editor.tools.set(id, tool)
  editor.definitions.set(id, registered.success)
}

const whollyDisabled = (action: string, rules: Permission.Ruleset) => {
  const rule = rules.findLast((rule) => Wildcard.match(action, rule.action))
  return rule?.resource === '*' && rule.effect === 'deny'
}

const formatSchemaIssue = SchemaIssue.makeFormatterDefault()

function schemaMakeError(error: unknown) {
  if (error instanceof Error && SchemaIssue.isIssue(error.cause)) return formatSchemaIssue(error.cause)
  return error instanceof Error ? error.message : String(error)
}

function register(tool: Tool.Info): Result.Result<ToolDefinition, EvlogError> {
  const namespace = tool.options?.namespace
  if (namespace !== undefined) {
    const error = namespaceError(namespace)
    if (error) return Result.fail(error)
  }
  const name = normalizedName(tool)
  if (!/^[A-Za-z0-9_]+$/.test(name)) return Result.fail(toolErrors.NAME_INVALID({name}))
  const id = effectiveName(tool)
  if (tool.options?.codemode === false && id === 'execute') return Result.fail(toolErrors.NAME_RESERVED())
  if (typeof tool.input !== 'object' && typeof tool.input !== 'function')
    return Result.fail(toolErrors.INPUT_NOT_SCHEMA({id}))
  return Result.try({
    try: () => makeToolDefinition(definition(tool)),
    catch: (error) =>
      toolErrors.DEFINITION_INVALID({
        id,
        reason: schemaMakeError(error),
        cause: error instanceof globalThis.Error ? error : undefined,
      }),
  })
}

function namespaceError(name: string) {
  if (name.split('.').every((segment) => /^[A-Za-z0-9_]+$/.test(segment))) return
  return toolErrors.NAMESPACE_INVALID({name: JSON.stringify(name)})
}
