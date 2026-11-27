import {
  SemanticSnapshotSchema,
  WidgetDrive,
  type SemanticNode,
  type WidgetOutcome,
  type WidgetRequest,
} from '@conciv/protocol/simulation'
import type {Publish} from './demo-events'
import {pause} from './demo-time'

const CALL = `rpc.${WidgetDrive.id}.call` as const

const ANSWER_WAIT_MS = 2000

const ATTEMPTS = 3

const FIND_WAIT_MS = 150

const FIND_ATTEMPTS = 40

const ResultInput = WidgetDrive.methods.result.input

const PAGE_ROLES: Readonly<Record<string, string>> = {
  heading: 'h1,h2,h3,h4,h5,h6',
  button: 'button',
  link: 'a[href]',
}

export type Drive = {
  readonly answer: (input: unknown) => void
  readonly click: (role: string, label: string, signal: AbortSignal) => Promise<void>
  readonly send: (text: string, signal: AbortSignal) => Promise<void>
  readonly point: (role: string, label: string, signal: AbortSignal) => Promise<void>
}

function noAnswer(): never {
  throw new Error('the widget did not answer the playground')
}

function pointerAt(element: Element): MouseEventInit {
  const rect = element.getBoundingClientRect()
  return {
    bubbles: true,
    composed: true,
    cancelable: true,
    clientX: rect.x + rect.width / 2,
    clientY: rect.y + rect.height / 2,
    button: 0,
  }
}

function pageElement(role: string, label: string): Element | undefined {
  const selector = PAGE_ROLES[role]
  if (selector === undefined) return undefined
  return Array.from(document.querySelectorAll(selector)).find((element) => element.textContent.trim() === label)
}

export function createDrive(publish: Publish): Drive {
  const pending = new Map<string, (outcome: WidgetOutcome) => void>()
  const ask = async (request: WidgetRequest, attempt: number, signal: AbortSignal): Promise<unknown> => {
    const requestId = crypto.randomUUID()
    const answered = Promise.withResolvers<WidgetOutcome | undefined>()
    pending.set(requestId, answered.resolve)
    publish(CALL, {requestId, request})
    const outcome = await Promise.race([answered.promise, pause(ANSWER_WAIT_MS, signal).then(() => undefined)])
    pending.delete(requestId)
    if (outcome === undefined)
      return attempt < ATTEMPTS && !signal.aborted ? ask(request, attempt + 1, signal) : noAnswer()
    if (outcome.type === 'failure') throw new Error(outcome.message)
    return outcome.value
  }
  const find = async (role: string, label: string, attempt: number, signal: AbortSignal): Promise<SemanticNode> => {
    const snapshot = SemanticSnapshotSchema.parse(await ask({type: 'ui.snapshot'}, 1, signal))
    const found = snapshot.nodes.find((node) => node.role === role && node.label === label && node.disabled !== true)
    if (found !== undefined) return found
    if (attempt >= FIND_ATTEMPTS || signal.aborted) throw new Error(`the widget shows no ${role} named ${label}`)
    await pause(FIND_WAIT_MS, signal)
    return find(role, label, attempt + 1, signal)
  }
  const click = async (role: string, label: string, signal: AbortSignal): Promise<void> => {
    const node = await find(role, label, 1, signal)
    const semantic =
      node.instance === undefined
        ? {id: node.id, element: node.element}
        : {id: node.id, instance: node.instance, element: node.element}
    await ask({type: 'ui.click', target: node.element, x: 0, y: 0, semantic}, 1, signal)
  }
  const send = async (text: string, signal: AbortSignal): Promise<void> => {
    const node = await find('textbox', 'Message the conciv agent', 1, signal)
    await ask({type: 'ui.focus', target: node.element}, 1, signal)
    await ask({type: 'ui.type', text}, 1, signal)
    await ask({type: 'ui.enter'}, 1, signal)
  }
  const point = async (role: string, label: string, signal: AbortSignal): Promise<void> => {
    const element = pageElement(role, label)
    if (element === undefined) throw new Error(`the page shows no ${role} named ${label}`)
    const at = pointerAt(element)
    element.dispatchEvent(new PointerEvent('pointermove', {...at, pointerType: 'mouse', isPrimary: true}))
    element.dispatchEvent(new MouseEvent('mousemove', at))
    await pause(FIND_WAIT_MS, signal)
    element.dispatchEvent(new PointerEvent('pointerdown', {...at, pointerType: 'mouse', isPrimary: true}))
    element.dispatchEvent(new MouseEvent('mousedown', at))
    element.dispatchEvent(new PointerEvent('pointerup', {...at, pointerType: 'mouse', isPrimary: true}))
    element.dispatchEvent(new MouseEvent('mouseup', at))
    element.dispatchEvent(new MouseEvent('click', at))
  }
  return {
    answer: (input) => {
      const parsed = ResultInput.parse(input)
      pending.get(parsed.requestId)?.(parsed.outcome)
    },
    click,
    send,
    point,
  }
}
