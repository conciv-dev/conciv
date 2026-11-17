import {z} from 'zod'
import type {MountedSession} from '@conciv/plugin/experimental'
import {Command, Control, Definition, Outcome, type Tab} from '../rpc.js'
import type {TanstackOperations} from './operations.js'

export type AttachmentOutcome = 'born' | 'closed' | 'missing' | 'refused' | 'replaced' | 'unavailable' | 'unsupported'

export type AttachmentEnd = {readonly outcome: AttachmentOutcome; readonly attached: boolean}

const CONTROL: `rpc.${typeof Definition.id}.control` = `rpc.${Definition.id}.control`

const STATE_RETRY_MS = 250

const STATE_RETRY_MAX_MS = 10_000

const ControlHeader = z.object({type: z.string(), connectionId: z.string()})

const RpcFailure = z.object({type: z.string()})

const UNSUPPORTED: Outcome = {
  type: 'failure',
  code: 'unsupported',
  message:
    'This page does not support the requested tanstack operation. Ask the user to reload the page so it runs the same conciv version as the engine, or use another operation.',
}

function attachmentFailure(cause: unknown): AttachmentOutcome {
  const type = RpcFailure.safeParse(cause).data?.type

  if (type === 'missing') return 'missing'

  if (type === 'unavailable') return 'refused'

  if (type === 'rpc.unavailable') return 'unavailable'

  if (type === 'rpc.method_not_found' || type === 'rpc.invalid_input') return 'unsupported'

  return 'closed'
}

function retryable(cause: unknown) {
  const type = RpcFailure.safeParse(cause).data?.type

  return type !== 'unavailable' && type !== 'rpc.unavailable'
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)

    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      {once: true},
    )
  })
}

export async function openAttachment(input: {
  readonly session: MountedSession
  readonly connectionId: string
  readonly tab: () => Tab
  readonly changed: (report: () => void, signal: AbortSignal) => void
  readonly operations: TanstackOperations
  readonly signal: AbortSignal
  readonly retryMs: number
}): Promise<AttachmentEnd> {
  const client = input.session.server.client
  const rpc = client.rpc(Definition)
  const attachment = {sessionId: input.session.id, connectionId: input.connectionId}
  const stop = new AbortController()
  const ended = AbortSignal.any([input.signal, stop.signal])
  const options = {signal: ended}
  const requests = new Map<string, AbortController>()
  const status = {attached: false}
  const outbound = {last: Promise.resolve()}

  const send = (effect: () => Promise<unknown>) => {
    const sent = outbound.last.then(effect)

    outbound.last = sent.then(
      () => undefined,
      (cause: unknown) => {
        if (!ended.aborted) console.warn('[conciv] tanstack send failed', cause)
      },
    )

    return sent.then(
      () => true,
      () => false,
    )
  }

  const reply = (requestId: string, outcome: Outcome) =>
    send(() => rpc.result({...attachment, requestId, outcome: z.encode(Outcome, outcome)}))

  const sendState = (state: Tab) =>
    send(async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await rpc.state({...attachment, state}, options)
        } catch (cause) {
          if (ended.aborted || !retryable(cause)) throw cause
          await pause(Math.min(STATE_RETRY_MS * 2 ** attempt, STATE_RETRY_MAX_MS), ended)
        }
      }
    })

  const report = () => {
    if (status.attached && !ended.aborted) void sendState(input.tab())
  }

  const run = async (requestId: string, abort: AbortController) => {
    try {
      const raw = await rpc.command({...attachment, requestId}, options)
      const command = Command.safeParse(raw)

      if (!command.success) return void (await reply(requestId, UNSUPPORTED))
      const outcome = await input.operations.execute(command.data, AbortSignal.any([ended, abort.signal]))

      if (ended.aborted) return
      await reply(requestId, outcome)
    } catch (cause) {
      if (!ended.aborted && !abort.signal.aborted) console.warn('[conciv] tanstack command failed', cause)
    } finally {
      requests.delete(requestId)
    }
  }

  const receive = (control: Control) => {
    if (control.type === 'attached') {
      status.attached = true
      report()

      return
    }

    if (control.type === 'cancel') return requests.get(control.requestId)?.abort()
    const abort = new AbortController()

    requests.set(control.requestId, abort)
    void run(control.requestId, abort)
  }

  const read = async (connected: PromiseWithResolvers<void>): Promise<AttachmentOutcome> => {
    for await (const event of client.event.subscribe({types: [CONTROL, 'session.created'], signal: ended})) {
      if (event.type === 'server.connected') {
        connected.resolve()
        continue
      }
      if (event.type === 'session.created') {
        if (event.data.sessionID === input.session.id) return 'born'
        continue
      }
      const header = ControlHeader.safeParse(event.data)

      if (!header.success || header.data.connectionId !== input.connectionId) continue
      const control = Control.safeParse(event.data)

      if (control.success) receive(control.data)
      else if (header.data.type === 'attached') return 'unsupported'
    }

    return 'closed'
  }

  input.changed(report, ended)

  try {
    const connected = Promise.withResolvers<void>()
    const reading = read(connected)
    const attached = connected.promise.then(() => rpc.attach({...attachment, version: 1}, options))
    const outcome = await Promise.race([attached, reading]).then(
      (result): AttachmentOutcome =>
        result === 'replaced' || result === 'unsupported' || result === 'born' ? result : 'closed',
      attachmentFailure,
    )

    if (outcome === 'missing') return {outcome: await reading, attached: false}

    if (outcome === 'refused' && status.attached) return {outcome: 'closed', attached: true}

    if (outcome === 'refused') {
      const retried = pause(input.retryMs, ended).then((): AttachmentOutcome => 'refused')
      return {outcome: await Promise.race([reading, retried]), attached: false}
    }

    return {outcome, attached: status.attached}
  } finally {
    stop.abort()
    requests.forEach((request) => request.abort())
    requests.clear()
  }
}
