import {
  SemanticSnapshotSchema,
  WidgetDrive,
  type SemanticNode,
  type WidgetOutcome,
  type WidgetRequest,
} from '@conciv/protocol/simulation'
import {aborted} from './pace'

const CALL = `rpc.${WidgetDrive.id}.call` as const

const ResultInput = WidgetDrive.methods.result.input

const PAGE_ROLES: Readonly<Record<string, string>> = {
  heading: 'h1,h2,h3,h4,h5,h6',
  button: 'button',
  link: 'a[href]',
}

const WATCHED: MutationObserverInit = {subtree: true, childList: true, attributes: true, characterData: true}

type Emit = (type: `rpc.${string}`, data: Record<string, unknown>) => void

export type Drive = {
  readonly answer: (input: unknown) => void
  readonly click: (role: string, label: string, signal: AbortSignal) => Promise<void>
  readonly shown: (role: string, label: string, signal: AbortSignal) => Promise<void>
  readonly send: (text: string, signal: AbortSignal) => Promise<void>
  readonly hover: (role: string, label: string) => void
  readonly press: (role: string, label: string) => void
}

function stopped(signal: AbortSignal): never {
  throw new Error('the playground stopped', {cause: signal.reason})
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

function pageElement(role: string, label: string): Element {
  const selector = PAGE_ROLES[role]
  const found =
    selector === undefined
      ? undefined
      : Array.from(document.querySelectorAll(selector)).find((element) => element.textContent.trim() === label)
  if (found === undefined) throw new Error(`the page shows no ${role} named ${label}`)
  return found
}

function pointer(type: string, at: MouseEventInit): PointerEvent {
  return new PointerEvent(type, {...at, pointerType: 'mouse', isPrimary: true})
}

function watchChanges(root: Node) {
  const state = {next: Promise.withResolvers<void>()}
  const observer = new MutationObserver(() => state.next.resolve())
  observer.observe(root, WATCHED)
  return {
    reset: () => {
      state.next = Promise.withResolvers<void>()
    },
    changed: (signal: AbortSignal) => Promise.race([state.next.promise, aborted(signal)]),
    stop: () => observer.disconnect(),
  }
}

function matchNode(nodes: readonly SemanticNode[], role: string, label: string): SemanticNode | undefined {
  return nodes.find((node) => node.role === role && node.label === label && node.disabled !== true)
}

export function createDrive(emit: Emit, root: Node, listening: Promise<unknown>): Drive {
  const pending = new Map<string, (outcome: WidgetOutcome) => void>()
  const ask = async (request: WidgetRequest, signal: AbortSignal): Promise<unknown> => {
    await Promise.race([listening, aborted(signal)])
    if (signal.aborted) stopped(signal)
    const requestId = crypto.randomUUID()
    const answered = Promise.withResolvers<WidgetOutcome | undefined>()
    pending.set(requestId, answered.resolve)
    emit(CALL, {requestId, request})
    const outcome = await Promise.race([answered.promise, aborted(signal).then(() => undefined)])
    pending.delete(requestId)
    if (outcome === undefined) return stopped(signal)
    if (outcome.type === 'failure') throw new Error(outcome.message)
    return outcome.value
  }
  const find = async (role: string, label: string, signal: AbortSignal): Promise<SemanticNode> => {
    const changes = watchChanges(root)
    try {
      for (;;) {
        changes.reset()
        const snapshot = SemanticSnapshotSchema.parse(await ask({type: 'ui.snapshot'}, signal))
        const found = matchNode(snapshot.nodes, role, label)
        if (found !== undefined) return found
        await changes.changed(signal)
        if (signal.aborted) stopped(signal)
      }
    } finally {
      changes.stop()
    }
  }
  const click = async (role: string, label: string, signal: AbortSignal): Promise<void> => {
    const node = await find(role, label, signal)
    const semantic =
      node.instance === undefined
        ? {id: node.id, element: node.element}
        : {id: node.id, instance: node.instance, element: node.element}
    await ask({type: 'ui.click', target: node.element, x: 0, y: 0, semantic}, signal)
  }
  const send = async (text: string, signal: AbortSignal): Promise<void> => {
    const node = await find('textbox', 'Message the conciv agent', signal)
    await ask({type: 'ui.focus', target: node.element}, signal)
    await ask({type: 'ui.type', text}, signal)
    await ask({type: 'ui.enter'}, signal)
  }
  const hover = (role: string, label: string): void => {
    const element = pageElement(role, label)
    const at = pointerAt(element)
    element.dispatchEvent(pointer('pointermove', at))
    element.dispatchEvent(new MouseEvent('mousemove', at))
  }
  const press = (role: string, label: string): void => {
    const element = pageElement(role, label)
    const at = pointerAt(element)
    element.dispatchEvent(pointer('pointerdown', at))
    element.dispatchEvent(new MouseEvent('mousedown', at))
    element.dispatchEvent(pointer('pointerup', at))
    element.dispatchEvent(new MouseEvent('mouseup', at))
    element.dispatchEvent(new MouseEvent('click', at))
  }
  return {
    answer: (input) => {
      const parsed = ResultInput.parse(input)
      pending.get(parsed.requestId)?.(parsed.outcome)
    },
    click,
    shown: async (role, label, signal) => {
      await find(role, label, signal)
    },
    send,
    hover,
    press,
  }
}
