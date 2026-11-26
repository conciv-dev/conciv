import {z} from 'zod'
import type {FakePluginCall, FakePluginHandler, FakeReply} from '@conciv/client/testing'
import type {PageCaptureBundle, SessionCaptures} from '../../src/element-capture-types.js'
import {Action, Definition, Outcome, StoredGrab, Tab, type Command, type GrabId, type Work} from '../../src/rpc.js'

type Attachment = {
  readonly sessionId: string
  readonly connectionId: string
  readonly emit: FakePluginCall['emit']
  ended: boolean
}

type Asked = {readonly command: Command; readonly answered: PromiseWithResolvers<Outcome>}

type Played = {readonly action: Work; readonly outcome: Outcome}

export type FakePage = {
  readonly handlers: Readonly<Record<string, FakePluginHandler>>
  readonly attached: (sessionId?: string) => Promise<string>
  readonly sessions: () => readonly {readonly sessionId: string; readonly ended: boolean}[]
  readonly tabs: () => readonly Tab[]
  readonly call: (action: Work, sessionId?: string) => Promise<Outcome>
  readonly value: (action: Work, sessionId?: string) => Promise<unknown>
  readonly queue: (actions: readonly Action[], sessionId?: string) => Promise<readonly Outcome[]>
  readonly toolCall: (id: string, name: string, input: Record<string, unknown>, fails?: 'fails') => FakeReply
  readonly played: () => readonly Played[]
  readonly grabs: () => readonly StoredGrab[]
}

const Attach = z.object({sessionId: z.string(), connectionId: z.string()})

const Request = z.object({requestId: z.string()})

const Answer = z.object({requestId: z.string(), outcome: Outcome})

const GrabSave = z.object({grab: StoredGrab})

const GrabGet = z.object({id: z.string()})

const Captured = z.object({sessionId: z.string()})

const State = z.object({state: Tab})

const PAGE_PREFIX = 'page_'

function toolAction(name: string, input: Record<string, unknown>): Action {
  return Action.parse({...input, type: name.slice(PAGE_PREFIX.length)})
}

function failureText(outcome: Outcome): string {
  return outcome.type === 'failure' ? `[page.${outcome.code}] ${outcome.message}` : ''
}

function toolOutput(outcome: Outcome): unknown {
  if (outcome.type === 'failure') throw new Error(failureText(outcome))
  const [image] = outcome.result.files.filter((file) => file.mime.startsWith('image/'))
  if (image === undefined) return outcome.result.value
  return [
    {type: 'text', content: JSON.stringify(outcome.result.value)},
    {type: 'image', source: {type: 'data', value: z.util.uint8ArrayToBase64(image.data), mimeType: image.mime}},
  ]
}

