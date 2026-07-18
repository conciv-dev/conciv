import {type Accessor} from 'solid-js'
import {z} from 'zod'
import type {eventWithTime} from '@rrweb/types'
import playerCss from 'rrweb-player/dist/style.css?inline'
import rrwebCss from 'rrweb/dist/style.css?inline'
import themeCss from './player-theme.css?inline'
import Player from 'rrweb-player'
import {RrwebEventSchema, type RrwebEvent} from '../shared/protocol.js'
import {computeIdleSpans, idleSpanAt} from './inactivity.js'

const playerEvent = z.custom<eventWithTime>()
const playerEvents = z.array(playerEvent)

function detachEvents(events: RrwebEvent[]): RrwebEvent[] {
  return z.array(RrwebEventSchema).parse(JSON.parse(JSON.stringify(events)))
}
const metaSize = z.object({width: z.number(), height: z.number()})
const controllerTime = z.object({payload: z.number()})
const controllerState = z.object({payload: z.string()})

const FALLBACK_WIDTH = 620
const FALLBACK_ASPECT = 0.62
const PLAYER_CONTROLLER_HEIGHT = 80
const MIN_FRAME_HEIGHT = 120

function recordedAspect(events: RrwebEvent[]): number {
  const parsed = metaSize.safeParse(events.find((event) => event.type === 4)?.data)
  if (!parsed.success || parsed.data.width <= 0) return FALLBACK_ASPECT
  return parsed.data.height / parsed.data.width
}

function playerSize(container: HTMLDivElement, aspect: number): {width: number; height: number} {
  const availableWidth = container.clientWidth || FALLBACK_WIDTH
  const availableHeight = container.clientHeight || Math.round(availableWidth * aspect) + PLAYER_CONTROLLER_HEIGHT
  const frameBudget = Math.max(availableHeight - PLAYER_CONTROLLER_HEIGHT, MIN_FRAME_HEIGHT)
  const width = Math.min(availableWidth, Math.round(frameBudget / aspect))
  return {width, height: Math.round(width * aspect)}
}

function skipIdlePlayback(player: Player, events: RrwebEvent[], skipIdle: Accessor<boolean>): void {
  const spans = computeIdleSpans(events)
  if (!spans.length) return
  let playing = false
  player.addEventListener('ui-update-player-state', (payload) => {
    const parsed = controllerState.safeParse(payload)
    playing = parsed.success && parsed.data.payload === 'playing'
  })
  player.addEventListener('ui-update-current-time', (payload) => {
    if (!playing || !skipIdle()) return
    const parsed = controllerTime.safeParse(payload)
    if (!parsed.success) return
    const span = idleSpanAt(spans, parsed.data.payload)
    if (span) player.goto(span.endMs, true)
  })
}

function styleScope(container: HTMLDivElement): Document | ShadowRoot {
  const root = container.getRootNode()
  return root instanceof ShadowRoot ? root : document
}

function demoteInjectedStyles(scope: Document | ShadowRoot, known: Set<Element>): void {
  for (const injected of scope.querySelectorAll('style')) {
    if (known.has(injected)) continue
    injected.textContent = `@layer rrweb {\n${injected.textContent ?? ''}\n}`
    known.add(injected)
  }
}

function injectPlayerStyles(container: HTMLDivElement): {scope: Document | ShadowRoot; known: Set<Element>} {
  const scope = styleScope(container)
  const known = new Set<Element>(scope.querySelectorAll('style'))
  const style = document.createElement('style')
  style.textContent = `@layer rrweb {\n${rrwebCss}\n${playerCss}\n}\n${themeCss}`
  container.appendChild(style)
  known.add(style)
  return {scope, known}
}

function observeContainerSize(
  container: HTMLDivElement,
  resize: (size: {width: number; height: number}) => void,
  aspect: () => number,
): () => void {
  let frame = 0
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      if (document.fullscreenElement) return
      const size = playerSize(container, aspect())
      if (size.width < 80) return
      resize(size)
    })
  })
  observer.observe(container)
  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
}

const LIVE_POLL_MS = 1000
const SCRUB_STEP_MS = 5000

const scrubStep = z.union([z.literal('ArrowLeft'), z.literal('ArrowRight')])

