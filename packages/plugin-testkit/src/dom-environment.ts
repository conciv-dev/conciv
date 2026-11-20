import {builtinEnvironments} from 'vitest/runtime'
import type {Environment} from 'vitest/runtime'

type DomWindow = Window & typeof globalThis

function windowBox(window: DomWindow): {width: number; height: number} {
  return {width: window.innerWidth, height: window.innerHeight}
}

function resizeObserverEntry(window: DomWindow, target: Element): ResizeObserverEntry {
  const {width, height} = windowBox(window)
  const size = [{inlineSize: width, blockSize: height}]
  return {
    target,
    contentRect: new window.DOMRectReadOnly(0, 0, width, height),
    borderBoxSize: size,
    contentBoxSize: size,
    devicePixelContentBoxSize: size,
  }
}

function makeResizeObserverConstructor(window: DomWindow): (callback: ResizeObserverCallback) => ResizeObserver {
  return function ResizeObserver(callback: ResizeObserverCallback): ResizeObserver {
    const observed = new Set<Element>()
    const observer: ResizeObserver = {
      observe: (target) => {
        observed.add(target)
        queueMicrotask(() => {
          if (observed.has(target)) callback([resizeObserverEntry(window, target)], observer)
        })
      },
      unobserve: (target) => {
        observed.delete(target)
      },
      disconnect: () => observed.clear(),
    }
    return observer
  }
}

function replaceWindowProperty(window: DomWindow, key: 'ResizeObserver' | 'WebSocket', value: unknown): void {
  if (!Reflect.set(window, key, value)) throw new Error(`the happy-dom window refused a replacement ${key}`)
}

function installResizeObserver(window: DomWindow): void {
  replaceWindowProperty(window, 'ResizeObserver', makeResizeObserverConstructor(window))
}

function installElementSizes(window: DomWindow): void {
  Object.defineProperties(window.HTMLElement.prototype, {
    clientWidth: {configurable: true, get: () => windowBox(window).width},
    clientHeight: {configurable: true, get: () => windowBox(window).height},
  })
}

function installFonts(window: DomWindow): void {
  const faces = new Set<FontFace>()
  const fonts = Object.assign(new window.EventTarget(), {
    status: 'loaded',
    onloading: null,
    onloadingdone: null,
    onloadingerror: null,
    check: () => true,
    load: () => Promise.resolve([]),
    add: (face: FontFace) => {
      faces.add(face)
      return fonts
    },
    delete: (face: FontFace) => faces.delete(face),
    has: (face: FontFace) => faces.has(face),
    clear: () => faces.clear(),
    forEach: (each: (face: FontFace, key: FontFace, set: Set<FontFace>) => void) => faces.forEach(each),
    entries: () => faces.entries(),
    keys: () => faces.keys(),
    values: () => faces.values(),
    [Symbol.iterator]: () => faces.values(),
  })
  Object.defineProperties(fonts, {
    ready: {value: Promise.resolve(fonts)},
    size: {get: () => faces.size},
  })
  Object.defineProperty(window.document, 'fonts', {configurable: true, value: fonts})
}

type NodeEvents = {WebSocket: typeof WebSocket; Event: typeof Event}

function nodeBrandedWebSocket(node: NodeEvents): (url: string | URL, protocols?: string | string[]) => WebSocket {
  const dispatch = node.WebSocket.prototype.dispatchEvent
  const WebSocket = function WebSocket(url: string | URL, protocols?: string | string[]): WebSocket {
    const socket = new node.WebSocket(url, protocols)
    Object.defineProperty(socket, 'dispatchEvent', {
      value: (event: {type: string}) =>
        dispatch.call(socket, event instanceof node.Event ? event : new node.Event(event.type)),
    })
    return socket
  }
  return Object.assign(WebSocket, {
    prototype: node.WebSocket.prototype,
    CONNECTING: node.WebSocket.CONNECTING,
    OPEN: node.WebSocket.OPEN,
    CLOSING: node.WebSocket.CLOSING,
    CLOSED: node.WebSocket.CLOSED,
  })
}

function installNodeWebSocket(window: DomWindow, node: NodeEvents): void {
  replaceWindowProperty(window, 'WebSocket', nodeBrandedWebSocket(node))
}

function installAutofocusReflection(window: DomWindow): void {
  Object.defineProperty(window.HTMLElement.prototype, 'autofocus', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('autofocus')
    },
    set(this: HTMLElement, value: unknown) {
      this.toggleAttribute('autofocus', Boolean(value))
    },
  })
}

const DATA_FORMAT_ALIASES: Record<string, string> = {text: 'text/plain', url: 'text/uri-list'}

function installStringOnlyGetData(window: DomWindow): void {
  Object.defineProperty(window.DataTransfer.prototype, 'getData', {
    configurable: true,
    value(this: DataTransfer, format: string): string {
      const lower = format.toLowerCase()
      const wanted = DATA_FORMAT_ALIASES[lower] ?? lower
      const item = Array.from(this.items).find(
        (entry) => entry.kind === 'string' && entry.type.toLowerCase() === wanted,
      )
      const data = {text: ''}
      item?.getAsString((text) => {
        data.text = text
      })
      return data.text
    },
  })
}

function installHandledAnimationFinished(window: DomWindow): void {
  const cancel = window.Animation.prototype.cancel
  Object.defineProperty(window.Animation.prototype, 'cancel', {
    configurable: true,
    value(this: Animation): void {
      this.finished.catch(() => undefined)
      cancel.call(this)
    },
  })
}

function installNodeStorage(global: typeof globalThis, storage: Storage): void {
  Object.defineProperty(global, 'localStorage', {configurable: true, enumerable: true, get: () => storage})
}

const happyDom = builtinEnvironments['happy-dom']

const environment: Environment = {
  name: 'conciv-happy-dom',
  viteEnvironment: happyDom.viteEnvironment,
  async setup(global, options) {
    const node: NodeEvents = {WebSocket: global.WebSocket, Event: global.Event}
    const nodeStorage: Storage = global.sessionStorage
    const happy = await happyDom.setup(global, options)
    const window: DomWindow = global.window
    installNodeStorage(global, nodeStorage)
    installAutofocusReflection(window)
    installStringOnlyGetData(window)
    installHandledAnimationFinished(window)
    installNodeWebSocket(window, node)
    installFonts(window)
    installResizeObserver(window)
    installElementSizes(window)
    return happy
  },
}

export default environment