export function createFakePage(): FakePage {
  const attachments: Attachment[] = []
  const waiting: {sessionId: string | undefined; found: (sessionId: string) => void}[] = []
  const asked = new Map<string, Asked>()
  const played: Played[] = []
  const tabs: Tab[] = []
  const grabs = new Map<string, StoredGrab>()
  const captures = new Map<string, {readonly sessionId: string; readonly bundle: PageCaptureBundle}>()

  const sessionCaptures = (sessionId: string): SessionCaptures => {
    const stored = [...captures].filter(([, entry]) => entry.sessionId === sessionId)
    return {
      captures: stored.flatMap(([toolCallId, {bundle}]) =>
        [bundle.before, bundle.after].flatMap((capture) =>
          capture ? [{toolCallId, kind: capture.kind, capture}] : [],
        ),
      ),
      cssBundles: Object.fromEntries(
        stored.flatMap(([, {bundle}]) => (bundle.cssBundles ?? []).map((css) => [css.hash, css.css])),
      ),
    }
  }

  const keep = (toolCallId: string, outcome: Outcome): Outcome => {
    if (outcome.type !== 'success' || outcome.result.capture === undefined) return outcome
    const attachment = live(undefined)
    captures.set(toolCallId, {sessionId: attachment.sessionId, bundle: outcome.result.capture})
    attachment.emit(`rpc.${Definition.id}.captures.saved`, {sessionId: attachment.sessionId})
    return outcome
  }

  const live = (sessionId: string | undefined): Attachment => {
    const found = attachments.findLast(
      (attachment) => !attachment.ended && (sessionId === undefined || attachment.sessionId === sessionId),
    )
    if (found === undefined) throw new Error(`no page is attached${sessionId ? ` to ${sessionId}` : ''}`)
    return found
  }

  const attach: FakePluginHandler = (input, call) => {
    const {sessionId, connectionId} = Attach.parse(input)
    const attachment: Attachment = {sessionId, connectionId, emit: call.emit, ended: false}
    attachments.push(attachment)
    call.emit(`rpc.${Definition.id}.control`, {type: 'attached', connectionId, version: 1})
    waiting
      .filter((wait) => wait.sessionId === undefined || wait.sessionId === sessionId)
      .forEach((wait) => {
        waiting.splice(waiting.indexOf(wait), 1)
        wait.found(sessionId)
      })
    return new Promise<'closed'>((resolve) => {
      call.signal?.addEventListener(
        'abort',
        () => {
          attachment.ended = true
          resolve('closed')
        },
        {once: true},
      )
    })
  }

  const send = (command: Command, sessionId: string | undefined): Promise<Outcome> => {
    const attachment = live(sessionId)
    const requestId = crypto.randomUUID()
    const answered = Promise.withResolvers<Outcome>()
    asked.set(requestId, {command, answered})
    attachment.emit(`rpc.${Definition.id}.control`, {type: 'command', connectionId: attachment.connectionId, requestId})
    return answered.promise.then((outcome) => {
      played.push({action: command.action, outcome})
      return outcome
    })
  }

  const call = (action: Work, sessionId?: string) => send({action, agentId: 'agent', timeoutMs: 5000}, sessionId)

  return {
    handlers: {
      attach,
      state: (input) => {
        tabs.push(State.parse(input).state)
      },
      command: (input) => {
        const found = asked.get(Request.parse(input).requestId)
        if (found === undefined) throw new Error('the page asked for a command nobody sent')
        return found.command
      },
      result: (input) => {
        const {requestId, outcome} = Answer.parse(input)
        asked.get(requestId)?.answered.resolve(outcome)
        asked.delete(requestId)
      },
      'grabs.save': (input) => {
        const id: GrabId = `grab_${crypto.randomUUID()}`
        grabs.set(id, GrabSave.parse(input).grab)
        return {id}
      },
      'grabs.get': (input) => grabs.get(GrabGet.parse(input).id) ?? null,
      'captures.list': (input) => sessionCaptures(Captured.parse(input).sessionId),
    },
    attached: (sessionId) => {
      const found = attachments.findLast(
        (attachment) => !attachment.ended && (sessionId === undefined || attachment.sessionId === sessionId),
      )
      if (found !== undefined) return Promise.resolve(found.sessionId)
      return new Promise((resolve) => waiting.push({sessionId, found: resolve}))
    },
    sessions: () => attachments.map(({sessionId, ended}) => ({sessionId, ended})),
    tabs: () => [...tabs],
    call,
    value: async (action, sessionId) => {
      const outcome = await call(action, sessionId)
      if (outcome.type === 'failure') throw new Error(failureText(outcome))
      return outcome.result.value
    },
    queue: async (actions, sessionId) => {
      const id = `queue_${crypto.randomUUID()}`
      const of = actions.length
      if (actions.length === 0) return []
      const accepted = await send(
        {
          action: Action.parse({
            type: 'queue',
            actions: actions.map(({type, ...action}) => ({...action, tool: `${PAGE_PREFIX}${type}`})),
          }),
          agentId: 'agent',
          timeoutMs: 5000,
          queued: {id, index: -1, of},
        },
        sessionId,
      )
      const outcomes: Outcome[] = [accepted]
      for (const [index, action] of actions.entries())
        outcomes.push(await send({action, agentId: 'agent', timeoutMs: 7000, queued: {id, index, of}}, sessionId))
      return outcomes
    },
    toolCall: (id, name, input, fails) => ({
      kind: 'toolCall',
      id,
      name,
      input,
      failed: fails === 'fails',
      result: () =>
        call(toolAction(name, input)).then((outcome) =>
          fails === 'fails' ? failureText(outcome) : toolOutput(keep(id, outcome)),
        ),
    }),
    played: () => [...played],
    grabs: () => [...grabs.values()],
  }
}
