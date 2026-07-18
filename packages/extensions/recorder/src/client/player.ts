import {type Accessor} from 'solid-js'
import {z} from 'zod'
import type {eventWithTime} from '@rrweb/types'
import playerCss from 'rrweb-player/dist/style.css?inline'
import rrwebCss from 'rrweb/dist/style.css?inline'
import themeCss from './player-theme.css?inline'
import Player from 'rrweb-player'
import type {RrwebEvent} from '../shared/protocol.js'
import {computeIdleSpans, idleSpanAt} from './inactivity.js'

const playerEvent = z.custom<eventWithTime>()
const playerEvents = z.array(playerEvent)
const metaSize = z.object({width: z.number(), height: z.number()})
const timePayload = z.number()

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
    playing = payload === 'playing'
  })
  player.addEventListener('ui-update-current-time', (payload) => {
    if (!playing || !skipIdle()) return
    const parsed = timePayload.safeParse(payload)
    if (!parsed.success) return
    const span = idleSpanAt(spans, parsed.data)
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

export type PanelPlayerMode = 'following' | 'paused'

export type PanelPlayerHandle = {
  pause: () => void
  goLive: () => void
  dispose: () => void
}

export function mountPanelPlayer(
  container: HTMLDivElement,
  initial: RrwebEvent[],
  hooks: {
    pull: (sinceTs: number) => Promise<RrwebEvent[]>
    requestSnapshot: () => Promise<void>
    onMode: (mode: PanelPlayerMode) => void
  },
): PanelPlayerHandle {
  const {scope, known} = injectPlayerStyles(container)
  const buffer = [...initial]
  let cursor = buffer.at(-1)?.timestamp ?? 0
  let aspect = recordedAspect(buffer)
  let mode: PanelPlayerMode = 'following'
  let player: Player | undefined
  let stopped = false
  let poll: ReturnType<typeof setTimeout> | undefined

  const build = (nextMode: PanelPlayerMode): void => {
    player?.$destroy()
    aspect = recordedAspect(buffer)
    const following = nextMode === 'following'
    player = new Player({
      target: container,
      props: {
        ...playerSize(container, aspect),
        events: playerEvents.parse(buffer),
        autoPlay: false,
        showController: !following,
        ...(following ? {liveMode: true} : {}),
      },
    })
    demoteInjectedStyles(scope, known)
    const pastTail = player.getMetaData().totalTime + 1
    if (following) {
      player.getReplayer().pause(pastTail)
      player.getReplayer().startLive(cursor)
    }
    if (!following) player.goto(pastTail, false)
    mode = nextMode
    hooks.onMode(nextMode)
  }

  let connectFrame = 0
  const buildWhenConnected = (): void => {
    if (stopped) return
    if (!container.isConnected) {
      connectFrame = requestAnimationFrame(buildWhenConnected)
      return
    }
    build('following')
  }
  buildWhenConnected()

  const tick = async (): Promise<void> => {
    const fresh = await hooks.pull(cursor).catch((): RrwebEvent[] => [])
    if (stopped) return
    for (const event of fresh) {
      buffer.push(event)
      player?.addEvent(playerEvent.parse(event))
      cursor = Math.max(cursor, event.timestamp)
    }
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
    pause: () => {
      if (mode !== 'following') return
      build('paused')
    },
    goLive: () => {
      if (mode !== 'paused') return
      build('following')
      void hooks.requestSnapshot().catch(() => {})
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
  const aspect = recordedAspect(events)
  const player = new Player({
    target: container,
    props: {...playerSize(container, aspect), events: playerEvents.parse(events), autoPlay: false},
  })
  demoteInjectedStyles(scope, known)
  skipIdlePlayback(player, events, skipIdle)
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
