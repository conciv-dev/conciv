import {implement} from '@orpc/server'
import {RPCHandler} from '@orpc/server/websocket'
import {AsyncRetryer} from '@tanstack/pacer'
import {dispatchHandshake, PROTOCOL_VERSION, uiContract, type UiCapability} from '@conciv/protocol/simulation'
import {createWidgetDom, type DriveRoot, type WidgetDom} from './widget-dom.js'

export type {DriveRoot} from './widget-dom.js'

export type Drive = {readonly close: () => void}

const WIDGET_CAPABILITIES: readonly UiCapability[] = [
  'ui.type',
  'ui.press',
  'ui.enter',
  'ui.arrow',
  'ui.focus',
  'ui.click',
  'ui.click.semantic',
  'ui.matches',
  'ui.state',
  'ui.snapshot',
]

const ARROW_KEYS = {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'} as const

function painted(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function makeRouter(dom: WidgetDom) {
  const os = implement(uiContract)
  const act = (errors: {UI_ACTION_FAILED: (options: {message: string}) => Error}, action: () => void) => {
    try {
      action()
    } catch (error) {
      throw errors.UI_ACTION_FAILED({message: error instanceof Error ? error.message : String(error)})
    }
    return painted().then(dom.state)
  }
  const unsupported = (errors: {UI_ACTION_FAILED: (options: {message: string}) => Error}, name: string): never => {
    throw errors.UI_ACTION_FAILED({message: `the widget does not support ${name}`})
  }
  return os.router({
    handshake: os.handshake.handler(({input, errors}) => {
      const outcome = dispatchHandshake(
        {
          role: 'ui',
          server: {name: 'conciv-widget', version: String(PROTOCOL_VERSION)},
          capabilities: WIDGET_CAPABILITIES,
        },
        input,
      )
      if (outcome.type === 'accepted') return outcome.response
      const refused = outcome.refusal
      if (refused.code === 'ROLE_MISMATCH') throw errors.ROLE_MISMATCH(refused)
      if (refused.code === 'UNSUPPORTED_PROTOCOL') throw errors.UNSUPPORTED_PROTOCOL(refused)
      throw errors.MISSING_CAPABILITY(refused)
    }),
    ui: {
      state: os.ui.state.handler(() => dom.state()),
      snapshot: os.ui.snapshot.handler(() => dom.snapshot()),
      matches: os.ui.matches.handler(({input}) => dom.matches(input.text)),
      type: os.ui.type.handler(({input, errors}) => act(errors, () => dom.type(input.text))),
      press: os.ui.press.handler(({input, errors}) => act(errors, () => dom.press(input.key, input.modifiers))),
      enter: os.ui.enter.handler(({errors}) => act(errors, () => dom.press('enter'))),
      arrow: os.ui.arrow.handler(({input, errors}) => act(errors, () => dom.press(ARROW_KEYS[input.direction]))),
      focus: os.ui.focus.handler(({input, errors}) => act(errors, () => dom.focus(input.target))),
      click: os.ui.click.handler(({input, errors}) => act(errors, () => dom.click(input))),
      capture: os.ui.capture.handler(({errors}) => unsupported(errors, 'ui.capture')),
      recording: {finish: os.ui.recording.finish.handler(({errors}) => unsupported(errors, 'ui.recording.finish'))},
      mouse: os.ui.mouse.handler(({errors}) => unsupported(errors, 'ui.mouse')),
      resize: os.ui.resize.handler(({errors}) => unsupported(errors, 'ui.resize')),
    },
  })
}

function opened(socket: WebSocket): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(socket), {once: true})
    socket.addEventListener(
      'error',
      () => reject(new Error(`the widget could not reach the driver at ${socket.url}`)),
      {
        once: true,
      },
    )
  })
}

export function startDrive(endpoint: string, root: DriveRoot): Drive {
  const handler = new RPCHandler(makeRouter(createWidgetDom(root)))
  const connection: {closed: boolean; socket: WebSocket | undefined} = {closed: false, socket: undefined}
  const joinDriver = async (): Promise<void> => {
    const socket = await opened(new WebSocket(endpoint))
    if (connection.closed) {
      socket.close()
      return
    }
    connection.socket = socket
    handler.upgrade(socket)
    socket.addEventListener('close', () => {
      if (!connection.closed) void retryer.execute()
    })
  }
  const retryer = new AsyncRetryer(joinDriver, {
    maxAttempts: Number.POSITIVE_INFINITY,
    backoff: 'exponential',
    baseWait: 250,
    maxWait: 5000,
    throwOnError: false,
  })
  void retryer.execute()
  return {
    close: () => {
      connection.closed = true
      retryer.abort()
      connection.socket?.close()
    },
  }
}