function enhanceControllerAccess(container: HTMLDivElement, player: Player): void {
  const buttons = container.querySelectorAll('.rr-controller__btns > button')
  buttons[0]?.setAttribute('aria-label', 'Toggle playback')
  if (buttons.length > 1) buttons[buttons.length - 1]?.setAttribute('aria-label', 'Toggle fullscreen')
  const progress = container.querySelector('.rr-progress')
  if (!(progress instanceof HTMLElement)) return
  progress.setAttribute('role', 'slider')
  progress.setAttribute('aria-label', 'Timeline')
  progress.tabIndex = 0
  let current = 0
  player.addEventListener('ui-update-current-time', (payload) => {
    const parsed = controllerTime.safeParse(payload)
    if (parsed.success) current = parsed.data.payload
  })
  container.addEventListener(
    'keydown',
    (event) => {
      if (!(event.target instanceof Node) || !progress.contains(event.target)) return
      const key = scrubStep.safeParse(event.key)
      if (!key.success) return
      event.stopPropagation()
      const total = player.getMetaData().totalTime
      const delta = key.data === 'ArrowLeft' ? -SCRUB_STEP_MS : SCRUB_STEP_MS
      player.goto(Math.min(Math.max(current + delta, 0), total))
    },
    true,
  )
}

const LIVE_EDGE_MS = 2500

export type StreamPlayerHandle = {
  goLive: () => void
  dispose: () => void
}

export function mountStreamPlayer(
  container: HTMLDivElement,
  initial: RrwebEvent[],
  hooks: {
    pull: (sinceTs: number) => Promise<RrwebEvent[]>
    onLive: (live: boolean) => void
  },
): StreamPlayerHandle {
  const {scope, known} = injectPlayerStyles(container)
  const buffer = detachEvents(initial)
  let cursor = buffer.at(-1)?.timestamp ?? 0
  let aspect = recordedAspect(buffer)
  let player: Player | undefined
  let stopped = false
  let poll: ReturnType<typeof setTimeout> | undefined

  const tailOffset = (): number => cursor - (buffer[0]?.timestamp ?? 0)

  const isLive = (): boolean => {
    if (!player) return true
    const replayer = player.getReplayer()
    if (!replayer.service.state.matches('playing')) return false
    return replayer.getCurrentTime() + LIVE_EDGE_MS >= tailOffset()
  }

  const announceLive = (): void => hooks.onLive(isLive())

  const build = (): void => {
    aspect = recordedAspect(buffer)
    player = new Player({
      target: container,
      props: {
        ...playerSize(container, aspect),
        events: playerEvents.parse(buffer),
        autoPlay: false,
        liveMode: true,
        showController: true,
        skipInactive: false,
      },
    })
    demoteInjectedStyles(scope, known)
    enhanceControllerAccess(container, player)
    player.goto(tailOffset() + 1, true)
    player.addEventListener('ui-update-player-state', announceLive)
    player.addEventListener('ui-update-current-time', announceLive)
    hooks.onLive(true)
  }

  let connectFrame = 0
  const buildWhenConnected = (): void => {
    if (stopped) return
    if (!container.isConnected) {
      connectFrame = requestAnimationFrame(buildWhenConnected)
      return
    }
    build()
  }
  buildWhenConnected()

  const tick = async (): Promise<void> => {
    const fresh = await hooks.pull(cursor).catch((): RrwebEvent[] => [])
    if (stopped) return
    const atEdge = isLive()
    for (const event of fresh) {
      buffer.push(event)
      if (player) {
        if (atEdge) player.getReplayer().addEvent(playerEvent.parse(event))
        if (!atEdge) player.addEvent(playerEvent.parse(event))
      }
      cursor = Math.max(cursor, event.timestamp)
    }
    announceLive()
    poll = setTimeout(() => void tick(), LIVE_POLL_MS)
  }
  poll = setTimeout(() => void tick(), LIVE_POLL_MS)

  const stopResize = observeContainerSize(
    container,
    (size) => {
      player?.$set({width: size.width, height: size.height})
      player?.triggerResize()
    },
    () => aspect,
  )

  return {
    goLive: () => {
      player?.goto(tailOffset() + 1, true)
      hooks.onLive(true)
    },
    dispose: () => {
      stopped = true
      cancelAnimationFrame(connectFrame)
      if (poll) clearTimeout(poll)
      stopResize()
      player?.$destroy()
    },
  }
}

export function mountPlayer(container: HTMLDivElement, events: RrwebEvent[], skipIdle: Accessor<boolean>): () => void {
  const {scope, known} = injectPlayerStyles(container)
  const detached = detachEvents(events)
  const aspect = recordedAspect(detached)
  const player = new Player({
    target: container,
    props: {...playerSize(container, aspect), events: playerEvents.parse(detached), autoPlay: false},
  })
  demoteInjectedStyles(scope, known)
  enhanceControllerAccess(container, player)
  skipIdlePlayback(player, detached, skipIdle)
  const stopResize = observeContainerSize(
    container,
    (size) => {
      player.$set({width: size.width, height: size.height})
      player.triggerResize()
    },
    () => aspect,
  )
  return () => {
    stopResize()
    player.$destroy()
  }
}
